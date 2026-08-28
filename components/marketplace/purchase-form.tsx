'use client';

import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { RadioGroup } from '@heroui/react/radio-group';
import { Radio } from '@heroui/react/radio';
import { useState } from 'react';
import { formatMarketplaceMoney } from './format';
import type {
  MarketplaceFormAction,
  MarketplaceMoney,
  MarketplaceVariantOption,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplacePurchaseFormProps = {
  productId: string;
  basePrice: MarketplaceMoney;
  variants: MarketplaceVariantOption[];
  maxQuantityPerOrder: number;
  isInStock: boolean;
  addToCartAction?: MarketplaceFormAction;
};

export function MarketplacePurchaseForm({
  productId,
  basePrice,
  variants,
  maxQuantityPerOrder,
  isInStock,
  addToCartAction,
}: MarketplacePurchaseFormProps) {
  const firstAvailable = variants.find((variant) => variant.isInStock) ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? firstAvailable;
  const availableLimit = selectedVariant?.availableQuantity == null
    ? maxQuantityPerOrder
    : Math.min(maxQuantityPerOrder, Math.max(0, selectedVariant.availableQuantity));
  const purchasable = isInStock && (selectedVariant?.isInStock ?? true) && availableLimit > 0;

  return (
    <form className={styles.purchaseForm} action={addToCartAction}>
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 0 ? (
        <RadioGroup
          name="variantId"
          value={variantId}
          onChange={(value) => {
            setVariantId(value);
            setQuantity(1);
          }}
          className={styles.selectWrap}
        >
          <Label className={styles.label}>الخيارات المتاحة</Label>
          <div className="grid gap-2">
            {variants.map((variant) => (
              <Radio key={variant.id} value={variant.id} isDisabled={!variant.isInStock}>
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <span>{variant.label} — {formatMarketplaceMoney(variant.price)}{variant.isInStock ? '' : ' (غير متوفر)'}</span>
                </Radio.Content>
              </Radio>
            ))}
          </div>
        </RadioGroup>
      ) : null}

      <div className={styles.selectWrap}>
        <Label.Root htmlFor="marketplace-quantity" className={styles.label}>
          الكمية
        </Label.Root>
        <Input.Root
          id="marketplace-quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, availableLimit)}
          value={String(quantity)}
          className={styles.quantityInput}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            if (!Number.isFinite(next)) return;
            setQuantity(Math.min(Math.max(1, next), Math.max(1, availableLimit)));
          }}
        />
      </div>

      <strong className={styles.price}>
        {formatMarketplaceMoney(selectedVariant?.price ?? basePrice)}
      </strong>
      <Button.Root
        type="submit"
        fullWidth
        isDisabled={!purchasable || !addToCartAction}
        className={styles.primaryButton}
      >
        {purchasable ? 'أضف إلى السلة' : 'غير متوفر حاليًا'}
      </Button.Root>
      {!addToCartAction ? (
        <p className={styles.muted}>إضافة المنتج ستتاح بعد ربط السلة بحسابك.</p>
      ) : null}
    </form>
  );
}
