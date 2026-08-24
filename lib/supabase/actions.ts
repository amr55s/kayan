'use server';

import { createClient } from './server';
import { createAdminClient } from './admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { createHash, randomUUID } from 'node:crypto';
import { FeedbackType } from '@/types';
import { validateListingImageUrls } from '@/lib/images/urls';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import { getCurrentProfile } from '@/lib/auth/guards';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { createPrivateStageUpload } from '@/lib/media/spaces';
import {
  validatePlaceDetails,
  type PlaceDetailsInput,
} from '@/lib/place-details';

export type ListingUploadFolder = 'requests' | 'feedback' | 'merchant';
export type ImageUploadResult =
  | { success: true; url: string | null }
  | { success: false; message: string };
export type SignedImageUploadResult =
  | {
      success: true;
      sessionId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    }
  | { success: false; message: string };
const MAX_IMAGE_BYTES = 3_500_000;
const IMAGE_EXTENSIONS: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Helper to check if Supabase is running in demo/placeholder mode
 */
function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url.includes('placeholder');
}

function safeArabicMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (/[\u0600-\u06ff]/.test(message)) {
    return message.replace(/^.*?:\s*/, '');
  }
  return fallback;
}

function isListingUploadFolder(value: string): value is ListingUploadFolder {
  return value === 'requests' || value === 'feedback' || value === 'merchant';
}

async function getAnonymousRequestKey(purpose: string): Promise<string> {
  const requestHeaders = await headers();
  const requestIp =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || requestHeaders.get('x-real-ip')
    || 'local';
  const userAgent = requestHeaders.get('user-agent') || 'unknown';
  const secret =
    process.env.CLIENT_ERROR_HASH_SALT
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('إعدادات الخادم غير مكتملة.');
  return createHash('sha256')
    .update(`${purpose}:${requestIp}:${userAgent}:${secret}`)
    .digest('hex');
}

async function consumeImageUploadAllowance(ownerId: string) {
  const supabase = createAdminClient();
  const requestKey = await getAnonymousRequestKey(`listing-upload:${ownerId}`);
  const { data: allowed, error } = await (supabase as any).rpc(
    'consume_listing_upload_rate_limit',
    { p_request_key: requestKey, p_limit: 24 },
  );
  return { supabase, allowed: Boolean(allowed), error };
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
  } catch (error) {
    logSafeServerFailure('warn', 'public_revalidation_failed', { failure: error });
  }
}

/**
 * Creates a short-lived private object-storage upload URL without sending image
 * bytes through the Next.js/Vercel function. The object remains private until
 * the server validates and normalizes it.
 */
