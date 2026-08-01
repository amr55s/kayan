import 'server-only';

import sharp from 'sharp';

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_WIDTH = 2400;
const MAX_HEIGHT = 3400;
const TARGET_OUTPUT_BYTES = 1_500_000;
const PASSTHROUGH_WEBP_BYTES = 1_600_000;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
  width: number;
  height: number;
};

async function inspectImage(input: Buffer) {
  return sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  }).metadata();
}

async function encodeWebp(input: Buffer, quality: number, scale = 1) {
  return sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: Math.round(MAX_WIDTH * scale),
      height: Math.round(MAX_HEIGHT * scale),
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .toColourspace('srgb')
    .sharpen({ sigma: 0.45 })
    .webp({
      quality,
      alphaQuality: 90,
      effort: 5,
      smartSubsample: true,
    })
    .toBuffer({ resolveWithObject: true });
}

/**
 * Validates, auto-orients, strips metadata and normalizes every stored image to
 * WebP. High working dimensions and light sharpening preserve menu text.
 */
export async function processImageForStorage(
  input: Buffer,
): Promise<ProcessedImage> {
  const source = await inspectImage(input);
  if (!source.width || !source.height) {
    throw new Error('invalid_image_dimensions');
  }

  // Browser-generated WebP files are already auto-oriented, resized and
  // compressed. Keeping their original bytes avoids a second lossy encode,
  // which is especially important for menu text and small Arabic lettering.
  if (
    source.format === 'webp' &&
    source.width <= MAX_WIDTH &&
    source.height <= MAX_HEIGHT &&
    input.length <= PASSTHROUGH_WEBP_BYTES
  ) {
    return {
      buffer: Buffer.from(input),
      contentType: 'image/webp',
      extension: 'webp',
      width: source.width,
      height: source.height,
    };
  }

  let best = await encodeWebp(input, 90);
  if (best.data.length > TARGET_OUTPUT_BYTES) best = await encodeWebp(input, 86);
  if (best.data.length > TARGET_OUTPUT_BYTES) best = await encodeWebp(input, 82);
  if (best.data.length > TARGET_OUTPUT_BYTES) {
    best = await encodeWebp(input, 82, 0.88);
  }

  const verified = await inspectImage(best.data);
  if (
    verified.format !== 'webp' ||
    !verified.width ||
    !verified.height
  ) {
    throw new Error('invalid_processed_image');
  }

  return {
    buffer: Buffer.from(best.data),
    contentType: 'image/webp',
    extension: 'webp',
    width: verified.width,
    height: verified.height,
  };
}

/** Produces a compact, metadata-free square portrait for public driver cards. */
export async function processAvatarForStorage(input: Buffer): Promise<ProcessedImage> {
  const source = await inspectImage(input);
  if (!source.width || !source.height) {
    throw new Error('invalid_image_dimensions');
  }

  const result = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .resize(640, 640, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .toColourspace('srgb')
    .sharpen({ sigma: 0.35 })
    .webp({ quality: 84, alphaQuality: 88, effort: 5, smartSubsample: true })
    .toBuffer();

  return {
    buffer: Buffer.from(result),
    contentType: 'image/webp',
    extension: 'webp',
    width: 640,
    height: 640,
  };
}
