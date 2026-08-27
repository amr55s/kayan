'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextArea } from '@heroui/react/textarea';
import Link from 'next/link';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { formatMarketplaceMoney } from './format';
import type {
  MarketplaceCheckoutViewModel,
  MarketplaceDeliveryZone,
  MarketplaceFormAction,
  MarketplaceSavedAddress,
} from './view-models';
import styles from './marketplace.module.css';

type AddressDraft = Pick<MarketplaceSavedAddress,
  | 'recipientName'
  | 'recipientPhone'
  | 'addressLine'
  | 'building'
  | 'floor'
  | 'apartment'
  | 'landmark'>;

function blankAddress(model: MarketplaceCheckoutViewModel): AddressDraft {
  return {
    recipientName: model.customerName ?? '',
    recipientPhone: model.customerPhone ?? '',
    addressLine: '',
    building: '',
    floor: '',
    apartment: '',
    landmark: '',
  };
}

function defaultModes(zone: MarketplaceDeliveryZone | undefined) {
  return Object.fromEntries(
    (zone?.storeOptions ?? []).map((option) => [option.storeId, option.choices[0]!.mode]),
  ) as Record<string, 'platform' | 'self'>;
}

function SubmitOrderButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button.Root
      type="submit"
      fullWidth
      isDisabled={disabled || pending}
      className={styles.primaryButton}
    >
      {pending ? 'جارٍ تأكيد الطلب…' : 'تأكيد الطلب والدفع عند الاستلام'}
    </Button.Root>
  );
}

