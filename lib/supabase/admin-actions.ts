'use server';

import { createAdminClient } from './admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { PendingRequest, Place, Driver, FeedbackRequest, StoreCoupon } from '@/types';
import { getCurrentProfile } from '@/lib/auth/guards';
import { validatePlaceDetails } from '@/lib/place-details';
import { validateListingImageUrls } from '@/lib/images/urls';

async function requireAdminSession() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== 'admin') {
    throw new Error('admin_access_required');
  }
  return profile;
}

function safeAdminMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return /[\u0600-\u06ff]/.test(message)
    ? message.replace(/^.*?:\s*/, '')
    : fallback;
}

export async function validateAdminPasscode(passcode: string): Promise<{ success: boolean }> {
  // The legacy passcode gate is retired. Access is enforced by Supabase Auth + RLS.
  void passcode;
  return { success: false };
}

// Timeout helper for server actions
async function fetchWithTimeout<T>(promise: PromiseLike<T> | Promise<T>, timeoutMs: number = 2500): Promise<T | null> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve(promise), timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch {
    clearTimeout(timeoutId!);
    return null;
  }
}

/**
 * Helper to trigger instant cache revalidation across public and admin pages with tag revalidation
 */
function triggerInstantRevalidation(tags?: ('places' | 'drivers')[]) {
  try {
    revalidatePath('/', 'page');
    revalidatePath('/admin', 'page');
    if (tags && tags.length > 0) {
      tags.forEach((tag) => revalidateTag(tag, 'max'));
    } else {
      revalidateTag('places', 'max');
      revalidateTag('drivers', 'max');
    }
  } catch (e) {
    console.warn('Revalidation notice:', e);
  }
}

/**
 * Server action to fetch real-time Admin Metrics KPI counts via RPC or query
 */
export async function serverFetchAdminMetrics(): Promise<{
  totalPlaces: number;
  activeDrivers: number;
  pendingAdditions: number;
  pendingFeedbacks: number;
}> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const rpcRes: any = await fetchWithTimeout((supabase as any).rpc('get_admin_metrics'), 2000);

    if (rpcRes && !rpcRes.error && rpcRes.data && rpcRes.data.length > 0) {
      const row = rpcRes.data[0];
      return {
        totalPlaces: Number(row.total_places || 0),
        activeDrivers: Number(row.active_drivers || 0),
        pendingAdditions: Number(row.pending_additions || 0),
        pendingFeedbacks: Number(row.pending_feedbacks || 0),
      };
    }

    // Fallback individual counts
    const [placesCount, driversCount, pendingCount, feedbackCount]: any = await Promise.all([
      fetchWithTimeout(supabase.from('places').select('*', { count: 'exact', head: true })),
      fetchWithTimeout(supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('is_active', true)),
      fetchWithTimeout(supabase.from('pending_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      fetchWithTimeout(supabase.from('feedback_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    ]);

    return {
      totalPlaces: placesCount?.count || 8,
      activeDrivers: driversCount?.count || 5,
      pendingAdditions: pendingCount?.count || 0,
      pendingFeedbacks: feedbackCount?.count || 0,
    };
  } catch (err) {
    console.error('serverFetchAdminMetrics exception:', err);
    return { totalPlaces: 8, activeDrivers: 5, pendingAdditions: 0, pendingFeedbacks: 0 };
  }
}

/**
 * Server action to fetch admin dashboard data safely with fallback error handling.
 */
export async function serverFetchAdminData(): Promise<{
  pendingRequests: PendingRequest[];
  places: Place[];
  drivers: Driver[];
  feedbackRequests: FeedbackRequest[];
}> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const [pendingRes, placesRes, driversRes, feedbackRes]: any = await Promise.all([
      fetchWithTimeout(supabase.from('pending_requests').select('*').order('created_at', { ascending: false })),
      fetchWithTimeout(supabase.from('places').select('*').order('created_at', { ascending: false })),
      fetchWithTimeout(supabase.from('drivers').select('*').order('created_at', { ascending: false })),
      fetchWithTimeout(supabase.from('feedback_requests').select('*').order('created_at', { ascending: false })),
    ]);

    return {
      pendingRequests: (pendingRes?.data as PendingRequest[]) || [],
      places: (placesRes?.data as Place[]) || [],
      drivers: (driversRes?.data as Driver[]) || [],
      feedbackRequests: (feedbackRes?.data as FeedbackRequest[]) || [],
    };
  } catch (err) {
    console.error('serverFetchAdminData exception:', err);
    return { pendingRequests: [], places: [], drivers: [], feedbackRequests: [] };
  }
}

