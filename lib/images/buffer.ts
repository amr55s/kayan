/**
 * Copies image bytes into a standalone ArrayBuffer with the exact byte length.
 * This avoids both SharedArrayBuffer rejection and pooled Buffer over-read when
 * the payload is passed to Supabase Storage from a serverless runtime.
 */
export function toPlainArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer;
}
