'use server';

import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/guards';
import { validateListingImageUrls } from '@/lib/images/urls';
import { authEmailForPhone } from '@/lib/auth/phone';
import { safeRevalidatePaths } from '@/lib/cache/safe-revalidate';
import { processAvatarForStorage } from '@/lib/images/server';
import { toPlainArrayBuffer } from '@/lib/images/buffer';
import {
  branchSchema,
  accountRequestSchema,
  createOrderSchema,
  driverPublicProfileSchema,
  merchantPlaceSchema,
  managedUserSchema,
  profileProvisionSchema,
  statusChangeSchema,
} from './validation';

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; message: string };

const DRIVER_AVATAR_MAX_BYTES = 3_500_000;
const DRIVER_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function actionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const issueMessage = issue?.message ?? '';
    if (/[\u0600-\u06ff]/.test(issueMessage)) {
      return { success: false, message: issueMessage };
    }

    const field = String(issue?.path.at(-1) ?? '');
    const fieldMessages: Record<string, string> = {
      category: 'اختر تصنيفاً صحيحاً من القائمة.',
      placeCategory: 'اختر تصنيفاً صحيحاً من القائمة.',
      existingPlaceId: 'اختر المكان المطلوب ربطه من القائمة.',
      role: 'اختر نوع الحساب بصورة صحيحة.',
      merchantId: 'اختر النشاط المرتبط بالحساب.',
      phone: 'رقم الهاتف المصري غير صحيح.',
      whatsapp: 'رقم واتساب غير صحيح.',
      password: 'راجع كلمة المرور وحاول مرة أخرى.',
    };
    console.error('Server action validation failed:', error.issues);
    return {
      success: false,
      message: fieldMessages[field] ?? 'راجع البيانات المدخلة ثم حاول مرة أخرى.',
    };
  }

  const message = error instanceof Error
    ? error.message
    : 'تعذر تنفيذ العملية. حاول مرة أخرى.';
  if (/[\u0600-\u06ff]/.test(message)) {
    return { success: false, message: message.replace(/^.*?:\s*/, '') };
  }

  console.error('Server action failed:', error);
  return { success: false, message: 'تعذر تنفيذ العملية حالياً. حاول مرة أخرى.' };
}

async function requireRole(role: 'admin' | 'merchant' | 'driver') {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== role || profile.must_change_password) {
    throw new Error('غير مصرح لك بتنفيذ هذه العملية.');
  }
  return profile;
}

export async function createDeliveryOrder(input: unknown): Promise<ActionResult<{ id: string; publicCode: string }>> {
  try {
    await requireRole('merchant');
    const data = createOrderSchema.parse(input);
    const supabase = await createClient();
    const { data: order, error } = await (supabase as any).rpc('create_delivery_order', {
      p_branch_id: data.branchId,
      p_recipient_name: data.recipientName,
      p_recipient_phone: data.recipientPhone,
      p_delivery_address: data.deliveryAddress,
      p_delivery_area: data.deliveryArea,
      p_notes: data.notes ?? null,
      p_collection_amount: data.collectionAmount ?? null,
      p_delivery_fee: data.deliveryFee ?? null,
      p_direct_driver_id: data.directDriverId ?? null,
    });
    if (error) throw error;
    safeRevalidatePaths('/merchant', '/driver', '/admin/orders');
    return { success: true, data: { id: order.id, publicCode: order.public_code } };
  } catch (error) {
    return actionError(error);
  }
}