export async function serverApprovePendingRequest(
  reqId: string,
  reqData: {
    title: string;
    category: string;
    phone: string;
    whatsapp?: string | null;
    instapay_vfcash?: string | null;
    description?: string | null;
    images: string[];
    is_featured?: boolean;
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data: locked, error: lockError } = await (supabase as any)
      .from('pending_requests')
      .update({ status: 'approved' })
      .eq('id', reqId)
      .eq('status', 'pending')
      .select()
      .single();

    if (lockError || !locked) {
      return { success: false, message: 'الطلب تمت معالجته بالفعل أو غير موجود.' };
    }

    const { error: insertError } = await (supabase as any).from('places').insert([
      {
        title: reqData.title,
        category: reqData.category,
        phone: reqData.phone,
        whatsapp: reqData.whatsapp,
        instapay_vfcash: reqData.instapay_vfcash,
        description: reqData.description,
        images: reqData.images,
        is_featured: reqData.is_featured || false,
      },
    ]);

    if (insertError) {
      await (supabase as any).from('pending_requests').update({ status: 'pending' }).eq('id', reqId);
      return { success: false, message: 'فشل في إضافة المكان إلى ديرتك.' };
    }

    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverApprovePendingRequest error:', error);
    return { success: false, message: 'تعذر اعتماد الطلب حالياً. لم يتم فقد الطلب، حاول مرة أخرى.' };
  }
}

export async function serverEditAndApproveRequest(
  reqId: string,
  updatedData: {
    title: string;
    category: string;
    phone: string;
    whatsapp?: string | null;
    instapay_vfcash?: string | null;
    description?: string | null;
    images: string[];
    is_featured?: boolean;
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { data: locked, error: lockError } = await (supabase as any)
      .from('pending_requests')
      .update({
        title: updatedData.title,
        category: updatedData.category,
        phone: updatedData.phone,
        whatsapp: updatedData.whatsapp,
        instapay_vfcash: updatedData.instapay_vfcash,
        description: updatedData.description,
        images: updatedData.images,
        status: 'approved'
      })
      .eq('id', reqId)
      .eq('status', 'pending')
      .select()
      .single();

    if (lockError || !locked) {
      return { success: false, message: 'الطلب تمت معالجته بالفعل أو غير موجود.' };
    }

    const { error: insertError } = await (supabase as any).from('places').insert([
      {
        title: updatedData.title,
        category: updatedData.category,
        phone: updatedData.phone,
        whatsapp: updatedData.whatsapp,
        instapay_vfcash: updatedData.instapay_vfcash,
        description: updatedData.description,
        images: updatedData.images,
        is_featured: updatedData.is_featured || false,
      },
    ]);

    if (insertError) {
      await (supabase as any).from('pending_requests').update({ status: 'pending' }).eq('id', reqId);
      return { success: false, message: 'فشل في إضافة المكان إلى ديرتك.' };
    }

    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverEditAndApproveRequest error:', error);
    return { success: false, message: 'تعذر حفظ واعتماد الطلب حالياً. لم يتم فقد الطلب.' };
  }
}

export async function serverRejectPendingRequest(
  reqId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await (supabase as any)
      .from('pending_requests')
      .update({ status: 'rejected' })
      .eq('id', reqId)
      .eq('status', 'pending');

    if (error) {
      return { success: false, message: 'حدث خطأ أثناء رفض الطلب.' };
    }

    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverRejectPendingRequest error:', error);
    return { success: false, message: 'تعذر رفض الطلب حالياً. لم يتم حذف الطلب.' };
  }
}

