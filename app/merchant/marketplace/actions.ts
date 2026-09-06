'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  archiveMerchantProduct,
  deleteMerchantProductMedia,
  MerchantCatalogError,
  parseMerchantProductForm,
  reorderMerchantProductMedia,
  saveMerchantProduct,
  submitMerchantProductForReview,
  undoMerchantProductMediaDeletion,
} from '@/lib/commerce/merchant-products';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function errorCode(error: unknown): string {
  return error instanceof MerchantCatalogError ? error.code : 'service_unavailable';
}

function productDestination(
  productId: string,
  state: 'error' | 'notice',
  code: string,
  retryKey?: string,
): string {
  const target = productId
    ? `/merchant/marketplace/${encodeURIComponent(productId)}/edit`
    : '/merchant/marketplace/new';
  const query = new URLSearchParams({ [state]: code });
  if (retryKey) query.set('retry', retryKey);
  return `${target}?${query}`;
}

function refreshMerchantCatalog(productId?: string) {
  revalidatePath('/merchant/marketplace');
  if (productId) revalidatePath(`/merchant/marketplace/${productId}/edit`);
  revalidatePath('/marketplace');
}

export async function saveMerchantProductAction(formData: FormData): Promise<void> {
  const input = parseMerchantProductForm(formData);
  const originalProductId = text(formData, 'productId');
  if (!input) redirect(productDestination(originalProductId, 'error', 'invalid_input'));
  let destination: string;
  let savedProductId = originalProductId;
  try {
    savedProductId = await saveMerchantProduct(input);
    destination = productDestination(savedProductId, 'notice', originalProductId ? 'updated' : 'created');
  } catch (error) {
    destination = productDestination(originalProductId, 'error', errorCode(error), input.idempotencyKey);
  }
  refreshMerchantCatalog(savedProductId);
  redirect(destination);
}

export async function submitMerchantProductForReviewAction(formData: FormData): Promise<void> {
  const productId = text(formData, 'productId');
  let destination: string;
  try {
    await submitMerchantProductForReview(productId);
    destination = productDestination(productId, 'notice', 'submitted');
  } catch (error) {
    destination = productDestination(productId, 'error', errorCode(error));
  }
  refreshMerchantCatalog(productId);
  redirect(destination);
}

export async function archiveMerchantProductAction(formData: FormData): Promise<void> {
  const productId = text(formData, 'productId');
  let destination: string;
  try {
    await archiveMerchantProduct({
      productId,
      expectedUpdatedAt: text(formData, 'expectedUpdatedAt'),
      idempotencyKey: text(formData, 'idempotencyKey'),
    });
    destination = '/merchant/marketplace?notice=archived';
  } catch (error) {
    destination = `/merchant/marketplace?error=${encodeURIComponent(errorCode(error))}`;
  }
  refreshMerchantCatalog(productId);
  redirect(destination);
}

export async function reorderMerchantProductImagesAction(formData: FormData): Promise<void> {
  const productId = text(formData, 'productId');
  let destination: string;
  try {
    const raw = JSON.parse(text(formData, 'orderedAssetIds')) as unknown;
    if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
      throw new MerchantCatalogError('invalid_input');
    }
    await reorderMerchantProductMedia({
      productId,
      storeId: text(formData, 'storeId'),
      orderedAssetIds: raw,
      expectedUpdatedAt: text(formData, 'expectedEntityUpdatedAt'),
    });
    destination = productDestination(productId, 'notice', 'images_reordered');
  } catch (error) {
    destination = productDestination(productId, 'error', errorCode(error));
  }
  refreshMerchantCatalog(productId);
  redirect(destination);
}

export async function deleteMerchantProductImageAction(formData: FormData): Promise<void> {
  const productId = text(formData, 'productId');
  let destination: string;
  try {
    await deleteMerchantProductMedia({
      productId,
      assetId: text(formData, 'assetId'),
      expectedAssetUpdatedAt: text(formData, 'expectedAssetUpdatedAt'),
    });
    destination = productDestination(productId, 'notice', 'image_deleted');
  } catch (error) {
    destination = productDestination(productId, 'error', errorCode(error));
  }
  refreshMerchantCatalog(productId);
  redirect(destination);
}

export async function undoMerchantProductImageDeletionAction(formData: FormData): Promise<void> {
  const productId = text(formData, 'productId');
  let destination: string;
  try {
    await undoMerchantProductMediaDeletion({
      productId,
      undoId: text(formData, 'undoId'),
    });
    destination = productDestination(productId, 'notice', 'image_restored');
  } catch (error) {
    destination = productDestination(productId, 'error', errorCode(error));
  }
  refreshMerchantCatalog(productId);
  redirect(destination);
}
