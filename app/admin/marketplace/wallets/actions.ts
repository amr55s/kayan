'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { egpToMinor } from '@/lib/commerce/money';
import {
  adjustMerchantWalletAsAdmin,
  reviewWalletTopupRequestAsAdmin,
  saveMarketplaceFeeSettingsAsAdmin,
  saveMarketplaceSubscriptionPlanAsAdmin,
  WalletError,
} from '@/lib/commerce/wallet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH = '/admin/marketplace/wallets';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value: string, min: number, max: number): number {
  if (!/^\d{1,7}$/u.test(value)) throw new WalletError('invalid_input');
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new WalletError('invalid_input');
  return parsed;
}

function money(value: string): number {
  try {
    return egpToMinor(value);
  } catch {
    throw new WalletError('invalid_input');
  }
}

async function run(successNotice: string, anchor: string, task: () => Promise<void>): Promise<never> {
  await requireMarketplaceAdminRole(['finance'], { nextPath: PATH });
  let target = `${PATH}?notice=${successNotice}${anchor}`;
  try {
    await task();
  } catch (error) {
    target = `${PATH}?error=${error instanceof WalletError ? error.code : 'service_unavailable'}${anchor}`;
  }
  revalidatePath(PATH);
  revalidatePath('/admin/marketplace/dashboard');
  redirect(target);
}

export async function reviewWalletTopupAction(form: FormData): Promise<void> {
  const approve = text(form, 'approve') === 'true';
  await run(approve ? 'topup_approved' : 'topup_rejected', '', async () => {
    const requestId = text(form, 'requestId');
    if (!UUID.test(requestId)) throw new WalletError('invalid_input');
    const notes = text(form, 'notes');
    if (!approve && notes.length < 3) throw new WalletError('notes_required');
    await reviewWalletTopupRequestAsAdmin({ requestId, approve, notes: notes || null });
    revalidatePath('/merchant/marketplace/wallet');
  });
}

export async function adjustMerchantWalletAction(form: FormData): Promise<void> {
  await run('wallet_adjusted', '#wallets', async () => {
    const merchantId = text(form, 'merchantId');
    const note = text(form, 'note');
    const direction = text(form, 'direction');
    if (!UUID.test(merchantId) || note.length < 3 || !['credit', 'debit'].includes(direction)) {
      throw new WalletError('invalid_input');
    }
    const amount = money(text(form, 'amountEgp'));
    if (amount <= 0) throw new WalletError('invalid_input');
    await adjustMerchantWalletAsAdmin({
      merchantId,
      amountPiastres: direction === 'credit' ? amount : -amount,
      note,
      idempotencyKey: UUID.test(text(form, 'idempotencyKey')) ? text(form, 'idempotencyKey') : randomUUID(),
    });
    revalidatePath('/merchant/marketplace/wallet');
  });
}

export async function saveFeeSettingsAction(form: FormData): Promise<void> {
  await run('settings_saved', '#settings', async () => {
    const percent = text(form, 'percent');
    if (!/^\d{1,2}(?:\.\d{1,2})?$/u.test(percent)) throw new WalletError('invalid_input');
    const maxFee = text(form, 'maxFeeEgp');
    await saveMarketplaceFeeSettingsAsAdmin({
      fixedPiastres: money(text(form, 'fixedEgp') || '0'),
      percentBps: Math.round(Number(percent) * 100),
      maxPiastres: maxFee ? money(maxFee) : null,
      freeOrders: integer(text(form, 'freeOrders'), 0, 1000),
      minimumTopupPiastres: money(text(form, 'minimumTopupEgp')),
      recipientName: text(form, 'recipientName') || null,
      instapayHandle: text(form, 'instapayHandle') || null,
      phone: text(form, 'paymentPhone') || null,
    });
    revalidatePath('/merchant/marketplace/wallet');
  });
}

export async function saveSubscriptionPlanAction(form: FormData): Promise<void> {
  await run('plan_saved', '#plans', async () => {
    const planId = text(form, 'planId');
    if (planId && !UUID.test(planId)) throw new WalletError('invalid_input');
    const name = text(form, 'name');
    if (name.length < 2 || name.length > 80) throw new WalletError('invalid_input');
    await saveMarketplaceSubscriptionPlanAsAdmin({
      planId: planId || null,
      name,
      durationDays: integer(text(form, 'durationDays'), 1, 366),
      pricePiastres: money(text(form, 'priceEgp')),
      isActive: text(form, 'isActive') === 'on',
    });
    revalidatePath('/merchant/marketplace/wallet');
  });
}
