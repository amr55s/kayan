'use client';

import {
  uploadImageToStorage,
  type ListingUploadFolder,
} from '@/lib/supabase/actions';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = 1_050_000;
const MAX_WIDTH = 2200;
const MAX_HEIGHT = 3000;
const MAX_PIXELS = 5_000_000;
const SERVER_FALLBACK_BYTES = 3_400_000;
const ALLOWED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ImageProcessingProgress = {
  current: number;
  total: number;
  fileName: string;
  stage: 'optimizing' | 'uploading';
};

export type ImageBatchUploadResult = {
  urls: string[];
  failedFiles: string[];
};

type DecodedImage = {
  height: number;
  release: () => void;
  source: CanvasImageSource;
  width: number;
};

function loadHtmlImage(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => undefined,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`تعذر قراءة الصورة "${file.name}".`));
    };
    image.src = objectUrl;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some mobile engines expose createImageBitmap but cannot decode every format.
    }
  }
  return loadHtmlImage(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webpBlob) => {
      if (webpBlob?.size) {
        resolve(webpBlob);
        return;
      }
      canvas.toBlob((jpegBlob) => {
        if (jpegBlob?.size) resolve(jpegBlob);
        else reject(new Error('تعذر تجهيز الصورة للرفع.'));
      }, 'image/jpeg', quality);
    }, 'image/webp', quality);
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

async function renderImage(
  image: DecodedImage,
  canvas: HTMLCanvasElement,
  reduction: number,
  quality: number,
): Promise<Blob> {
  const size = calculateSize(image.width, image.height, reduction);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('المتصفح لا يدعم معالجة الصور.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image.source, 0, 0, size.width, size.height);
  return canvasToBlob(canvas, quality);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

/**
 * Decodes once, reuses one canvas, and performs at most three encodes. This
 * keeps low-memory phones responsive while preserving readable menu text.
 */
export async function optimizeImageForUpload(file: File): Promise<File> {
  if (!file.size) throw new Error(`الصورة "${file.name}" فارغة.`);
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
    throw new Error(`صيغة الصورة "${file.name}" غير مدعومة.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`الصورة "${file.name}" أكبر من 20 ميجابايت.`);
  }

  let image: DecodedImage | null = null;
  try {
    image = await decodeImage(file);
    if (!image.width || !image.height) throw new Error('invalid_dimensions');

    const canvas = document.createElement('canvas');
    const attempts = [
      { reduction: 1, quality: 0.88 },
      { reduction: 1, quality: 0.8 },
      { reduction: 0.82, quality: 0.8 },
    ];
    let best: Blob | null = null;

    for (const attempt of attempts) {
      const blob = await renderImage(
        image,
        canvas,
        attempt.reduction,
        attempt.quality,
      );
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_UPLOAD_BYTES) break;
    }

    if (!best) throw new Error('browser_encoding_failed');
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const extension = best.type === 'image/jpeg' ? 'jpg' : 'webp';
    return new File([best], `${baseName}.${extension}`, {
      type: best.type || 'image/webp',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('Browser image optimization failed; using server fallback.', error);
    if (file.size <= SERVER_FALLBACK_BYTES) return file;
    throw new Error(
      `تعذر قراءة الصورة "${file.name}" داخل المتصفح. جرّب إرسالها من تطبيق الصور أو واتساب.`,
    );
  } finally {
    image?.release();
  }
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
    await yieldToBrowser();
  }
  return optimized;
}

export async function uploadOptimizedImages(
  files: File[],
  folder: ListingUploadFolder,
  onProgress?: (progress: ImageProcessingProgress) => void,
): Promise<ImageBatchUploadResult> {
  const urls: string[] = [];
  const failedFiles: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const originalFile = files[index];
    try {
      onProgress?.({
        current: index + 1,
        total: files.length,
        fileName: originalFile.name,
        stage: 'optimizing',
      });
      const optimizedFile = await optimizeImageForUpload(originalFile);
      onProgress?.({
        current: index + 1,
        total: files.length,
        fileName: optimizedFile.name,
        stage: 'uploading',
      });
      const result = await uploadImageToStorage(optimizedFile, folder);
      if (!result.success || !result.url) {
        failedFiles.push(originalFile.name);
      } else {
        urls.push(result.url);
      }
    } catch (error) {
      console.error(`Image upload failed for "${originalFile.name}":`, error);
      failedFiles.push(originalFile.name);
    }
    await yieldToBrowser();
  }

  return { urls, failedFiles };
}