export async function prepareImageUpload(
  input: {
    checksumSha256: string;
    contentType: string;
    folder: ListingUploadFolder;
    size: number;
  },
): Promise<SignedImageUploadResult> {
  try {
    if (
      !input
      || !isListingUploadFolder(input.folder)
      || !Number.isSafeInteger(input.size)
      || !/^[a-f0-9]{64}$/iu.test(input.checksumSha256)
    ) {
      return {
        success: false,
        message: 'تعذر تجهيز الصورة للرفع. حاول اختيارها مرة أخرى.',
      };
    }
    if (input.size <= 0) {
      return { success: false, message: 'الصورة المختارة فارغة.' };
    }
    if (input.size > MAX_IMAGE_BYTES) {
      return {
        success: false,
        message: 'حجم الصورة بعد التجهيز ما زال كبيرًا. أعد المحاولة وسيتم ضغطها أكثر.',
      };
    }
    const extension = IMAGE_EXTENSIONS[input.contentType];
    if (!extension) {
      return {
        success: false,
        message: 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.',
      };
    }
    const profile = await getCurrentProfile();
    if (!profile || !profile.is_active || profile.must_change_password) {
      return { success: false, message: 'سجّل الدخول مرة أخرى قبل رفع الصور.' };
    }
    if (
      (input.folder === 'requests' && profile.role !== 'admin')
      || (input.folder === 'merchant' && profile.role !== 'merchant')
      || input.folder === 'feedback'
    ) {
      return { success: false, message: 'غير مصرح لك برفع الصور في هذا المسار.' };
    }

    if (profile.role === 'admin') {
      await requireMarketplaceAdminRole(['super_admin', 'catalog_reviewer'], { failureMode: 'throw' });
    }

    const { supabase, allowed, error: limitError } =
      await consumeImageUploadAllowance(profile.id);
    if (limitError || !allowed) {
      return {
        success: false,
        message: limitError
          ? 'تعذر التحقق من رفع الصورة حالياً.'
          : 'تم رفع صور كثيرة من هذا الاتصال. حاول مرة أخرى بعد ساعة.',
      };
    }

    const sessionId = randomUUID();
    const path = `staging/legacy-place/${profile.id}/${sessionId}.${extension}`;
    const { error } = await (supabase as any).from('legacy_media_uploads').insert({
      id: sessionId,
      owner_id: profile.id,
      merchant_id: profile.role === 'merchant' ? profile.merchant_id : null,
      folder: input.folder,
      purpose: 'place',
      staging_key: path,
      expected_content_type: input.contentType,
      expected_size_bytes: input.size,
      expected_sha256: input.checksumSha256.toLowerCase(),
    });
    if (error) throw error;

    try {
      const signed = await createPrivateStageUpload({
        checksumSha256: input.checksumSha256.toLowerCase(),
        contentType: input.contentType,
        objectKey: path,
        sizeBytes: input.size,
      });
      return {
        success: true,
        sessionId,
        uploadUrl: signed.uploadUrl,
        requiredHeaders: signed.requiredHeaders,
      };
    } catch (error) {
      await (supabase as any).from('legacy_media_uploads').update({
        status: 'failed',
        failure_code: 'storage_presign_failed',
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);
      throw error;
    }
  } catch (error) {
    logSafeServerFailure('error', 'storage_upload_preparation_failed', { failure: error });
    return {
      success: false,
      message: 'تعذر الاتصال بخدمة الصور حالياً. حاول مرة أخرى.',
    };
  }
}

/**
 * Retained only as a compatibility export for inactive legacy modals. Active
 * screens use private direct-to-object-storage staging through prepareImageUpload.
 */
export async function uploadImageToStorage(
  file: File,
  folder: ListingUploadFolder = 'requests',
): Promise<ImageUploadResult> {
  void file;
  void folder;
  return {
    success: false,
    message: 'مسار الرفع القديم متوقف. أعد فتح النموذج واستخدم مسار الصور الجديد.',
  };
}

/**
 * Submits feedback or change request with optional target_place_id, proposed_phone, proposed_images
 */
export async function submitFeedbackSubmission(
  placeNameOrPhone: string,
  feedbackType: FeedbackType,
  contactPhone: string,
  notes: string,
  imageUrls: string[] = [],
  targetPlaceId?: string | null,
  proposedPhone?: string | null,
  rating?: number | null,
  proposedDetails?: Partial<PlaceDetailsInput>,
): Promise<{ success: boolean; message?: string }> {
  try {
    const isOpinion = feedbackType === 'general_suggestion' || feedbackType === 'rating';
    const normalizedContact = contactPhone.replace(/\D/g, '').replace(/^20/, '0');
    if (!notes.trim() || notes.trim().length > 2000) {
      throw new Error('اكتب تفاصيل واضحة لا تتجاوز 2000 حرف.');
    }
    if (!isOpinion && !/^01[0125]\d{8}$/.test(normalizedContact)) {
      throw new Error('رقم التواصل غير صحيح.');
    }
    if (feedbackType === 'rating' && (!rating || rating < 1 || rating > 5)) {
      throw new Error('اختر تقييماً من نجمة إلى خمس نجوم.');
    }
    const uploadedUrls = validateListingImageUrls(imageUrls, 3);
    const details = validatePlaceDetails(proposedDetails ?? {});
    if (
      feedbackType === 'details_update'
      && !details.whatsappGroupUrl
      && !details.telegramUrl
      && !details.address
      && !details.mapUrl
    ) {
      throw new Error('أضف جروباً أو عنواناً أو رابط خريطة واحداً على الأقل.');
    }

    if (isDemoMode()) {
      triggerInstantRevalidation();
      return { success: true, message: 'تم استلام طلب التعديل بنجاح! (وضع العرض التجريبي)' };
    }

    const sessionClient = await createClient();
    const authData = await sessionClient.auth.getUser().catch(() => ({
      data: { user: null },
    }));
    const admin = createAdminClient();
    const requestKey = await getAnonymousRequestKey('public-feedback');
    const { data: allowed, error: rateError } = await (admin as any).rpc(
      'consume_public_submission_rate_limit',
      { p_request_key: requestKey, p_limit: 12 },
    );
    if (rateError) throw new Error('تعذر التحقق من الطلب. حاول مرة أخرى.');
    if (!allowed) throw new Error('تم إرسال طلبات كثيرة. حاول مرة أخرى بعد ساعة.');

    const { error } = await (admin as any).from('feedback_requests').insert([
      {
        target_place_id: targetPlaceId || null,
        place_name_or_phone: placeNameOrPhone.trim() || 'عام',
        feedback_type: feedbackType,
        source: 'public',
        submitted_by: authData.data.user?.id ?? null,
        rating: feedbackType === 'rating' ? rating : null,
        contact_phone: normalizedContact || 'بدون رقم',
        proposed_phone: proposedPhone?.trim() || null,
        proposed_whatsapp_group_url: details.whatsappGroupUrl,
        proposed_telegram_url: details.telegramUrl,
        proposed_address: details.address,
        proposed_map_url: details.mapUrl,
        notes: notes.trim(),
        images: uploadedUrls,
        proposed_images: uploadedUrls,
        status: 'pending',
      },
    ]);

    if (error) throw error;

    triggerInstantRevalidation();
    return { success: true, message: 'تم استلام طلبك بنجاح! سيتم المراجعة بواسطة الإدارة قريباً.' };
  } catch (err: any) {
    logSafeServerFailure('error', 'feedback_submission_failed', { failure: err });
    return {
      success: false,
      message: safeArabicMessage(
        err,
        'تعذر إرسال طلب التعديل حالياً. بياناتك ما زالت في النموذج، حاول مرة أخرى.',
      ),
    };
  }
}

/**
 * Upvote / Recommend a Place (anonymous, no auth required)
 * Increments the recommend_count column by 1
 */
export async function upvotePlace(
  placeId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    if (isDemoMode()) {
      return { success: true, message: 'تم التصويت بنجاح! (وضع تجريبي)' };
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(placeId)) {
      return { success: false, message: 'المكان غير موجود.' };
    }
    const admin = createAdminClient();
    const requestKey = await getAnonymousRequestKey('place-upvote');
    const { data: recorded, error } = await (admin as any).rpc(
      'record_place_upvote',
      {
        p_request_key: requestKey,
        p_place_id: placeId,
      },
    );
    if (error) throw error;
    return {
      success: true,
      message: recorded ? 'شكراً لتوصيتك! 👍' : 'تم تسجيل توصيتك من قبل.',
    };
  } catch (err: any) {
    logSafeServerFailure('error', 'place_upvote_failed', { failure: err });
    return {
      success: false,
      message: safeArabicMessage(err, 'حدث خطأ أثناء التصويت. حاول مرة أخرى.'),
    };
  }
}
