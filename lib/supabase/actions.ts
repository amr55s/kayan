'use server';

import { createClient } from './server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { FeedbackType } from '@/types';
import { processImageForStorage } from '@/lib/images/server';
import { toPlainArrayBuffer } from '@/lib/images/buffer';
import { validateListingImageUrls } from '@/lib/images/urls';

export type ListingUploadFolder = 'requests' | 'feedback' | 'merchant';
export type ImageUploadResult =
  | { success: true; url: string | null }
  | { success: false; message: string };
const MAX_IMAGE_BYTES = 3_500_000;
const STORAGE_UPLOAD_ATTEMPTS = 2;

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

    if (isDemoMode()) {
      console.warn('Supabase in demo mode: Skipping file storage upload.');
      return { success: true, url: null };
    }

    const supabase = await createClient();
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
        storedPath = data.path;
        break;
      }

      console.error(`Storage upload attempt ${attempt} failed:`, error);
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
      message: 'تعذر معالجة الصورة أو رفعها، لكن يمكنك إرسال باقي الطلب.',
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

    if (isDemoMode()) {
      triggerInstantRevalidation();
      return { success: true, message: 'تم استلام طلب التعديل بنجاح! (وضع العرض التجريبي)' };
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from('feedback_requests').insert([
      {
        target_place_id: targetPlaceId || null,
        place_name_or_phone: placeNameOrPhone.trim() || 'عام',
        feedback_type: feedbackType,
        source: 'public',
        submitted_by: authData.user?.id ?? null,
        rating: feedbackType === 'rating' ? rating : null,
        contact_phone: normalizedContact || 'بدون رقم',
        proposed_phone: proposedPhone?.trim() || null,
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

    const supabase = await createClient();

    // Try RPC first, fallback to manual increment
    const { data: place, error: fetchErr } = await (supabase as any)
      .from('places')
      .select('recommend_count')
      .eq('id', placeId)
      .maybeSingle();

    if (fetchErr || !place) {
      return { success: false, message: 'المكان غير موجود.' };
    }

    const currentCount = (place as any).recommend_count || 0;

    const { error: updateErr } = await (supabase as any)
      .from('places')
      .update({ recommend_count: currentCount + 1 })
      .eq('id', placeId);

    if (updateErr) throw updateErr;

    return { success: true, message: 'شكراً لتوصيتك! 👍' };
  } catch (err: any) {
    console.error('Error upvoting place:', err);
    return {
      success: false,
      message: safeArabicMessage(err, 'حدث خطأ أثناء التصويت. حاول مرة أخرى.'),
    };
  }
}
