import 'server-only';

import sharp from 'sharp';

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_WIDTH = 2400;
const MAX_HEIGHT = 3400;
const TARGET_OUTPUT_BYTES = 1_500_000;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
  width: number;
  height: number;
};

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
  let best = await encodeWebp(input, 90);
  if (best.data.length > TARGET_OUTPUT_BYTES) best = await encodeWebp(input, 86);
  if (best.data.length > TARGET_OUTPUT_BYTES) best = await encodeWebp(input, 82);
  if (best.data.length > TARGET_OUTPUT_BYTES) {
    best = await encodeWebp(input, 82, 0.88);
  }

  return {
    buffer: best.data,
    contentType: 'image/webp',
    extension: 'webp',
    width: best.info.width,
    height: best.info.height,
  };
}
