'use server';

import { randomUUID } from 'node:crypto';
import { safeRevalidatePaths } from '@/lib/cache/safe-revalidate';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/guards';
import { placeDetailsValidators } from '@/lib/place-details';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  MarketingCampaign,
  MarketingEntityType,
  MarketingTemplateKey,
} from '@/types';

type ActionResult<T = undefined> =
  | { success: true; message: string; data: T }
  | { success: false; message: string };

const channelSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'اكتب اسم الجروب.').max(80),
  whatsappUrl: z.string().trim().max(500).refine(
    placeDetailsValidators.whatsappGroup,
    'استخدم رابط جروب أو قناة WhatsApp رسمي.',
  ),
  notes: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
});

const campaignSchema = z.object({
  channelId: z.string().uuid(),
  entityType: z.enum(['site', 'place', 'driver', 'feature']),
  entityId: z.string().uuid().nullable(),
  templateKey: z.enum([
    'new_place',
    'new_driver',
    'weekly_roundup',
    'merchant_invite',
    'driver_invite',
    'missing_service',
    'data_correction',
    'local_ambassadors',
    'general_site',
  ]),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
}).superRefine((value, context) => {
  const needsEntity = value.entityType === 'place' || value.entityType === 'driver';
  if (needsEntity !== Boolean(value.entityId)) {
    context.addIssue({ code: 'custom', message: 'العنصر المختار غير صالح.' });
  }
});

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== 'admin') {
    throw new Error('admin_access_required');
  }
  return profile;
}

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return /[\u0600-\u06ff]/.test(message) ? message : fallback;
}

export async function saveMarketingChannel(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const adminProfile = await requireAdmin();
    const parsed = channelSchema.parse(input);
    const admin = createAdminClient();
    const values = {
      name: parsed.name,
      whatsapp_url: parsed.whatsappUrl,
      notes: parsed.notes,
      is_active: parsed.isActive,
      updated_at: new Date().toISOString(),
    };

    if (parsed.id) {
      const { data, error } = await (admin as any)
        .from('marketing_channels')
        .update(values)
        .eq('id', parsed.id)
        .select('id')
        .single();
      if (error) throw error;
      safeRevalidatePaths('/admin');
      return { success: true, message: 'تم تحديث الجروب.', data };
    }

    const { data, error } = await (admin as any)
      .from('marketing_channels')
      .insert({
        ...values,
        slug: `group-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        created_by: adminProfile.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    safeRevalidatePaths('/admin');
    return { success: true, message: 'تمت إضافة الجروب.', data };
  } catch (error) {
    return {
      success: false,
      message: errorMessage(error, 'تعذر حفظ الجروب. حاول مرة أخرى.'),
    };
  }
}

export async function setMarketingChannelActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsedId = z.string().uuid().parse(id);
    const admin = createAdminClient();
    const { error } = await (admin as any)
      .from('marketing_channels')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', parsedId);
    if (error) throw error;
    safeRevalidatePaths('/admin');
    return {
      success: true,
      message: isActive ? 'تم تفعيل الجروب.' : 'تم إيقاف الجروب.',
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: errorMessage(error, 'تعذر تحديث حالة الجروب.'),
    };
  }
}

async function findCampaign(input: z.infer<typeof campaignSchema>) {
  const admin = createAdminClient();
  let query = (admin as any)
    .from('marketing_campaigns')
    .select('*')
    .eq('channel_id', input.channelId)
    .eq('entity_type', input.entityType)
    .eq('template_key', input.templateKey);
  query = input.entityId ? query.eq('entity_id', input.entityId) : query.is('entity_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as MarketingCampaign | null;
}

export async function prepareMarketingCampaign(
  input: {
    channelId: string;
    entityType: MarketingEntityType;
    entityId: string | null;
    templateKey: MarketingTemplateKey;
    payload?: Record<string, string | number | boolean>;
  },
): Promise<ActionResult<MarketingCampaign>> {
  try {
    const adminProfile = await requireAdmin();
    const parsed = campaignSchema.parse({ ...input, payload: input.payload ?? {} });
    const existing = await findCampaign(parsed);
    if (existing) {
      return { success: true, message: 'الحملة جاهزة.', data: existing };
    }

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from('marketing_campaigns')
      .insert({
        channel_id: parsed.channelId,
        entity_type: parsed.entityType,
        entity_id: parsed.entityId,
        template_key: parsed.templateKey,
        payload: parsed.payload,
        created_by: adminProfile.id,
      })
      .select('*')
      .single();
    if (error) {
      const raced = await findCampaign(parsed);
      if (raced) return { success: true, message: 'الحملة جاهزة.', data: raced };
      throw error;
    }
    safeRevalidatePaths('/admin');
    return { success: true, message: 'تم تجهيز رابط الحملة.', data };
  } catch (error) {
    return {
      success: false,
      message: errorMessage(error, 'تعذر تجهيز الحملة.'),
    };
  }
}

export async function recordMarketingPublication(
  campaignId: string,
): Promise<ActionResult> {
  try {
    const adminProfile = await requireAdmin();
    const id = z.string().uuid().parse(campaignId);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error: updateError } = await (admin as any)
      .from('marketing_campaigns')
      .update({
        status: 'published',
        last_published_at: now,
        updated_at: now,
      })
      .eq('id', id);
    if (updateError) throw updateError;

    const { error: insertError } = await (admin as any)
      .from('marketing_publications')
      .insert({
        campaign_id: id,
        published_by: adminProfile.id,
        published_at: now,
      });
    if (insertError) throw insertError;
    safeRevalidatePaths('/admin');
    return {
      success: true,
      message: 'تم تسجيل النشر ويمكن إعادة نشر الحملة لاحقًا.',
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: errorMessage(error, 'تعذر تسجيل عملية النشر.'),
    };
  }
}
