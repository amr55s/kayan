'use server';

import { z } from 'zod';
import type { FeedbackImageMode } from '@/types';
import { getCurrentProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeRevalidatePaths } from '@/lib/cache/safe-revalidate';

type ApprovalResult =
  | { success: true; message: string; placeId?: string }
  | { success: false; message: string };

const feedbackApprovalSchema = z.object({
  feedbackId: z.uuid(),
  imageMode: z.enum(['append', 'replace']).default('append'),
});

function refreshDirectory() {
  safeRevalidatePaths('/', '/admin', '/merchant');
}

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (
    !profile ||
    profile.role !== 'admin' ||
    !profile.is_active ||
    profile.must_change_password
  ) {
    throw new Error('admin_access_required');
  }
  return profile;
}

function approvalError(error: unknown): ApprovalResult {
  if (error instanceof z.ZodError) {
    return { success: false, message: 'بيانات طلب الموافقة غير صالحة.' };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('request_already_processed')) {
    return { success: false, message: 'تمت معالجة هذا الطلب بالفعل.' };
  }
  if (message.includes('target_place_required') || message.includes('target_place_missing')) {
    return { success: false, message: 'يجب ربط الطلب بمكان موجود قبل تطبيقه.' };
  }
  if (message.includes('no_applicable_changes')) {
    return { success: false, message: 'لا يحتوي الطلب على هاتف أو صور قابلة للتطبيق.' };
  }
  if (message.includes('replacement_images_required')) {
    return { success: false, message: 'وضع الاستبدال يحتاج إلى صورة واحدة على الأقل.' };
  }
  if (message.includes('invalid_phone')) {
    return { success: false, message: 'رقم الهاتف المقترح غير صالح.' };
  }
  return { success: false, message: 'تعذر تنفيذ الموافقة. حاول مرة أخرى.' };
}

export async function applyFeedbackToPlace(
  feedbackId: string,
  imageMode: FeedbackImageMode = 'append',
): Promise<ApprovalResult> {
  try {
    await requireAdmin();
    const input = feedbackApprovalSchema.parse({ feedbackId, imageMode });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('apply_feedback_to_place', {
      p_feedback_id: input.feedbackId,
      p_image_mode: input.imageMode,
    });
    if (error) throw error;

    refreshDirectory();
    return {
      success: true,
      placeId: data,
      message: 'تم تطبيق التعديل ونشره في ديرتك.',
    };
  } catch (error) {
    return approvalError(error);
  }
}

export async function approvePendingPlace(
  requestId: string,
): Promise<ApprovalResult> {
  try {
    await requireAdmin();
    const id = z.uuid().parse(requestId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('approve_pending_place', {
      p_request_id: id,
    });
    if (error) throw error;

    refreshDirectory();
    return {
      success: true,
      placeId: data,
      message: 'تمت إضافة المكان ونشره في ديرتك.',
    };
  } catch (error) {
    return approvalError(error);
  }
}

export async function resolveFeedbackWithoutChanges(
  feedbackId: string,
): Promise<ApprovalResult> {
  try {
    await requireAdmin();
    const id = z.uuid().parse(feedbackId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('feedback_requests')
      .update({ status: 'resolved' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('request_already_processed');

    refreshDirectory();
    return { success: true, message: 'تم إغلاق الطلب بدون تعديل ديرتك.' };
  } catch (error) {
    return approvalError(error);
  }
}

export async function rejectPendingPlace(
  requestId: string,
): Promise<ApprovalResult> {
  try {
    await requireAdmin();
    const id = z.uuid().parse(requestId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pending_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('request_already_processed');

    safeRevalidatePaths('/admin');
    return { success: true, message: 'تم رفض طلب الإضافة.' };
  } catch (error) {
    return approvalError(error);
  }
}
