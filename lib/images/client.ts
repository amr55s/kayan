'use client';

import {
  uploadImageToStorage,
  type ListingUploadFolder,
} from '@/lib/supabase/actions';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = 1_050_000;
const MAX_WIDTH = 2400;
const MAX_HEIGHT = 3400;
const MAX_PIXELS = 8_000_000;
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type ImageProcessingProgress = {
  current: number;
  total: number;
  fileName: string;
  stage: 'optimizing' | 'uploading';
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`تعذر قراءة الصورة "${file.name}".`));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('تعذر تجهيز الصورة للرفع.'));
      },
      'image/webp',
      quality,
    );
  });
}

function calculateSize(width: number, height: number, reduction = 1) {
  const dimensionScale = Math.min(
    1,
    MAX_WIDTH / width,
    MAX_HEIGHT / height,
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  const scale = dimensionScale * reduction;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function renderWebp(
  image: HTMLImageElement,
  reduction: number,
  quality: number,
): Promise<Blob> {
  const size = calculateSize(
    image.naturalWidth,
    image.naturalHeight,
    reduction,
  );
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('المتصفح لا يدعم معالجة الصور.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvasToBlob(canvas, quality);
}

/**
 * Resizes and converts user images before they enter a Server Action.
 * The generous 8MP working size keeps menu text legible while the byte target
 * prevents large uploads from exhausting the browser or Vercel request limit.
 */
export async function optimizeImageForUpload(file: File): Promise<File> {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error('الصور المسموحة هي JPG أو PNG أو WEBP.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`الصورة "${file.name}" أكبر من 15 ميجابايت.`);
  }

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error(`أبعاد الصورة "${file.name}" غير صالحة.`);
  }

  let best: Blob | null = null;
  for (const reduction of [1, 0.9, 0.8]) {
    for (const quality of [0.92, 0.88, 0.84, 0.8]) {
      const blob = await renderWebp(image, reduction, quality);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_UPLOAD_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
        return new File([blob], `${baseName}.webp`, {
          type: 'image/webp',
          lastModified: Date.now(),
        });
      }
    }
  }

  if (!best) throw new Error(`تعذر تحسين الصورة "${file.name}".`);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([best], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export async function optimizeImagesForUpload(
  files: File[],
  onProgress?: (progress: ImageProcessingProgress) => void,
): Promise<File[]> {
  const optimized: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress?.({
      current: index + 1,
      total: files.length,
      fileName: file.name,
      stage: 'optimizing',
    });
    optimized.push(await optimizeImageForUpload(file));
  }
  return optimized;
}

export async function uploadOptimizedImages(
  files: File[],
  folder: ListingUploadFolder,
  onProgress?: (progress: ImageProcessingProgress) => void,
): Promise<string[]> {
  const optimized = await optimizeImagesForUpload(files, onProgress);
  const urls: string[] = [];

  for (let index = 0; index < optimized.length; index += 1) {
    const file = optimized[index];
    onProgress?.({
      current: index + 1,
      total: optimized.length,
      fileName: file.name,
      stage: 'uploading',
    });
    const url = await uploadImageToStorage(file, folder);
    if (!url) throw new Error('تعذر رفع إحدى الصور. حاول مرة أخرى.');
    urls.push(url);
  }

  return urls;
}