export async function serverInsertPlaceDirectly(
  placeData: {
    title: string;
    category: string;
    phone: string;
    whatsapp?: string;
    instapay_vfcash?: string;
    description?: string;
    whatsapp_group_url?: string;
    telegram_url?: string;
    address?: string;
    map_url?: string;
    images?: string[];
    is_featured?: boolean;
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const details = validatePlaceDetails({
      whatsappGroupUrl: placeData.whatsapp_group_url,
      telegramUrl: placeData.telegram_url,
      address: placeData.address,
      mapUrl: placeData.map_url,
    });
    const uploadedImages = validateListingImageUrls(placeData.images ?? [], 6);
    if (!uploadedImages.length) {
      throw new Error('أضف صورة واحدة على الأقل للمكان أو المنيو قبل النشر.');
    }
    const supabase = createAdminClient();
    const { error } = await (supabase as any).from('places').insert([
      {
        title: placeData.title.trim(),
        category: placeData.category,
        phone: placeData.phone.trim(),
        whatsapp: placeData.whatsapp?.trim() || null,
        instapay_vfcash: placeData.instapay_vfcash?.trim() || null,
        description: placeData.description?.trim() || null,
        whatsapp_group_url: details.whatsappGroupUrl,
        telegram_url: details.telegramUrl,
        address: details.address,
        map_url: details.mapUrl,
        images: uploadedImages,
        is_featured: placeData.is_featured || false,
      },
    ]);

    if (error) throw error;

    triggerInstantRevalidation();
    return { success: true, message: 'تمت إضافة المكان بنجاح ونشره في ديرتك!' };
  } catch (err: any) {
    console.error('serverInsertPlaceDirectly error:', err);
    return {
      success: false,
      message: safeAdminMessage(err, 'حدث خطأ أثناء إضافة المكان. حاول مرة أخرى.'),
    };
  }
}

export async function serverUpdateActivePlace(
  placeId: string,
  updatedData: Partial<Place>
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const details = validatePlaceDetails({
      whatsappGroupUrl: updatedData.whatsapp_group_url,
      telegramUrl: updatedData.telegram_url,
      address: updatedData.address,
      mapUrl: updatedData.map_url,
    });
    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('places')
      .update({
        title: updatedData.title,
        category: updatedData.category as string,
        phone: updatedData.phone,
        whatsapp: updatedData.whatsapp,
        instapay_vfcash: updatedData.instapay_vfcash,
        description: updatedData.description,
        whatsapp_group_url: details.whatsappGroupUrl,
        telegram_url: details.telegramUrl,
        address: details.address,
        map_url: details.mapUrl,
        images: updatedData.images,
        is_featured: updatedData.is_featured,
      })
      .eq('id', placeId);

    if (error) throw error;
    triggerInstantRevalidation();
    return { success: true };
  } catch (err: any) {
    console.error('serverUpdateActivePlace error:', err);
    return {
      success: false,
      message: safeAdminMessage(err, 'حدث خطأ أثناء تحديث المكان. حاول مرة أخرى.'),
    };
  }
}

export async function serverDeleteActivePlace(
  placeId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();
    const { error } = await (supabase as any).from('places').delete().eq('id', placeId);
    if (error) throw error;
    triggerInstantRevalidation();
    return { success: true };
  } catch (err: any) {
    console.error('serverDeleteActivePlace error:', err);
    return {
      success: false,
      message: safeAdminMessage(err, 'حدث خطأ أثناء حذف المكان. حاول مرة أخرى.'),
    };
  }
}

export type StoreCouponInput = Pick<
  StoreCoupon,
  | 'place_id'
  | 'title'
  | 'code'
  | 'description'
  | 'discount_type'
  | 'discount_value'
  | 'minimum_order_amount'
  | 'applies_to'
  | 'usage_limit_text'
  | 'is_active'
  | 'is_featured'
  | 'display_order'
  | 'starts_at'
  | 'expires_at'
> & { id?: string };

