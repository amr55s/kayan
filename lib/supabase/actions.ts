'use server';

import { createClient } from './server';
import { createAdminClient } from './admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { createHash, randomUUID } from 'node:crypto';
import { FeedbackType } from '@/types';
import { processImageForStorage } from '@/lib/images/server';
import { toPlainArrayBuffer } from '@/lib/images/buffer';
import { validateListingImageUrls } from '@/lib/images/urls';
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
      path: string;
      token: string;
      url: string;
    }
  | { success: false; message: string };
const MAX_IMAGE_BYTES = 3_500_000;
const STORAGE_UPLOAD_ATTEMPTS = 2;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
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

async function consumeImageUploadAllowance() {
  const supabase = createAdminClient();
  const requestKey = await getAnonymousRequestKey('listing-upload');
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
  } catch (e) {
    console.warn('Revalidation notice:', e);
  }
}

/**
 * Creates a short-lived Storage upload token without sending image bytes
 * through the Next.js/Vercel function. This avoids Server Action and platform
 * request-body limits while keeping bucket credentials on the server.
 */
export async function prepareImageUpload(
  input: {
    contentType: string;
    folder: ListingUploadFolder;
    size: number;
  },
): Promise<SignedImageUploadResult> {
  try {
    if (!input || !isListingUploadFolder(input.folder) || !Number.isSafeInteger(input.size)) {
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
    if (isDemoMode()) {
      return {
        success: false,
        message: 'رفع الصور غير متاح في وضع العرض التجريبي.',
      };
    }

    const { supabase, allowed, error: limitError } =
      await consumeImageUploadAllowance();
    if (limitError || !allowed) {
      return {
        success: false,
        message: limitError
          ? 'تعذر التحقق من رفع الصورة حالياً.'
          : 'تم رفع صور كثيرة من هذا الاتصال. حاول مرة أخرى بعد ساعة.',
      };
    }

    const path = `${input.folder}/${Date.now()}_${randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage
      .from('listing-images')
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('Signed Storage upload preparation failed:', error);
      return {
        success: false,
        message: 'تعذر بدء رفع الصورة حالياً. حاول مرة أخرى.',
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from('listing-images')
      .getPublicUrl(path);
    if (!publicUrlData.publicUrl) {
      return {
        success: false,
        message: 'تعذر إنشاء رابط الصورة.',
      };
    }

    return {
      success: true,
      path,
      token: data.token,
      url: publicUrlData.publicUrl,
    };
  } catch (error) {
    console.error('Signed Storage upload exception:', error);
    return {
      success: false,
      message: 'تعذر الاتصال بخدمة الصور حالياً. حاول مرة أخرى.',
    };
  }
}

/**
 * Uploads an image file to Supabase Storage ('listing-images' bucket)
 * Returns the public URL of the uploaded image or null on error.
 */
export async function uploadImageToStorage(
  file: File,
  folder: ListingUploadFolder = 'requests',
): Promise<ImageUploadResult> {
  try {
    if (!file.size || file.size > MAX_IMAGE_BYTES) {
      return {
        success: false,
        message: 'تعذر إرسال الصورة للمعالجة. حاول اختيارها مرة أخرى.',
      };
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return {
        success: false,
        message: 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.',
      };
    }

    if (isDemoMode()) {
      console.warn('Supabase in demo mode: Skipping file storage upload.');
      return { success: true, url: null };
    }

    const { supabase, allowed, error: limitError } =
      await consumeImageUploadAllowance();
    if (limitError || !allowed) {
      return {
        success: false,
        message: limitError
          ? 'تعذر التحقق من رفع الصورة حالياً.'
          : 'تم رفع صور كثيرة من هذا الاتصال. حاول مرة أخرى بعد ساعة.',
      };
    }
    const processed = await processImageForStorage(
      Buffer.from(await file.arrayBuffer()),
    );
    const uploadBody = toPlainArrayBuffer(processed.buffer);
    let storedPath: string | null = null;

    for (let attempt = 1; attempt <= STORAGE_UPLOAD_ATTEMPTS; attempt += 1) {
      const fileName = `${Date.now()}_${attempt}_${Math.random().toString(36).substring(2, 9)}.${processed.extension}`;
      const filePath = `${folder}/${fileName}`;
      const { data, error } = await supabase.storage
        .from('listing-images')
        .upload(filePath, uploadBody.slice(0), {
          cacheControl: '31536000',
          contentType: processed.contentType,
          upsert: false,
        });

      if (!error && data?.path) {
        const { data: storedInfo, error: infoError } = await supabase.storage
          .from('listing-images')
          .info(data.path);
        if (!infoError && storedInfo?.size && storedInfo.size > 0) {
          storedPath = data.path;
          break;
        }
        console.error(`Storage verification attempt ${attempt} failed:`, infoError);
      } else {
        console.error(`Storage upload attempt ${attempt} failed:`, error);
      }
    }

    if (!storedPath) {
      return {
        success: false,
        message: 'تعذر رفع الصورة حالياً.',
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from('listing-images')
      .getPublicUrl(storedPath);

    if (!publicUrlData.publicUrl) {
      return {
        success: false,
        message: 'تم رفع الصورة لكن تعذر إنشاء رابط العرض.',
      };
    }

    return { success: true, url: publicUrlData.publicUrl };
  } catch (err) {
    console.error('Storage upload exception:', err);
    return {
      success: false,
      message: 'تعذر معالجة الصورة أو رفعها. لم يتم حفظ المكان بدونها؛ حاول مرة أخرى.',
    };
  }
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
    console.error('Error submitting feedback:', err);
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
    console.error('Error upvoting place:', err);
    return {
      success: false,
      message: safeArabicMessage(err, 'حدث خطأ أثناء التصويت. حاول مرة أخرى.'),
    };
  }
}
