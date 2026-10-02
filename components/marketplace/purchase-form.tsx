'use client';

import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { RadioGroup } from '@heroui/react/radio-group';
import { Radio } from '@heroui/react/radio';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { AddToCartFeedback, useAddToCart } from './add-to-cart';
import { formatMarketplaceCount, formatMarketplaceMoney } from './format';
import type {
  MarketplaceAddToCartAction,
  MarketplaceAddToCartState,
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
  addToCartAction?: MarketplaceAddToCartAction;
};

async function unavailableAction(): Promise<MarketplaceAddToCartState> {
  return { status: 'error', code: 'service_unavailable' };
}

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
  const [state, formAction, isPending] = useAddToCart(addToCartAction ?? unavailableAction);
  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? firstAvailable;
  const availableLimit = selectedVariant?.availableQuantity == null
    ? maxQuantityPerOrder
    : Math.min(maxQuantityPerOrder, Math.max(0, selectedVariant.availableQuantity));
  const purchasable = isInStock && (selectedVariant?.isInStock ?? true) && availableLimit > 0;
  const unitPrice = selectedVariant?.price ?? basePrice;
  const lowStock = purchasable && availableLimit <= 5;

  return (
    <form className={styles.purchaseForm} action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      {variants.length > 1 ? (
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
          <div className={styles.variantList}>
            {variants.map((variant) => (
              <Radio
                key={variant.id}
                value={variant.id}
                isDisabled={!variant.isInStock}
                className={styles.variantOption}
              >
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <span className={styles.variantLabel}>
                    <span>{variant.label}</span>
                    <span className={styles.variantPrice}>
                      {variant.isInStock ? formatMarketplaceMoney(variant.price) : 'غير متوفر'}
                    </span>
                  </span>
                </Radio.Content>
              </Radio>
            ))}
          </div>
        </RadioGroup>
      ) : (
        <input type="hidden" name="variantId" value={variantId} />
      )}

      <div className={styles.selectWrap}>
        <Label.Root htmlFor="marketplace-quantity" className={styles.label}>
          الكمية
        </Label.Root>
        <div className={styles.quantityStepper}>
          <Button.Root
            type="button"
            isIconOnly
            className={styles.iconButton}
            aria-label="تقليل الكمية"
            isDisabled={quantity <= 1 || !purchasable}
            onPress={() => setQuantity((current) => Math.max(1, current - 1))}
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button.Root>
          <Input.Root
            id="marketplace-quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, availableLimit)}
            value={String(quantity)}
            disabled={!purchasable}
            className={styles.quantityInput}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(next)) return;
              setQuantity(Math.min(Math.max(1, next), Math.max(1, availableLimit)));
            }}
          />
          <Button.Root
            type="button"
            isIconOnly
            className={styles.iconButton}
            aria-label="زيادة الكمية"
            isDisabled={quantity >= availableLimit || !purchasable}
            onPress={() => setQuantity((current) => Math.min(Math.max(1, availableLimit), current + 1))}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button.Root>
          {lowStock ? (
            <span className={styles.lowStock}>
              {availableLimit === 1
                ? 'آخر قطعة متاحة'
                : `متبقي ${formatMarketplaceCount(availableLimit)} فقط`}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.purchaseTotal} aria-live="polite">
        <span>الإجمالي</span>
        <strong className={styles.price}>
          {formatMarketplaceMoney({
            amountMinor: unitPrice.amountMinor * quantity,
            currency: unitPrice.currency,
          })}
        </strong>
      </div>
      <Button.Root
        type="submit"
        fullWidth
        isPending={isPending}
        isDisabled={!purchasable || !addToCartAction || isPending}
        className={styles.primaryButton}
      >
        {!purchasable ? 'غير متوفر حاليًا' : isPending ? 'جارٍ الإضافة…' : 'أضف إلى السلة'}
      </Button.Root>
      <AddToCartFeedback state={state} showCheckout />
    </form>
  );
}
