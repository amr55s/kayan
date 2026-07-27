'use server';

import { createClient } from './server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { FeedbackType } from '@/types';

type ListingUploadFolder = 'requests' | 'feedback' | 'merchant';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Helper to check if Supabase is running in demo/placeholder mode
 */
function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url.includes('placeholder');
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
): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
    throw new Error('الصور المسموحة هي JPG أو PNG أو WEBP وبحجم أقصى 5 ميجابايت.');
  }

  if (isDemoMode()) {
    console.warn('Supabase in demo mode: Skipping file storage upload.');
    return null;
  }

  const supabase = await createClient();
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  try {
    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.warn('Supabase storage upload error:', error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('listing-images')
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Storage upload exception:', err);
    return null;
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
  imageFiles: File[] = [],
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

    if (isDemoMode()) {
      triggerInstantRevalidation();
      return { success: true, message: 'تم استلام طلب التعديل بنجاح! (وضع العرض التجريبي)' };
    }

    const uploadedUrls: string[] = [];
    for (const file of imageFiles) {
      const url = await uploadImageToStorage(file, 'feedback');
      if (url) uploadedUrls.push(url);
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
      message: err.message || 'تعذر إرسال طلب التعديل. حاول مرة أخرى.',
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
    return { success: false, message: err.message || 'حدث خطأ أثناء التصويت.' };
  }
}
