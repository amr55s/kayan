'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/guards';
import { uploadImageToStorage } from '@/lib/supabase/actions';
import { authEmailForPhone } from '@/lib/auth/phone';
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

function actionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { success: false, message: error.issues[0]?.message ?? 'بيانات غير صالحة.' };
  const message = error instanceof Error ? error.message : 'تعذر تنفيذ العملية. حاول مرة أخرى.';
  return { success: false, message: message.replace(/^.*?:\s*/, '') };
}

function validateListingImageUrls(urls: string[], max: number): string[] {
  if (urls.length > max) {
    throw new Error(`يمكن رفع ${max} صور كحد أقصى في المرة الواحدة.`);
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl && urls.length) throw new Error('إعدادات تخزين الصور غير مكتملة.');
  const allowedOrigin = projectUrl ? new URL(projectUrl).origin : '';
  const allowedPath = '/storage/v1/object/public/listing-images/';

  return urls.map((value) => {
    const url = new URL(z.url().parse(value));
    if (url.origin !== allowedOrigin || !url.pathname.startsWith(allowedPath)) {
      throw new Error('رابط صورة غير صالح.');
    }
    return url.toString();
  });
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
    revalidatePath('/merchant');
    revalidatePath('/driver');
    revalidatePath('/admin/orders');
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
    revalidatePath('/driver');
    revalidatePath('/merchant');
    revalidatePath('/admin/orders');
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
    revalidatePath('/merchant');
    revalidatePath('/driver');
    revalidatePath('/admin/orders');
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
    revalidatePath('/merchant');
    revalidatePath('/driver');
    revalidatePath('/admin/orders');
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
    revalidatePath('/');
    revalidatePath('/driver');
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
      p_whatsapp: data.whatsapp || null,
      p_vehicle_type: data.vehicleType || null,
    });
    if (error) throw error;
    revalidatePath('/');
    revalidatePath('/driver');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitAccountRequest(
  input: unknown,
  imageFiles: File[] = [],
): Promise<ActionResult<{ requestId: string }>> {
  let authUserId: string | null = null;
  try {
    const data = accountRequestSchema.parse(input);
    if (imageFiles.length > 3) throw new Error('يمكن رفع 3 صور كحد أقصى.');

    const admin = createAdminClient();
    const rateLimitSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

    const uploadedImages: string[] = [];
    if (data.kind === 'merchant' && data.placeMode === 'new') {
      for (const file of imageFiles) {
        const url = await uploadImageToStorage(file, 'requests');
        if (url) uploadedImages.push(url);
      }
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
        place_images: uploadedImages,
        status: 'pending',
      })
      .select('id')
      .single();
    if (requestError || !request) throw requestError ?? new Error('تعذر حفظ طلب الحساب.');

    revalidatePath('/admin');
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
    const supabase = await createClient();
    const { data: authUserId, error } = await (supabase as any).rpc(
      'approve_account_request',
      { p_request_id: id },
    );
    if (error) throw error;

    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(authUserId, {
      user_metadata: { account_status: 'approved' },
    });
    revalidatePath('/');
    revalidatePath('/admin');
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
    const supabase = await createClient();
    const { data: authUserId, error } = await (supabase as any).rpc(
      'reject_account_request',
      { p_request_id: id, p_reason: rejectionReason || null },
    );
    if (error) throw error;

    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
    if (deleteError) {
      console.error('Rejected account Auth cleanup failed:', deleteError.message);
    }
    revalidatePath('/admin');
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
    revalidatePath('/admin');
    revalidatePath('/merchant');
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
    revalidatePath('/admin');
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
    const requestData = {
      target_place_id: data.placeId,
      place_name_or_phone: currentPlace.title,
      feedback_type: 'merchant_update',
      source: 'merchant',
      submitted_by: profile.id,
      contact_phone: profile.phone,
      proposed_title: data.title,
      proposed_category: data.category,
      proposed_phone: data.phone,
      proposed_whatsapp: data.whatsapp || '',
      proposed_instapay_vfcash: data.instapayVfcash || '',
      proposed_description: data.description || '',
      proposed_images: finalImages,
      notes: `طلب تحديث بطاقة ${currentPlace.title} مقدم من حساب المحل.`,
      status: 'pending',
    };

    const { data: existingRequest } = await (admin as any)
      .from('feedback_requests')
      .select('id')
      .eq('target_place_id', data.placeId)
      .eq('submitted_by', profile.id)
      .eq('feedback_type', 'merchant_update')
      .eq('status', 'pending')
      .maybeSingle();

    const requestQuery = existingRequest
      ? (admin as any)
          .from('feedback_requests')
          .update(requestData)
          .eq('id', existingRequest.id)
      : (admin as any).from('feedback_requests').insert(requestData);
    const { error } = await requestQuery;
    if (error) throw error;

    await (admin as any).from('audit_log').insert({
      actor_id: profile.id,
      action: existingRequest ? 'merchant_change_request_updated' : 'merchant_change_request_created',
      entity_type: 'place',
      entity_id: data.placeId,
      metadata: { feedback_id: existingRequest?.id ?? null },
    });

    revalidatePath('/merchant');
    revalidatePath('/admin');
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
    revalidatePath('/admin');
    revalidatePath('/merchant');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function provisionUser(input: unknown): Promise<ActionResult<{ id: string }>> {
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

    const { error: profileError } = await (admin as any).from('profiles').insert({
      id: authData.user.id,
      role: data.role,
      phone: data.phone,
      display_name: data.displayName,
      merchant_id: data.merchantId ?? null,
      must_change_password: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }
    if (data.role === 'driver') {
      const { error: driverError } = await (admin as any).from('driver_profiles').insert({ profile_id: authData.user.id });
      if (driverError) throw driverError;
    }
    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'user_provisioned',
      entity_type: 'profile',
      entity_id: authData.user.id,
      metadata: { role: data.role },
    });
    revalidatePath('/admin');
    return { success: true, data: { id: authData.user.id } };
  } catch (error) {
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
    const supabase = await createClient();
    const { error } = await (supabase as any).from('profiles').update({ is_active: isActive }).eq('id', profileId);
    if (error) throw error;
    const admin = createAdminClient();
    await (admin as any).from('audit_log').insert({
      actor_id: actor.id,
      action: isActive ? 'user_activated' : 'user_deactivated',
      entity_type: 'profile',
      entity_id: profileId,
      metadata: {},
    });
    revalidatePath('/admin');
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
    revalidatePath('/admin');
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
    revalidatePath('/admin');
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
