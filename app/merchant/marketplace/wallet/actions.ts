'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { egpToMinor } from '@/lib/commerce/money';
import {
  createMyWalletTopupRequest,
  purchaseMyWalletSubscription,
  WALLET_PROOF_BUCKET,
  WALLET_PROOF_MAX_BYTES,
  WalletError,
} from '@/lib/commerce/wallet';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WALLET_PATH = '/merchant/marketplace/wallet';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function destination(merchantId: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams();
  if (UUID.test(merchantId)) params.set('merchant', merchantId);
  params.set(key, value);
  return `${WALLET_PATH}?${params.toString()}`;
}

/** The real image type from its leading bytes; the browser-reported type is not trusted. */
function sniffImage(bytes: Uint8Array): { extension: 'jpg' | 'png' | 'webp'; contentType: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  return null;
}

export async function requestWalletTopupAction(form: FormData): Promise<void> {
  const merchantId = text(form, 'merchantId');
  if (!UUID.test(merchantId)) redirect(`${WALLET_PATH}?error=invalid_input`);

  let amountPiastres: number;
  try {
    amountPiastres = egpToMinor(text(form, 'amountEgp'));
  } catch {
    redirect(destination(merchantId, 'error', 'invalid_input'));
  }
  const payerName = text(form, 'payerName');
  const payerPhone = text(form, 'payerPhone');
  const idempotencyKey = UUID.test(text(form, 'idempotencyKey')) ? text(form, 'idempotencyKey') : randomUUID();
  const proof = form.get('proof');
  if (payerName.length < 2 || payerName.length > 120 || !/^[0-9+\s-]{10,20}$/u.test(payerPhone)) {
    redirect(destination(merchantId, 'error', 'invalid_input'));
  }
  if (!(proof instanceof File) || proof.size === 0) {
    redirect(destination(merchantId, 'error', 'proof_required'));
  }
  if (proof.size > WALLET_PROOF_MAX_BYTES) {
    redirect(destination(merchantId, 'error', 'proof_too_large'));
  }
  const bytes = new Uint8Array(await proof.arrayBuffer());
  const image = sniffImage(bytes);
  if (!image) redirect(destination(merchantId, 'error', 'proof_invalid'));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(WALLET_PATH)}`);

  const proofPath = `${merchantId}/${randomUUID()}.${image.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(WALLET_PROOF_BUCKET)
    .upload(proofPath, bytes, { contentType: image.contentType, upsert: false });
  if (uploadError) redirect(destination(merchantId, 'error', 'upload_failed'));

  let target = destination(merchantId, 'notice', 'topup_requested');
  try {
    await createMyWalletTopupRequest({
      merchantId,
      amountPiastres,
      payerName,
      payerPhone,
      transferReference: text(form, 'transferReference').slice(0, 80) || null,
      proofPath,
      idempotencyKey,
    });
  } catch (error) {
    target = destination(merchantId, 'error', error instanceof WalletError ? error.code : 'service_unavailable');
  }
  revalidatePath(WALLET_PATH);
  redirect(target);
}

export async function purchaseWalletSubscriptionAction(form: FormData): Promise<void> {
  const merchantId = text(form, 'merchantId');
  const planId = text(form, 'planId');
  if (!UUID.test(merchantId) || !UUID.test(planId)) redirect(`${WALLET_PATH}?error=invalid_input`);
  const idempotencyKey = UUID.test(text(form, 'idempotencyKey')) ? text(form, 'idempotencyKey') : randomUUID();
  let target = destination(merchantId, 'notice', 'subscription_started');
  try {
    await purchaseMyWalletSubscription({ merchantId, planId, idempotencyKey });
  } catch (error) {
    target = destination(merchantId, 'error', error instanceof WalletError ? error.code : 'service_unavailable');
  }
  revalidatePath(WALLET_PATH);
  revalidatePath('/merchant/marketplace');
  redirect(target);
}