export function MarketplaceCodCheckout({
  model,
  idempotencyKey,
  submitOrderAction,
}: {
  model: MarketplaceCheckoutViewModel;
  idempotencyKey: string;
  submitOrderAction?: MarketplaceFormAction;
}) {
  const initialAddress = model.addresses.find((address) => address.id === model.selectedAddressId)
    ?? null;
  const firstZone = model.deliveryZones.find((zone) => zone.id === model.selectedZoneId)
    ?? model.deliveryZones[0];
  const [addressId, setAddressId] = useState(() => initialAddress?.id ?? '');
  const [address, setAddress] = useState<AddressDraft>(() => initialAddress ?? blankAddress(model));
  const [zoneId, setZoneId] = useState(() => initialAddress?.zoneId ?? firstZone?.id ?? '');
  const selectedZone = model.deliveryZones.find((zone) => zone.id === zoneId);
  const [deliveryModes, setDeliveryModes] = useState<Record<string, 'platform' | 'self'>>(
    () => defaultModes(selectedZone),
  );
  const groupsByStore = new Map(model.groups.map((group) => [group.storeId, group]));
  const deliveryAmount = (selectedZone?.storeOptions ?? []).reduce((total, option) => {
    const selected = option.choices.find((choice) => choice.mode === deliveryModes[option.storeId])
      ?? option.choices[0];
    return total + (selected?.deliveryFee.amountMinor ?? 0);
  }, 0);
  const payable = {
    currency: model.subtotal.currency,
    amountMinor: Math.max(0, model.subtotal.amountMinor - model.discount.amountMinor + deliveryAmount),
  } as const;

  function chooseAddress(nextId: string) {
    setAddressId(nextId);
    const saved = model.addresses.find((candidate) => candidate.id === nextId);
    if (!saved) {
      setAddress(blankAddress(model));
      return;
    }
    setAddress(saved);
    setZoneId(saved.zoneId);
    setDeliveryModes(defaultModes(model.deliveryZones.find((zone) => zone.id === saved.zoneId)));
  }

  function updateAddress<Key extends keyof AddressDraft>(key: Key, value: AddressDraft[Key]) {
    setAddress((current) => ({ ...current, [key]: value }));
  }

  if (model.requiresAuthentication) {
    return <MarketplaceCheckoutLogin />;
  }

  return (
    <section aria-labelledby="checkout-title">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>إتمام الطلب</p>
          <h1 id="checkout-title" className={styles.title}>بيانات التوصيل</h1>
          <p className={styles.subtitle}>راجع بياناتك؛ سيعاد احتساب السعر والمخزون على الخادم قبل إنشاء الطلب.</p>
        </div>
      </header>

      <div className={styles.checkoutLayout}>
        <Card.Root className={styles.detailsPanel}>
          <Card.Content className={styles.summaryContent}>
            <form className={styles.checkoutForm} action={submitOrderAction}>
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <input type="hidden" name="addressId" value={addressId} />

              {model.addresses.length > 0 ? (
                <label className={`${styles.selectWrap} ${styles.fullField}`} htmlFor="checkout-saved-address">
                  <span className={styles.label}>عنوان محفوظ</span>
                  <select
                    id="checkout-saved-address"
                    value={addressId}
                    className={styles.selectField}
                    onChange={(event) => chooseAddress(event.target.value)}
                  >
                    {model.addresses.map((saved) => (
                      <option key={saved.id} value={saved.id}>{saved.label} — {saved.addressLine}</option>
                    ))}
                    <option value="">استخدام عنوان جديد</option>
                  </select>
                </label>
              ) : null}

              <div className={styles.formGrid}>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-name" className={styles.label}>اسم المستلم</Label.Root>
                  <Input.Root
                    id="checkout-name"
                    name="customerName"
                    value={address.recipientName}
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    className={styles.field}
                    onChange={(event) => updateAddress('recipientName', event.target.value)}
                  />
                </div>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-email" className={styles.label}>البريد الإلكتروني للحساب</Label.Root>
                  <Input.Root
                    id="checkout-email"
                    type="email"
                    value={model.customerEmail ?? ''}
                    autoComplete="email"
                    readOnly
                    className={styles.field}
                  />
                </div>

                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-phone" className={styles.label}>رقم المستلم</Label.Root>
                  <Input.Root
                    id="checkout-phone"
                    name="recipientPhone"
                    type="tel"
                    inputMode="tel"
                    value={address.recipientPhone}
                    autoComplete="tel"
                    dir="ltr"
                    required
                    pattern="01[0125][0-9]{8}"
                    maxLength={11}
                    className={styles.field}
                    onChange={(event) => updateAddress('recipientPhone', event.target.value)}
                  />
                </div>

                <label className={styles.selectWrap} htmlFor="checkout-zone">
                  <span className={styles.label}>منطقة التوصيل</span>
                  <select
                    id="checkout-zone"
                    name="deliveryZoneId"
                    value={zoneId}
                    required
                    className={styles.selectField}
                    onChange={(event) => {
                      const nextZoneId = event.target.value;
                      setZoneId(nextZoneId);
                      setDeliveryModes(defaultModes(model.deliveryZones.find((zone) => zone.id === nextZoneId)));
                    }}
                  >
                    <option value="" disabled>اختر المنطقة</option>
                    {model.deliveryZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} — {formatMarketplaceMoney(zone.deliveryFee)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={`${styles.selectWrap} ${styles.fullField}`}>
                  <Label.Root htmlFor="checkout-address" className={styles.label}>العنوان بالتفصيل</Label.Root>
                  <Input.Root
                    id="checkout-address"
                    name="addressLine"
                    value={address.addressLine}
                    autoComplete="street-address"
                    required
                    minLength={8}
                    maxLength={300}
                    className={styles.field}
                    onChange={(event) => updateAddress('addressLine', event.target.value)}
                  />
                </div>

                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-building" className={styles.label}>المبنى (اختياري)</Label.Root>
                  <Input.Root id="checkout-building" name="building" value={address.building} maxLength={80} className={styles.field} onChange={(event) => updateAddress('building', event.target.value)} />
                </div>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-floor" className={styles.label}>الدور (اختياري)</Label.Root>
                  <Input.Root id="checkout-floor" name="floor" value={address.floor} maxLength={40} className={styles.field} onChange={(event) => updateAddress('floor', event.target.value)} />
                </div>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-apartment" className={styles.label}>الشقة (اختياري)</Label.Root>
                  <Input.Root id="checkout-apartment" name="apartment" value={address.apartment} maxLength={40} className={styles.field} onChange={(event) => updateAddress('apartment', event.target.value)} />
                </div>
                <div className={styles.selectWrap}>
                  <Label.Root htmlFor="checkout-landmark" className={styles.label}>علامة مميزة قريبة</Label.Root>
                  <Input.Root id="checkout-landmark" name="landmark" value={address.landmark} maxLength={160} className={styles.field} onChange={(event) => updateAddress('landmark', event.target.value)} />
                </div>

                {(selectedZone?.storeOptions ?? []).map((option) => {
                  const group = groupsByStore.get(option.storeId);
                  if (option.choices.length === 1) {
                    return <input key={option.storeId} type="hidden" name={`deliveryMode:${option.storeId}`} value={option.choices[0]!.mode} />;
                  }
                  return (
                    <label key={option.storeId} className={styles.selectWrap} htmlFor={`delivery-mode-${option.storeId}`}>
                      <span className={styles.label}>توصيل {group?.storeName ?? 'المتجر'}</span>
                      <select
                        id={`delivery-mode-${option.storeId}`}
                        name={`deliveryMode:${option.storeId}`}
                        value={deliveryModes[option.storeId] ?? option.choices[0]!.mode}
                        className={styles.selectField}
                        onChange={(event) => setDeliveryModes((current) => ({
                          ...current,
                          [option.storeId]: event.target.value as 'platform' | 'self',
                        }))}
                      >
                        {option.choices.map((choice) => (
                          <option key={choice.mode} value={choice.mode}>
                            {choice.label} — {formatMarketplaceMoney(choice.deliveryFee)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}

                <div className={`${styles.selectWrap} ${styles.fullField}`}>
                  <Label.Root htmlFor="checkout-notes" className={styles.label}>ملاحظات التوصيل (اختياري)</Label.Root>
                  <TextArea.Root
                    id="checkout-notes"
                    name="deliveryNotes"
                    maxLength={500}
                    className={`${styles.field} ${styles.textarea}`}
                  />
                </div>
              </div>

              <div className={styles.codBox}>
                <strong className={styles.codTitle}>الدفع نقدًا عند الاستلام</strong>
                <p className={styles.codText}>لا نطلب بيانات بطاقة. ادفع المبلغ المؤكد عند استلام الطلب.</p>
                <p className={styles.codText}>
                  لحماية الحساب في أول طلب: الحد الأقصى 2,000 جنيه و10 وحدات، ويسمح بطلب واحد مفتوح حتى أول تسليم ناجح.
                </p>
              </div>

              {model.captchaSlot}

              <SubmitOrderButton disabled={!submitOrderAction || !selectedZone} />
            </form>
          </Card.Content>
        </Card.Root>

        <Card.Root className={styles.summaryCard}>
          <Card.Header className={styles.summaryHeader}>ملخص الطلب</Card.Header>
          <Card.Content className={styles.summaryContent}>
            {model.groups.length > 1 ? (
              <p className={styles.notice}>سيُقسّم الطلب إلى {model.groups.length} طلبات حسب المتجر.</p>
            ) : null}
            <div className={styles.checkoutGroups}>
              {model.groups.map((group) => (
                <div key={group.storeId} className={styles.checkoutGroup}>
                  <span>{group.storeName} · {group.itemCount} عنصر</span>
                  <strong>{formatMarketplaceMoney(group.subtotal)}</strong>
                </div>
              ))}
            </div>
            {model.appliedPromoCode ? <span className={styles.promo}>كود الخصم: {model.appliedPromoCode}</span> : null}
            <div className={styles.summaryRows}>
              <div className={styles.summaryRow}>
                <span>المنتجات</span>
                <strong>{formatMarketplaceMoney(model.subtotal)}</strong>
              </div>
              {model.discount.amountMinor > 0 ? (
                <div className={styles.summaryRow}>
                  <span>الخصم</span>
                  <strong>− {formatMarketplaceMoney(model.discount)}</strong>
                </div>
              ) : null}
              <div className={styles.summaryRow}>
                <span>التوصيل</span>
                <strong>{selectedZone ? formatMarketplaceMoney({ amountMinor: deliveryAmount, currency: 'EGP' }) : 'اختر المنطقة'}</strong>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>المطلوب عند الاستلام</span>
                <strong>{formatMarketplaceMoney(payable)}</strong>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    </section>
  );
}

function MarketplaceCheckoutLogin() {
  return (
    <Card.Root className={styles.stateCard}>
      <Card.Content className={styles.stateContent}>
        <h1 className={styles.stateTitle}>سجّل الدخول لإكمال الطلب</h1>
        <p className={styles.stateDescription}>
          تسجيل الدخول يحفظ السلة ويربط الطلب بحسابك حتى لو تغيّر الجهاز أو انتهت الجلسة.
        </p>
        <div className="w-full max-w-sm">
          <GoogleSignInButton
            next="/marketplace/checkout"
            label="المتابعة باستخدام Google"
            helper="سنستعيد سلتك ثم نرجعك إلى صفحة إتمام الطلب نفسها. يمكنك إعادة المحاولة بأمان إذا أغلقت نافذة Google."
          />
        </div>
        <Link href="/marketplace/cart" className={styles.secondaryButton}>العودة إلى السلة</Link>
      </Card.Content>
    </Card.Root>
  );
}