function normalizeCouponInput(input: StoreCouponInput) {
  const code = input.code.trim().toUpperCase();
  const discountValue = Number(input.discount_value);
  const minimumOrder = input.minimum_order_amount === null
    || input.minimum_order_amount === undefined
    ? null
    : Number(input.minimum_order_amount);
  const displayOrder = Number(input.display_order || 0);

  if (!/^[0-9a-f-]{36}$/i.test(input.place_id)) throw new Error('اختر متجراً صحيحاً.');
  if (input.id && !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error('معرّف الكوبون غير صالح.');
  if (input.title.trim().length < 2 || input.title.trim().length > 80) {
    throw new Error('اسم العرض يجب أن يكون بين حرفين و80 حرفاً.');
  }
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error('كود الخصم يقبل حروفاً إنجليزية وأرقاماً وشرطتين فقط.');
  }
  if (input.description.trim().length < 5 || input.description.trim().length > 280) {
    throw new Error('وصف الكوبون يجب أن يكون بين 5 و280 حرفاً.');
  }
  if (!['percentage', 'fixed'].includes(input.discount_type)) {
    throw new Error('نوع الخصم غير صالح.');
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0
      || (input.discount_type === 'percentage' && discountValue > 100)) {
    throw new Error('قيمة الخصم غير صالحة.');
  }
  if (minimumOrder !== null && (!Number.isFinite(minimumOrder) || minimumOrder < 0)) {
    throw new Error('الحد الأدنى للأوردر غير صالح.');
  }
  if (input.applies_to.trim().length < 2 || input.applies_to.trim().length > 160) {
    throw new Error('وضّح المنتجات التي يشملها الخصم في 160 حرفاً أو أقل.');
  }
  if (input.usage_limit_text.trim().length < 2 || input.usage_limit_text.trim().length > 160) {
    throw new Error('وضّح حد وشروط الاستخدام في 160 حرفاً أو أقل.');
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
    throw new Error('ترتيب ظهور الكوبون يجب أن يكون بين 0 و1000.');
  }
  if (input.starts_at && Number.isNaN(Date.parse(input.starts_at))) {
    throw new Error('تاريخ بداية الكوبون غير صالح.');
  }
  if (input.expires_at && Number.isNaN(Date.parse(input.expires_at))) {
    throw new Error('تاريخ انتهاء الكوبون غير صالح.');
  }
  if (input.starts_at && input.expires_at
      && Date.parse(input.expires_at) <= Date.parse(input.starts_at)) {
    throw new Error('تاريخ انتهاء الكوبون يجب أن يكون بعد تاريخ البداية.');
  }

  return {
    place_id: input.place_id,
    title: input.title.trim(),
    code,
    description: input.description.trim(),
    discount_type: input.discount_type,
    discount_value: discountValue,
    minimum_order_amount: minimumOrder,
    applies_to: input.applies_to.trim(),
    usage_limit_text: input.usage_limit_text.trim(),
    is_active: Boolean(input.is_active),
    is_featured: Boolean(input.is_featured),
    display_order: displayOrder,
    starts_at: input.starts_at || null,
    expires_at: input.expires_at || null,
  };
}

export async function serverUpsertStoreCoupon(
  input: StoreCouponInput,
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const actor = await requireAdminSession();
    const coupon = normalizeCouponInput(input);
    const supabase = createAdminClient();
    const result: any = input.id
      ? await (supabase as any)
          .from('store_coupons')
          .update(coupon)
          .eq('id', input.id)
          .select('id')
          .single()
      : await (supabase as any)
          .from('store_coupons')
          .insert({ ...coupon, created_by: actor.id })
          .select('id')
          .single();

    if (result.error || !result.data?.id) throw result.error || new Error('تعذر حفظ الكوبون.');
    await (supabase as any).from('audit_log').insert({
      actor_id: actor.id,
      action: input.id ? 'store_coupon_updated' : 'store_coupon_created',
      entity_type: 'store_coupon',
      entity_id: result.data.id,
      metadata: { place_id: coupon.place_id, code: coupon.code },
    });
    triggerInstantRevalidation(['places']);
    return {
      success: true,
      id: result.data.id,
      message: input.id ? 'تم تحديث الكوبون.' : 'تم إنشاء الكوبون ونشره على بطاقة المتجر.',
    };
  } catch (error) {
    console.error('serverUpsertStoreCoupon error:', error);
    return {
      success: false,
      message: safeAdminMessage(error, 'تعذر حفظ الكوبون. راجع البيانات وحاول مرة أخرى.'),
    };
  }
}

export async function serverDeleteStoreCoupon(
  couponId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const actor = await requireAdminSession();
    if (!/^[0-9a-f-]{36}$/i.test(couponId)) throw new Error('معرّف الكوبون غير صالح.');
    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('store_coupons')
      .delete()
      .eq('id', couponId);
    if (error) throw error;
    await (supabase as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'store_coupon_deleted',
      entity_type: 'store_coupon',
      entity_id: couponId,
      metadata: {},
    });
    triggerInstantRevalidation(['places']);
    return { success: true, message: 'تم حذف الكوبون.' };
  } catch (error) {
    console.error('serverDeleteStoreCoupon error:', error);
    return {
      success: false,
      message: safeAdminMessage(error, 'تعذر حذف الكوبون حالياً.'),
    };
  }
}

