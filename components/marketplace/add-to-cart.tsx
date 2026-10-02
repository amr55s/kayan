'use client';

import { Button } from '@heroui/react/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';
import { MARKETPLACE_CART_ERROR_COPY } from './cart-copy';
import type {
  MarketplaceAddToCartAction,
  MarketplaceAddToCartState,
} from './view-models';
import styles from './marketplace.module.css';

const idle: MarketplaceAddToCartState = { status: 'idle' };

export function useAddToCart(action: MarketplaceAddToCartAction) {
  return useActionState(action, idle);
}

/** Inline confirmation so adding never interrupts browsing. */
export function AddToCartFeedback({
  state,
  showCheckout = false,
}: {
  state: MarketplaceAddToCartState;
  showCheckout?: boolean;
}) {
  if (state.status === 'added') {
    return (
      <p className={styles.addedFeedback} role="status">
        <Check className="size-4 shrink-0" aria-hidden="true" />
        <span>أُضيف إلى السلة</span>
        <Link href="/marketplace/cart" className={styles.addedFeedbackLink}>عرض السلة</Link>
        {showCheckout ? (
          <Link href="/marketplace/checkout" className={styles.addedFeedbackLink}>إتمام الطلب</Link>
        ) : null}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className={styles.addFailedFeedback} role="alert">
        {MARKETPLACE_CART_ERROR_COPY[state.code]}
      </p>
    );
  }
  return null;
}

/** One-tap add for catalog cards: default variant, quantity one. */
export function AddToCartCardForm({
  action,
  productId,
  variantId,
  productName,
}: {
  action: MarketplaceAddToCartAction;
  productId: string;
  variantId: string;
  productName: string;
}) {
  const [state, formAction, isPending] = useAddToCart(action);
  return (
    <form action={formAction} className={styles.addToCartForm}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value="1" />
      <Button
        type="submit"
        isPending={isPending}
        isDisabled={isPending}
        className={styles.primaryButton}
        aria-label={`أضف ${productName} إلى السلة`}
      >
        {isPending ? 'جارٍ الإضافة…' : 'أضف إلى السلة'}
      </Button>
      <AddToCartFeedback state={state} />
    </form>
  );
}