export async function claimDeliveryOrder(orderId: string): Promise<ActionResult> {
  try {
    await requireRole('driver');
    const supabase = await createClient();
    const { error } = await (supabase as any).rpc('claim_delivery_order', { p_order_id: orderId });
    if (error) throw error;
    safeRevalidatePaths('/driver', '/merchant', '/admin/orders');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeDeliveryOrderStatus(input: unknown): Promise<ActionResult> {
  try {
    const data = statusChangeSchema.parse(input);
    const profile = await getCurrentProfile();
    if (!profile || !['admin', 'merchant', 'driver'].includes(profile.role) || !profile.is_active) throw new Error('غير مصرح لك بتنفيذ هذه العملية.');
    const supabase = await createClient();
    const { error } = await (supabase as any).rpc('set_delivery_order_status', {
      p_order_id: data.orderId,
      p_next: data.nextStatus,
      p_reason: data.reason ?? null,
    });
    if (error) throw error;
    safeRevalidatePaths('/merchant', '/driver', '/admin/orders');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function rebroadcastDeliveryOrder(orderId: string): Promise<ActionResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || !['admin', 'merchant'].includes(profile.role) || !profile.is_active) throw new Error('غير مصرح لك بتنفيذ هذه العملية.');
    const supabase = await createClient();
    const { error } = await (supabase as any).rpc('rebroadcast_delivery_order', { p_order_id: orderId });
    if (error) throw error;
    safeRevalidatePaths('/merchant', '/driver', '/admin/orders');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function renewDriverAvailability(): Promise<ActionResult<{ activeUntil: string }>> {
  try {
    await requireRole('driver');
    const supabase = await createClient();
    const { data, error } = await (supabase as any).rpc('renew_driver_availability');
    if (error) throw error;
    safeRevalidatePaths('/', '/driver');
    return { success: true, data: { activeUntil: data.active_until } };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateDriverPublicProfile(input: unknown): Promise<ActionResult> {
  try {
    const profile = await requireRole('driver');
    const data = driverPublicProfileSchema.parse(input);
    const supabase = await createClient();
    const { error } = await (supabase as any).rpc('update_driver_public_profile', {
      p_display_name: data.displayName,
      p_contact_phone: data.contactPhone,
      p_whatsapp: data.whatsapp || null,
      p_vehicle_type: data.vehicleType || null,
    });
    if (error) throw error;
    safeRevalidatePaths('/', '/driver');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateDriverAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  let uploadedPath: string | null = null;
  try {
    const profile = await requireRole('driver');
    const file = formData.get('avatar');
    if (!(file instanceof File) || !file.size) {
      throw new Error('اختر صورة واضحة أولاً.');
    }
    if (file.size > DRIVER_AVATAR_MAX_BYTES) {
      throw new Error('حجم الصورة كبير. اختر صورة أقل من 3.5 ميجابايت.');
    }
    if (!DRIVER_AVATAR_TYPES.has(file.type)) {
      throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.');
    }

    const processed = await processAvatarForStorage(Buffer.from(await file.arrayBuffer()));
    const admin = createAdminClient();
    const { data: current, error: currentError } = await (admin as any)
      .from('driver_profiles')
      .select('avatar_path')
      .eq('profile_id', profile.id)
      .single();
    if (currentError) throw currentError;

    uploadedPath = `${profile.id}/${Date.now()}.${processed.extension}`;
    const { error: uploadError } = await admin.storage
      .from('driver-avatars')
      .upload(uploadedPath, toPlainArrayBuffer(processed.buffer), {
        cacheControl: '31536000',
        contentType: processed.contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = admin.storage
      .from('driver-avatars')
      .getPublicUrl(uploadedPath);
    if (!publicUrlData.publicUrl) throw new Error('تعذر تجهيز رابط الصورة.');

    const { error: updateError } = await (admin as any)
      .from('driver_profiles')
      .update({ avatar_path: uploadedPath, avatar_url: publicUrlData.publicUrl })
      .eq('profile_id', profile.id);
    if (updateError) throw updateError;

    const previousPath = current?.avatar_path as string | null | undefined;
    if (previousPath && previousPath !== uploadedPath) {
      const { error: removeError } = await admin.storage
        .from('driver-avatars')
        .remove([previousPath]);
      if (removeError) console.warn('Previous driver avatar cleanup failed:', removeError);
    }

    safeRevalidatePaths('/', '/driver');
    return { success: true, data: { avatarUrl: publicUrlData.publicUrl } };
  } catch (error) {
    if (uploadedPath) {
      try {
        await createAdminClient().storage.from('driver-avatars').remove([uploadedPath]);
      } catch (cleanupError) {
        console.error('Incomplete driver avatar cleanup failed:', cleanupError);
      }
    }
    return actionError(error);
  }
}

export async function submitAccountRequest(
  input: unknown,
  imageUrls: string[] = [],
): Promise<ActionResult<{ requestId: string }>> {
  let authUserId: string | null = null;
  try {
    const data = accountRequestSchema.parse(input);
    const uploadedImages = validateListingImageUrls(imageUrls, 3);
    if (
      data.kind === 'merchant'
      && data.placeMode === 'new'
      && uploadedImages.length === 0
    ) {
      throw new Error('أضف صورة واحدة على الأقل للمكان أو المنيو قبل إرسال الطلب.');
    }

    const admin = createAdminClient();
    const rateLimitSecret =
      process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rateLimitSecret) throw new Error('إعدادات الخادم غير مكتملة.');
    const requestHeaders = await headers();
    const forwardedIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
    const requestIp = forwardedIp || requestHeaders.get('x-real-ip') || 'local';
    const rateLimitKey = createHash('sha256')
      .update(`${requestIp}:${rateLimitSecret}`)
      .digest('hex');
    const { data: rateLimitAllowed, error: rateLimitError } = await (admin as any).rpc(
      'consume_account_request_rate_limit',
      { p_request_key: rateLimitKey, p_limit: 8 },
    );
    if (rateLimitError) throw new Error('تعذر التحقق من الطلب. حاول مرة أخرى.');
    if (!rateLimitAllowed) {
      throw new Error('تم إرسال طلبات كثيرة من هذا الاتصال. حاول بعد ساعة.');
    }

    const { data: existingProfile } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('phone', data.phone)
      .maybeSingle();
    if (existingProfile) {
      throw new Error('رقم الهاتف لديه حساب بالفعل. استخدم صفحة تسجيل الدخول.');
    }

    const { data: pendingRequest } = await (admin as any)
      .from('account_requests')
      .select('id')
      .eq('phone', data.phone)
      .eq('kind', data.kind)
      .eq('status', 'pending')
      .maybeSingle();
    if (pendingRequest) {
      throw new Error('يوجد طلب حساب قيد المراجعة بالفعل لهذا الرقم.');
    }

    let legacyDriverId: string | null = null;
    if (data.kind === 'driver') {
      const { data: legacyDriver } = await (admin as any)
        .from('drivers')
        .select('id')
        .eq('phone', data.phone)
        .maybeSingle();
      legacyDriverId = legacyDriver?.id ?? null;
    } else if (data.placeMode === 'existing') {
      const { data: place } = await (admin as any)
        .from('places')
        .select('id')
        .eq('id', data.existingPlaceId)
        .maybeSingle();
      if (!place) throw new Error('المكان المختار غير موجود.');
      const { data: linkedBranch } = await (admin as any)
        .from('merchant_branches')
        .select('id')
        .eq('place_id', data.existingPlaceId)
        .maybeSingle();
      if (linkedBranch) throw new Error('هذا المكان مرتبط بالفعل بحساب نشاط.');
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: authEmailForPhone(data.phone),
      email_confirm: true,
      phone: `+2${data.phone}`,
      phone_confirm: true,
      password: data.password,
      user_metadata: {
        display_name: data.displayName,
        account_status: 'pending_review',
        requested_role: data.kind,
      },
    });
    if (authError || !authData.user) {
      const authMessage = authError?.message.toLowerCase() ?? '';
      if (authMessage.includes('already') || authMessage.includes('registered')) {
        throw new Error('رقم الهاتف لديه حساب أو طلب سابق. جرّب تسجيل الدخول أو تواصل مع الإدارة.');
      }
      throw authError ?? new Error('تعذر إنشاء طلب الدخول.');
    }
    authUserId = authData.user.id;

    const { data: request, error: requestError } = await (admin as any)
      .from('account_requests')
      .insert({
        kind: data.kind,
        auth_user_id: authUserId,
        display_name: data.displayName,
        phone: data.phone,
        whatsapp: data.whatsapp || null,
        vehicle_type: data.kind === 'driver' ? data.vehicleType || null : null,
        legacy_driver_id: legacyDriverId,
        place_mode: data.kind === 'merchant' ? data.placeMode : null,
        existing_place_id:
          data.kind === 'merchant' && data.placeMode === 'existing'
            ? data.existingPlaceId
            : null,
        place_title:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeTitle
            : null,
        place_category:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeCategory
            : null,
        place_whatsapp:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeWhatsapp || data.whatsapp || data.phone
            : null,
        place_payment:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placePayment || null
            : null,
        place_description:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeDescription || null
            : null,
        place_whatsapp_group_url:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeWhatsappGroupUrl
            : null,
        place_telegram_url:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeTelegramUrl
            : null,
        place_address:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeAddress || null
            : null,
        place_map_url:
          data.kind === 'merchant' && data.placeMode === 'new'
            ? data.placeMapUrl
            : null,
        place_images: uploadedImages,
        status: 'pending',
      })
      .select('id')
      .single();
    if (requestError || !request) throw requestError ?? new Error('تعذر حفظ طلب الحساب.');

    safeRevalidatePaths('/admin');
    return { success: true, data: { requestId: request.id } };
  } catch (error) {
    if (authUserId) {
      try {
        await createAdminClient().auth.admin.deleteUser(authUserId);
      } catch {
        // The orphaned Auth user has no profile and therefore no app permissions.
      }
    }
    return actionError(error);
  }
}

export async function approveAccountRequest(
  requestId: string,
): Promise<ActionResult> {
  try {
    await requireRole('admin');
    const id = z.uuid().parse(requestId);
    const admin = createAdminClient();
    const { data: authUserId, error } = await (admin as any).rpc(
      'approve_account_request',
      { p_request_id: id },
    );
    if (error) throw error;

    const { error: metadataError } = await admin.auth.admin.updateUserById(authUserId, {
      user_metadata: { account_status: 'approved' },
    });
    if (metadataError) {
      // The database approval is already committed. Metadata is informational
      // and must not make the UI claim that activation failed.
      console.warn('Approved account metadata update was deferred:', metadataError.message);
    }
    safeRevalidatePaths('/', '/admin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function rejectAccountRequest(
  requestId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    await requireRole('admin');
    const id = z.uuid().parse(requestId);
    const rejectionReason = z.string().trim().max(500).optional().parse(reason);
    const admin = createAdminClient();
    const { data: authUserId, error } = await (admin as any).rpc(
      'reject_account_request',
      { p_request_id: id, p_reason: rejectionReason || null },
    );
    if (error) throw error;

    const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
    if (deleteError) {
      console.error('Rejected account Auth cleanup failed:', deleteError.message);
    }
    safeRevalidatePaths('/admin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function createMerchantBranch(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole('admin');
    const data = branchSchema.parse(input);
    const supabase = await createClient();
    const { data: branch, error } = await (supabase as any).from('merchant_branches').insert({
      merchant_id: data.merchantId,
      place_id: data.placeId ?? null,
      name: data.name,
      phone: data.phone,
      address: data.address,
      area: data.area,
      is_default: data.isDefault,
    }).select('id').single();
    if (error) throw error;
    safeRevalidatePaths('/admin', '/merchant');
    return { success: true, data: { id: branch.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function createMerchant(displayName: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole('admin');
    const name = z.string().trim().min(2).max(150).parse(displayName);
    const supabase = await createClient();
    const { data, error } = await (supabase as any).from('merchants').insert({ display_name: name }).select('id').single();
    if (error) throw error;
    safeRevalidatePaths('/admin');
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMerchantPlace(
  input: unknown,
  newImageUrls: string[] = [],
): Promise<ActionResult> {
  try {
    const profile = await requireRole('merchant');
    if (!profile.merchant_id) throw new Error('الحساب غير مرتبط بمحل.');
    const data = merchantPlaceSchema.parse(input);
    const uploadedImages = validateListingImageUrls(newImageUrls, 6);

    const supabase = await createClient();
    const { data: branch } = await (supabase as any)
      .from('merchant_branches')
      .select('id')
      .eq('merchant_id', profile.merchant_id)
      .eq('place_id', data.placeId)
      .eq('is_active', true)
      .maybeSingle();
    if (!branch) throw new Error('غير مصرح لك بتعديل هذا المكان.');

    const { data: currentPlace, error: currentError } = await (supabase as any)
      .from('places')
      .select('id, title, images')
      .eq('id', data.placeId)
      .single();
    if (currentError || !currentPlace) throw currentError ?? new Error('المكان غير موجود.');

    const currentImages = new Set<string>((currentPlace.images as string[]) ?? []);
    if (data.existingImages.some((image) => !currentImages.has(image))) {
      throw new Error('قائمة الصور الحالية غير صالحة.');
    }

    const finalImages = Array.from(new Set([...data.existingImages, ...uploadedImages]));

    const admin = createAdminClient();
    const { error } = await (admin as any)
      .from('places')
      .update({
        title: data.title,
        category: data.category,
        phone: data.phone,
        whatsapp: data.whatsapp || null,
        instapay_vfcash: data.instapayVfcash || null,
        description: data.description || null,
        whatsapp_group_url: data.whatsappGroupUrl,
        telegram_url: data.telegramUrl,
        address: data.address || null,
        map_url: data.mapUrl,
        images: finalImages,
      })
      .eq('id', data.placeId);
    if (error) throw error;

    await (admin as any).from('audit_log').insert({
      actor_id: profile.id,
      action: 'merchant_place_updated',
      entity_type: 'place',
      entity_id: data.placeId,
      metadata: {
        previous_title: currentPlace.title,
        image_count: finalImages.length,
      },
    });

    safeRevalidatePaths(['/', 'page'], '/merchant', '/admin');
    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function linkBranchToPlace(
  branchId: string,
  placeId: string | null,
): Promise<ActionResult> {
  try {
    await requireRole('admin');
    const branch = z.uuid().parse(branchId);
    const place = placeId ? z.uuid().parse(placeId) : null;
    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from('merchant_branches')
      .update({ place_id: place })
      .eq('id', branch);
    if (error) throw error;
    safeRevalidatePaths('/admin', '/merchant');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function provisionUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  let createdUserId: string | null = null;
  try {
    const actor = await requireRole('admin');
    const data = profileProvisionSchema.parse(input);
    if (data.role === 'merchant' && !data.merchantId) throw new Error('اختر المحل المرتبط بالحساب.');
    if (data.role !== 'merchant' && data.merchantId) throw new Error('ربط المحل متاح لحسابات المحلات فقط.');

    const admin = createAdminClient();
    const phone = `+2${data.phone}`;
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: authEmailForPhone(data.phone),
      email_confirm: true,
      phone,
      password: data.password,
      phone_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (authError || !authData.user) throw authError ?? new Error('تعذر إنشاء حساب الدخول.');
    createdUserId = authData.user.id;

    const { error: profileError } = await (admin as any).from('profiles').insert({
      id: authData.user.id,
      role: data.role,
      phone: data.phone,
      display_name: data.displayName,
      merchant_id: data.merchantId ?? null,
      must_change_password: true,
    });
    if (profileError) throw profileError;
    if (data.role === 'driver') {
      const { error: driverError } = await (admin as any)
        .from('driver_profiles')
        .upsert({ profile_id: authData.user.id }, { onConflict: 'profile_id' });
      if (driverError) throw driverError;
    }
    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_provisioned',
      entity_type: 'profile',
      entity_id: authData.user.id,
      metadata: { role: data.role },
    });
    safeRevalidatePaths('/admin');
    createdUserId = null;
    return { success: true, data: { id: authData.user.id } };
  } catch (error) {
    if (createdUserId) {
      try {
        await createAdminClient().auth.admin.deleteUser(createdUserId);
      } catch (cleanupError) {
        console.error('Incomplete provisioned user cleanup failed:', cleanupError);
      }
    }
    return actionError(error);
  }
}

export async function setUserActive(profileId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const actor = await requireRole('admin');
    if (!z.uuid().safeParse(profileId).success) throw new Error('معرف الحساب غير صالح.');
    if (profileId === actor.id && !isActive) {
      throw new Error('لا يمكنك تعطيل حساب الإدارة الذي تستخدمه حالياً.');
    }
    const admin = createAdminClient();
    const { data: target, error: targetError } = await (admin as any)
      .from('profiles')
      .select('id, role')
      .eq('id', profileId)
      .maybeSingle();
    if (targetError || !target) throw targetError ?? new Error('الحساب غير موجود.');

    if (target.role === 'driver') {
      const { error } = await (admin as any).rpc('admin_repair_driver_account', {
        p_profile_id: profileId,
        p_is_active: isActive,
      });
      if (error) throw error;
    } else {
      const { data: updated, error } = await (admin as any)
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', profileId)
        .select('id')
        .maybeSingle();
      if (error || !updated) throw error ?? new Error('لم يتم تحديث الحساب.');
    }

    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: isActive ? 'user_activated' : 'user_deactivated',
      entity_type: 'profile',
      entity_id: profileId,
      metadata: {},
    });
    safeRevalidatePaths('/admin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateManagedUser(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireRole('admin');
    const data = managedUserSchema.parse(input);
    if (data.role === 'merchant' && !data.merchantId) {
      throw new Error('اختر المحل المرتبط بالحساب.');
    }
    if (data.role !== 'merchant' && data.merchantId) {
      throw new Error('ربط المحل متاح لحسابات المحلات فقط.');
    }
    if (data.id === actor.id && (data.role !== 'admin' || !data.isActive)) {
      throw new Error('لا يمكنك إزالة صلاحية الإدارة أو تعطيل حسابك الحالي.');
    }

    const admin = createAdminClient();
    const { data: previous, error: previousError } = await (admin as any)
      .from('profiles')
      .select('id, role, phone, display_name, merchant_id, is_active, must_change_password')
      .eq('id', data.id)
      .single();
    if (previousError || !previous) throw previousError ?? new Error('الحساب غير موجود.');

    const authUpdate = {
      email: authEmailForPhone(data.phone),
      email_confirm: true,
      phone: `+2${data.phone}`,
      phone_confirm: true,
      user_metadata: { display_name: data.displayName },
      ...(data.newPassword ? { password: data.newPassword } : {}),
    };
    const { error: authError } = await admin.auth.admin.updateUserById(data.id, authUpdate);
    if (authError) throw authError;

    const { error: profileError } = await (admin as any)
      .from('profiles')
      .update({
        role: data.role,
        phone: data.phone,
        display_name: data.displayName,
        merchant_id: data.role === 'merchant' ? data.merchantId : null,
        is_active: data.isActive,
        must_change_password: data.newPassword ? true : previous.must_change_password,
      })
      .eq('id', data.id);

    if (profileError) {
      await admin.auth.admin.updateUserById(data.id, {
        email: authEmailForPhone(previous.phone),
        email_confirm: true,
        phone: `+2${previous.phone}`,
        phone_confirm: true,
        user_metadata: { display_name: previous.display_name },
      });
      throw profileError;
    }

    if (data.role === 'driver') {
      const { error } = await (admin as any)
        .from('driver_profiles')
        .upsert({ profile_id: data.id }, { onConflict: 'profile_id' });
      if (error) throw error;
    } else if (previous.role === 'driver') {
      const { error } = await (admin as any)
        .from('driver_profiles')
        .delete()
        .eq('profile_id', data.id);
      if (error) throw error;
    }

    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_updated',
      entity_type: 'profile',
      entity_id: data.id,
      metadata: {
        previous_role: previous.role,
        role: data.role,
        password_reset: Boolean(data.newPassword),
      },
    });
    safeRevalidatePaths('/admin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteManagedUser(profileId: string): Promise<ActionResult> {
  try {
    const actor = await requireRole('admin');
    const id = z.uuid().parse(profileId);
    if (id === actor.id) throw new Error('لا يمكنك حذف حسابك الحالي.');

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await (admin as any)
      .from('profiles')
      .select('id, role, merchant_id')
      .eq('id', id)
      .single();
    if (profileError || !profile) throw profileError ?? new Error('الحساب غير موجود.');

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    if (profile.role === 'merchant' && profile.merchant_id) {
      const { error: unlinkError } = await (admin as any)
        .from('merchant_branches')
        .update({ place_id: null, is_active: false })
        .eq('merchant_id', profile.merchant_id);
      if (unlinkError) throw unlinkError;
    }
    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_deleted',
      entity_type: 'profile',
      entity_id: id,
      metadata: { role: profile.role, merchant_id: profile.merchant_id },
    });
    safeRevalidatePaths('/admin');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('foreign key')) {
      return {
        success: false,
        message: 'لا يمكن حذف حساب مرتبط بطلبات سابقة؛ عطّل الحساب بدلاً من ذلك.',
      };
    }
    return actionError(error);
  }
}

export async function changeInitialPassword(password: string): Promise<ActionResult> {
  try {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('كلمة المرور يجب أن تتكون من 12 حرفاً على الأقل.');
    const profile = await getCurrentProfile();
    if (!profile || !profile.is_active) throw new Error('انتهت الجلسة.');
    const supabase = await createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) throw authError;
    const { error } = await (supabase as any).from('profiles').update({ must_change_password: false }).eq('id', profile.id);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