export async function serverToggleDriverStatus(
  driverId: string,
  currentStatus: boolean,
  source: 'public' | 'account' = 'public',
): Promise<{ success: boolean; message?: string }> {
  try {
    const actor = await requireAdminSession();
    if (!/^[0-9a-f-]{36}$/i.test(driverId)) throw new Error('معرف الكابتن غير صالح.');
    const supabase = createAdminClient();
    const { error } = source === 'account'
      ? await (supabase as any).rpc('admin_repair_driver_account', {
          p_profile_id: driverId,
          p_is_active: !currentStatus,
        })
      : await (supabase as any).rpc('admin_update_managed_driver', {
          p_driver_id: driverId,
          p_source: source,
          p_is_active: !currentStatus,
        });

    if (error) {
      return { success: false, message: 'حدث خطأ أثناء تغيير حالة السائق.' };
    }

    await (supabase as any).from('audit_log').insert({
      actor_id: actor.id,
      action: !currentStatus ? 'driver_activated' : 'driver_deactivated',
      entity_type: source === 'account' ? 'profile' : 'driver',
      entity_id: driverId,
      metadata: { source },
    });
    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverToggleDriverStatus error:', error);
    return { success: false, message: 'تعذر تغيير حالة الكابتن حالياً.' };
  }
}

export async function serverExtendDriverTime(
  driverId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const newActiveUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { error } = await (supabase as any)
      .from('drivers')
      .update({
        is_active: true,
        active_until: newActiveUntil,
      })
      .eq('id', driverId);

    if (error) {
      return { success: false, message: 'حدث خطأ أثناء تمديد وقت الكابتن.' };
    }

    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverExtendDriverTime error:', error);
    return { success: false, message: 'تعذر تمديد وقت الكابتن حالياً.' };
  }
}

export async function serverDeleteDriver(
  driverId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireAdminSession();
    const supabase = createAdminClient();

    const { error } = await (supabase as any).from('drivers').delete().eq('id', driverId);

    if (error) {
      return { success: false, message: 'حدث خطأ أثناء حذف السائق.' };
    }

    triggerInstantRevalidation();
    return { success: true };
  } catch (error) {
    console.error('serverDeleteDriver error:', error);
    return { success: false, message: 'تعذر حذف الكابتن حالياً.' };
  }
}

export async function serverUpdateDriver(
  driverId: string,
  input: {
    name: string;
    phone: string;
    whatsapp?: string | null;
    vehicleType?: string | null;
  },
  source: 'public' | 'account' = 'public',
): Promise<{ success: boolean; message?: string }> {
  try {
    const actor = await requireAdminSession();
    const phone = input.phone.replace(/\D/g, '').replace(/^20/, '0');
    const whatsapp = input.whatsapp?.replace(/\D/g, '').replace(/^20/, '0') || phone;
    if (!/^[0-9a-f-]{36}$/i.test(driverId)) throw new Error('معرف الكابتن غير صالح.');
    if (!/^01[0125]\d{8}$/.test(phone) || !/^01[0125]\d{8}$/.test(whatsapp)) {
      throw new Error('رقم الهاتف أو واتساب غير صحيح.');
    }
    if (!input.name.trim() || input.name.trim().length > 100) {
      throw new Error('اسم الكابتن غير صحيح.');
    }

    const supabase = createAdminClient();
    if (source === 'account') {
      const { error: repairError } = await (supabase as any).rpc(
        'admin_repair_driver_account',
        {
          p_profile_id: driverId,
          p_is_active: null,
        },
      );
      if (repairError) throw repairError;
    }
    const { error } = await (supabase as any).rpc('admin_update_managed_driver', {
      p_driver_id: driverId,
      p_source: source,
      p_name: input.name.trim(),
      p_contact_phone: phone,
      p_whatsapp: whatsapp,
      p_vehicle_type: input.vehicleType?.trim() || '',
    });
    if (error) throw error;
    await (supabase as any).from('audit_log').insert({
      actor_id: actor.id,
      action: 'driver_public_profile_updated',
      entity_type: source === 'account' ? 'profile' : 'driver',
      entity_id: driverId,
      metadata: { source },
    });
    triggerInstantRevalidation(['drivers']);
    return { success: true, message: 'تم تحديث بيانات الكابتن.' };
  } catch (error) {
    return {
      success: false,
      message: safeAdminMessage(error, 'تعذر تحديث بيانات الكابتن. حاول مرة أخرى.'),
    };
  }
}
