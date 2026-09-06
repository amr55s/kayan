import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { minorToEgp } from '@/lib/commerce/money';
import type {
  MarketplaceCoupon,
  MarketplaceDeliveryConfiguration,
  MarketplaceDeliveryZone,
  MarketplaceStore,
  MarketplaceStoreBranch,
} from '@/lib/commerce/operational-setup';
import styles from './operational-setup.module.css';
import { StoreImageManager } from './store-image-manager';

type FormAction = (form: FormData) => void | Promise<void>;

export const setupMessages: Record<string, string> = {
  store_images_reordered: 'تم حفظ ترتيب صور المتجر.',
  store_image_deleted: 'تم حذف الصورة. يمكنك التراجع خلال المهلة الظاهرة.',
  store_image_restored: 'تم التراجع عن حذف صورة المتجر.',
  store_created: 'تم إنشاء المتجر كمسودة. أكمل بيانات التوصيل ثم أرسله للمراجعة.',
  store_updated: 'تم حفظ التعديل. تعديلات المتجر المنشور تبقى قيد المراجعة قبل ظهورها للعملاء.', store_submitted: 'تم إرسال المتجر للمراجعة.',
  delivery_saved: 'تم حفظ تغطية التوصيل.', coupon_saved: 'تم حفظ الكوبون.',
  branch_saved: 'تم حفظ بيانات الفرع.', branch_deactivated: 'تم إيقاف الفرع.',
  branch_delivery_saved: 'تم حفظ رسوم ووقت توصيل الفرع.',
  coupon_deactivated: 'تم إيقاف الكوبون.', zone_saved: 'تم حفظ منطقة التوصيل.',
  zone_status_saved: 'تم تحديث حالة منطقة التوصيل.',
};
export const setupErrors: Record<string, string> = {
  access_denied: 'ليست لديك صلاحية تنفيذ هذه العملية.',
  conflict: 'تغيّرت البيانات في جلسة أخرى. حدّث الصفحة وأعد المحاولة.',
  invalid_input: 'راجع القيم المدخلة وحدودها ثم أعد المحاولة.',
  limit_reached: 'تم الوصول للحد التشغيلي المسموح حاليًا.',
  not_found: 'السجل المطلوب غير موجود أو لم يعد متاحًا.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
  slug_taken: 'رابط المتجر مستخدم بالفعل. اختر رابطًا مختلفًا.',
};

function TextField({ id, name, label, defaultValue = '', type = 'text', required = false, min, max, step, dir }: {
  id?: string;
  name: string; label: string; defaultValue?: string | number; type?: string; required?: boolean;
  min?: string | number; max?: string | number; step?: string | number; dir?: 'rtl' | 'ltr';
}) {
  const inputId = id ?? name;
  return <div className={styles.field}><Label.Root htmlFor={inputId} className={styles.label}>{label}</Label.Root><Input.Root id={inputId} name={name} type={type} defaultValue={defaultValue} required={required} min={min} max={max} step={step} dir={dir} className={styles.input} /></div>;
}

export function StoreOnboardingPanel({ merchants, action }: {
  merchants: Array<{ id: string; name: string }>; action: FormAction;
}) {
  if (!merchants.length) return <section className={styles.empty}><h2>الحساب غير مرتبط بتاجر نشط</h2><p>اطلب من الإدارة ربط الحساب بعضوية تاجر موثوقة قبل إنشاء متجر.</p></section>;
  return <section className={styles.section}><div className={styles.sectionHeader}><div><h2>إنشاء أول متجر</h2><p>ابدأ بمسودة بسيطة، ثم أضف مناطق التوصيل وأرسلها للمراجعة.</p></div></div><StoreForm merchants={merchants} action={action} /></section>;
}

function StoreForm({ merchants, action, store }: {
  merchants: Array<{ id: string; name: string }>; action: FormAction; store?: MarketplaceStore;
}) {
  const prefix = `store-${store?.id ?? 'new'}`;
  return <form action={action}>
    {store ? <><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="expectedUpdatedAt" value={store.updated_at} /></> : null}
    <input type="hidden" name="idempotencyKey" value={randomUUID()} />
    <div className={styles.grid}>
      {!store ? <label className={styles.field}><span>التاجر</span><select name="merchantId" className={styles.select} required defaultValue={merchants[0]?.id}>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label> : null}
      <TextField id={`${prefix}-name`} name="name" label="اسم المتجر" defaultValue={store?.name} required />
      {!store ? <TextField id={`${prefix}-slug`} name="slug" label="رابط المتجر بالإنجليزية" dir="ltr" required /> : null}
      <TextField id={`${prefix}-short`} name="shortDescription" label="وصف مختصر" defaultValue={store?.short_description ?? ''} />
      <TextField id={`${prefix}-city`} name="city" label="المدينة" defaultValue={store?.city ?? ''} />
      <TextField id={`${prefix}-area`} name="area" label="المنطقة" defaultValue={store?.area ?? ''} />
      <TextField id={`${prefix}-address`} name="addressText" label="عنوان التشغيل" defaultValue={store?.address_text ?? ''} />
    </div>
    <label className={styles.field}><span>وصف المتجر</span><textarea name="description" maxLength={5000} defaultValue={store?.description ?? ''} className={styles.textarea} /></label>
    <div className={styles.actions}><Button.Root type="submit" className={styles.primary}>{store ? 'حفظ بيانات المتجر' : 'إنشاء المتجر'}</Button.Root></div>
  </form>;
}

function StoreSwitcher({ stores, selected, path }: { stores: MarketplaceStore[]; selected: MarketplaceStore; path: string }) {
  return <nav className={styles.switcher} aria-label="اختيار المتجر">{stores.map((store) => <Link key={store.id} href={`${path}?store=${encodeURIComponent(store.id)}`} data-active={store.id === selected.id}>{store.name}</Link>)}</nav>;
}

export function MerchantStoreSettingsPanel({ stores, merchants, selected, delivery, branches, actions }: {
  stores: MarketplaceStore[]; merchants: Array<{ id: string; name: string }>; selected: MarketplaceStore;
  delivery: MarketplaceDeliveryConfiguration; branches: MarketplaceStoreBranch[];
  actions: {
    create: FormAction; update: FormAction; submit: FormAction; saveDelivery: FormAction;
    saveBranch: FormAction; deleteBranch: FormAction; saveBranchDelivery: FormAction;
    reorderImages: FormAction; deleteImage: FormAction; undoDeleteImage: FormAction;
  };
}) {
  return <div className={styles.page}>
    <StoreSwitcher stores={stores} selected={selected} path="/merchant/marketplace/settings" />
    <section className={styles.section}><div className={styles.sectionHeader}><div><h2>بيانات {selected.name}</h2><p>الحالة: <span className={styles.badge}>{selected.status}</span></p>{selected.pending_revision ? <p role="status" className={styles.notice}>التعديلات الحساسة والصور قيد مراجعة الإدارة. النسخة المنشورة الحالية ما زالت ظاهرة للعملاء.</p> : null}{selected.moderation_notes ? <p>{selected.moderation_notes}</p> : null}</div></div><StoreForm merchants={merchants} action={actions.update} store={selected} />
      {selected.status === 'draft' ? <form action={actions.submit} className={styles.actions}><input type="hidden" name="storeId" value={selected.id} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /><Button.Root className={styles.secondary} type="submit">إرسال المتجر للمراجعة</Button.Root></form> : null}
    </section>
    <StoreImageManager store={selected} actions={{
      reorder: actions.reorderImages,
      delete: actions.deleteImage,
      undo: actions.undoDeleteImage,
    }} />
    <BranchManagementPanel
      store={selected}
      branches={branches}
      zones={delivery.zones}
      saveAction={actions.saveBranch}
      deleteAction={actions.deleteBranch}
      saveDeliveryAction={actions.saveBranchDelivery}
    />
    <section className={styles.section}><div className={styles.sectionHeader}><div><h2>مناطق وتكلفة التوصيل</h2><p>فعّل منطقة واحدة على الأقل وحدد الرسوم والحد الأدنى ووقت الوصول.</p></div></div>
      {delivery.zones.length ? <div className={styles.list}>{delivery.zones.map((zone) => <form action={actions.saveDelivery} className={styles.card} key={zone.zone_id}>
        <input type="hidden" name="storeId" value={selected.id} /><input type="hidden" name="zoneId" value={zone.zone_id} /><input type="hidden" name="expectedStoreUpdatedAt" value={delivery.store_updated_at} /><input type="hidden" name="expectedConfigUpdatedAt" value={zone.updated_at ?? ''} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <h3>{zone.name_ar}</h3><p>{zone.city} · <bdi dir="ltr">{zone.code}</bdi>{!zone.zone_is_active ? ' · موقوفة من الإدارة' : ''}</p>
        <div className={styles.gridThree}>
          <label className={styles.field}><span>طريقة التوصيل</span><select name="deliveryMode" className={styles.select} defaultValue={zone.delivery_mode ?? (selected.delivery_mode === 'self' ? 'self' : 'platform')}><option value="platform">توصيل المنصة</option><option value="self">توصيل المتجر</option></select></label>
          <TextField id={`delivery-${zone.zone_id}-fee`} name="feeEgp" label="الرسوم (جنيه)" type="number" min="0" max="100000" step="0.01" defaultValue={zone.fee_piastres == null ? '0.00' : minorToEgp(Number(zone.fee_piastres))} required />
          <TextField id={`delivery-${zone.zone_id}-minimum`} name="minimumOrderEgp" label="الحد الأدنى (جنيه)" type="number" min="0" step="0.01" defaultValue={zone.minimum_order_piastres == null ? '0.00' : minorToEgp(Number(zone.minimum_order_piastres))} required />
          <TextField id={`delivery-${zone.zone_id}-free`} name="freeThresholdEgp" label="توصيل مجاني من (اختياري)" type="number" min="0.01" step="0.01" defaultValue={zone.free_delivery_threshold_piastres == null ? '' : minorToEgp(Number(zone.free_delivery_threshold_piastres))} />
          <TextField id={`delivery-${zone.zone_id}-eta-min`} name="etaMin" label="أقل وقت بالدقائق" type="number" min="1" max="10080" defaultValue={zone.estimated_minutes_min ?? 30} required />
          <TextField id={`delivery-${zone.zone_id}-eta-max`} name="etaMax" label="أقصى وقت بالدقائق" type="number" min="1" max="10080" defaultValue={zone.estimated_minutes_max ?? 60} required />
        </div><label className={styles.checkbox}><input type="checkbox" name="isActive" defaultChecked={zone.is_active} disabled={!zone.zone_is_active} /> متاحة للعملاء</label><div className={styles.actions}><Button.Root type="submit" className={styles.primary} isDisabled={!zone.zone_is_active}>حفظ المنطقة</Button.Root></div>
      </form>)}</div> : <div className={styles.empty}>لم تضف الإدارة مناطق توصيل بعد.</div>}
    </section>
    <section className={styles.section}><h2>متجر إضافي</h2><p>يمكن تشغيل أكثر من متجر تحت التاجر نفسه مع فصل الكتالوج والطلبات.</p><hr className={styles.divider} /><StoreForm merchants={merchants} action={actions.create} /></section>
  </div>;
}

function BranchFields({ store, branch }: { store: MarketplaceStore; branch?: MarketplaceStoreBranch }) {
  const prefix = `branch-${branch?.id ?? 'new'}`;
  return <>
    <div className={styles.gridThree}>
      <TextField id={`${prefix}-code`} name="code" label="كود الفرع" dir="ltr" required defaultValue={branch?.code ?? ''} />
      <TextField id={`${prefix}-name`} name="name" label="اسم الفرع" required defaultValue={branch?.name ?? ''} />
      <TextField id={`${prefix}-city`} name="city" label="المدينة" defaultValue={branch?.city ?? store.city ?? ''} />
      <TextField id={`${prefix}-area`} name="area" label="المنطقة" defaultValue={branch?.area ?? store.area ?? ''} />
      <TextField id={`${prefix}-address`} name="addressText" label="عنوان التشغيل" required defaultValue={branch?.address_text ?? store.address_text ?? ''} />
      <TextField id={`${prefix}-sort`} name="sortOrder" label="ترتيب الاختيار" type="number" min="-10000" max="10000" required defaultValue={branch?.sort_order ?? 0} />
      <label className={styles.field}><span>الحالة</span><select name="status" className={styles.select} defaultValue={branch?.status ?? 'active'}><option value="active">نشط</option><option value="inactive">متوقف</option></select></label>
    </div>
    <div className={styles.gridThree}>
      <label className={styles.checkbox}><input type="checkbox" name="deliveryModes" value="platform" defaultChecked={branch?.delivery_modes.includes('platform') ?? true} /> توصيل المنصة</label>
      <label className={styles.checkbox}><input type="checkbox" name="deliveryModes" value="self" defaultChecked={branch?.delivery_modes.includes('self') ?? false} /> توصيل المتجر</label>
      <label className={styles.checkbox}><input type="checkbox" name="isDefault" defaultChecked={branch?.is_default ?? false} /> الفرع الافتراضي</label>
    </div>
  </>;
}

function BranchDeliveryForm({ storeId, branch, zones, action, config }: {
  storeId: string;
  branch: MarketplaceStoreBranch;
  zones: MarketplaceDeliveryConfiguration['zones'];
  action: FormAction;
  config?: MarketplaceStoreBranch['zones'][number];
}) {
  const availableModes = branch.delivery_modes;
  const zone = config ? zones.find((item) => item.zone_id === config.zone_id) : null;
  const prefix = `branch-delivery-${branch.id}-${config?.zone_id ?? 'new'}-${config?.delivery_mode ?? 'new'}`;
  return <form action={action} className={styles.card}>
    <input type="hidden" name="storeId" value={storeId} />
    <input type="hidden" name="branchId" value={branch.id} />
    <input type="hidden" name="expectedBranchVersion" value={branch.version} />
    <input type="hidden" name="expectedConfigVersion" value={config?.version ?? 0} />
    <input type="hidden" name="idempotencyKey" value={randomUUID()} />
    <h4>{config ? `${zone?.name_ar ?? config.code} — ${config.delivery_mode === 'platform' ? 'توصيل المنصة' : 'توصيل المتجر'}` : 'إضافة تغطية للفرع'}</h4>
    <div className={styles.gridThree}>
      <label className={styles.field}><span>منطقة التوصيل</span><select name="zoneId" className={styles.select} defaultValue={config?.zone_id} disabled={Boolean(config)}>{zones.map((item) => <option value={item.zone_id} key={item.zone_id}>{item.name_ar} — {item.city}</option>)}</select></label>
      {config ? <input type="hidden" name="zoneId" value={config.zone_id} /> : null}
      <label className={styles.field}><span>طريقة التوصيل</span><select name="deliveryMode" className={styles.select} defaultValue={config?.delivery_mode ?? availableModes[0]} disabled={Boolean(config)}>{availableModes.map((mode) => <option value={mode} key={mode}>{mode === 'platform' ? 'توصيل المنصة' : 'توصيل المتجر'}</option>)}</select></label>
      {config ? <input type="hidden" name="deliveryMode" value={config.delivery_mode} /> : null}
      <TextField id={`${prefix}-fee`} name="feeEgp" label="الرسوم (جنيه)" type="number" min="0" max="100000" step="0.01" required defaultValue={config ? minorToEgp(Number(config.fee_piastres)) : '0.00'} />
      <TextField id={`${prefix}-minimum`} name="minimumOrderEgp" label="الحد الأدنى (جنيه)" type="number" min="0" step="0.01" required defaultValue={config ? minorToEgp(Number(config.minimum_order_piastres)) : '0.00'} />
      <TextField id={`${prefix}-free`} name="freeThresholdEgp" label="توصيل مجاني من" type="number" min="0.01" step="0.01" defaultValue={config?.free_delivery_threshold_piastres == null ? '' : minorToEgp(Number(config.free_delivery_threshold_piastres))} />
      <TextField id={`${prefix}-eta-min`} name="etaMin" label="أقل وقت بالدقائق" type="number" min="1" max="10080" required defaultValue={config?.estimated_minutes_min ?? 30} />
      <TextField id={`${prefix}-eta-max`} name="etaMax" label="أقصى وقت بالدقائق" type="number" min="1" max="10080" required defaultValue={config?.estimated_minutes_max ?? 60} />
    </div>
    <label className={styles.checkbox}><input type="checkbox" name="isActive" defaultChecked={config?.is_active ?? true} /> متاح للطلبات</label>
    <div className={styles.actions}><Button.Root type="submit" className={styles.secondary}>حفظ تغطية الفرع</Button.Root></div>
  </form>;
}

function BranchManagementPanel({ store, branches, zones, saveAction, deleteAction, saveDeliveryAction }: {
  store: MarketplaceStore;
  branches: MarketplaceStoreBranch[];
  zones: MarketplaceDeliveryConfiguration['zones'];
  saveAction: FormAction;
  deleteAction: FormAction;
  saveDeliveryAction: FormAction;
}) {
  return <section className={styles.section} aria-labelledby="store-branches-title">
    <div className={styles.sectionHeader}><div><h2 id="store-branches-title">فروع تنفيذ الطلبات</h2><p>المخزون مشترك على مستوى المتجر في الإصدار الأول. يختار النظام الفرع النشط المناسب للمنطقة وطريقة التوصيل تلقائيًا، ولا يختاره العميل.</p></div></div>
    <form action={saveAction} className={styles.card}>
      <input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="branchId" value="" /><input type="hidden" name="expectedVersion" value="0" /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
      <h3>فرع جديد</h3><BranchFields store={store} /><div className={styles.actions}><Button.Root type="submit" className={styles.primary}>إضافة الفرع</Button.Root></div>
    </form>
    <div className={styles.list}>{branches.map((branch) => <article className={styles.card} key={branch.id}>
      <form action={saveAction}>
        <input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="branchId" value={branch.id} /><input type="hidden" name="expectedVersion" value={branch.version} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <h3>{branch.name}{branch.is_default ? ' — الافتراضي' : ''}</h3><BranchFields store={store} branch={branch} /><div className={styles.actions}><Button.Root type="submit" className={styles.primary}>حفظ الفرع</Button.Root></div>
      </form>
      {!branch.is_default && branch.status === 'active' ? <form action={deleteAction} className={styles.actions}><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="branchId" value={branch.id} /><input type="hidden" name="expectedVersion" value={branch.version} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /><Button.Root type="submit" className={styles.danger}>إيقاف الفرع</Button.Root></form> : null}
      <div className={styles.list}>{branch.zones.map((config) => <BranchDeliveryForm key={`${config.zone_id}:${config.delivery_mode}`} storeId={store.id} branch={branch} zones={zones} action={saveDeliveryAction} config={config} />)}</div>
      {zones.length && branch.status === 'active' ? <BranchDeliveryForm storeId={store.id} branch={branch} zones={zones} action={saveDeliveryAction} /> : null}
    </article>)}</div>
  </section>;
}

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CouponForm({ action, storeId, coupon }: { action: FormAction; storeId?: string; coupon?: MarketplaceCoupon }) {
  const prefix = `coupon-${coupon?.id ?? (storeId ? `new-${storeId}` : 'new-platform')}`;
  return <form action={action} className={styles.card}>
    {storeId ? <input type="hidden" name="storeId" value={storeId} /> : null}<input type="hidden" name="couponId" value={coupon?.id ?? ''} /><input type="hidden" name="expectedUpdatedAt" value={coupon?.updated_at ?? ''} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
    {coupon ? <h3>{coupon.code}</h3> : <h3>كوبون جديد</h3>}
    <div className={styles.gridThree}>
      <TextField id={`${prefix}-code`} name="code" label="الكود" dir="ltr" defaultValue={coupon?.code} required />
      <TextField id={`${prefix}-title`} name="title" label="اسم العرض" defaultValue={coupon?.title} required />
      <label className={styles.field}><span>نوع الخصم</span><select name="discountType" className={styles.select} defaultValue={coupon?.discount_type ?? 'percentage'}><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label>
      <TextField id={`${prefix}-percent`} name="discountPercent" label="النسبة (حتى 80%)" type="number" min="0.01" max="80" step="0.01" defaultValue={coupon?.discount_percent == null ? '' : String(coupon.discount_percent)} />
      <TextField id={`${prefix}-amount`} name="discountAmountEgp" label="مبلغ الخصم بالجنيه" type="number" min="0.01" step="0.01" defaultValue={coupon?.discountAmountMinor == null ? '' : minorToEgp(coupon.discountAmountMinor)} />
      <TextField id={`${prefix}-max`} name="maxDiscountEgp" label="أقصى خصم بالجنيه" type="number" min="0.01" step="0.01" defaultValue={coupon?.maxDiscountMinor == null ? '' : minorToEgp(coupon.maxDiscountMinor)} />
      <TextField id={`${prefix}-minimum`} name="minimumOrderEgp" label="أقل طلب بالجنيه" type="number" min="0" step="0.01" defaultValue={coupon ? minorToEgp(coupon.minimumOrderMinor) : '0.00'} required />
      <TextField id={`${prefix}-starts`} name="startsAt" label="يبدأ في" type="datetime-local" defaultValue={toLocalDateTime(coupon?.starts_at ?? null)} />
      <TextField id={`${prefix}-expires`} name="expiresAt" label="ينتهي في" type="datetime-local" defaultValue={toLocalDateTime(coupon?.expires_at ?? null)} />
      <TextField id={`${prefix}-total`} name="totalLimit" label="إجمالي الاستخدامات" type="number" min="1" max="1000000" defaultValue={coupon?.total_limit ?? ''} />
      <TextField id={`${prefix}-customer`} name="perCustomerLimit" label="لكل عميل" type="number" min="1" max="100" defaultValue={coupon?.per_customer_limit ?? 1} required />
    </div><label className={styles.checkbox}><input type="checkbox" name="isActive" defaultChecked={coupon?.is_active ?? true} /> مفعّل</label>
    {coupon ? <div className={styles.meta}><span>استخدم {coupon.redeemed_count.toLocaleString('ar-EG')} مرة</span><span>التمويل: {coupon.funding_owner === 'merchant' ? 'التاجر' : 'المنصة'}</span></div> : null}
    <div className={styles.actions}><Button.Root type="submit" className={styles.primary}>{coupon ? 'حفظ التعديلات' : 'إنشاء الكوبون'}</Button.Root></div>
  </form>;
}

export function CouponManagementPanel({ coupons, storeId, saveAction, deactivateAction }: {
  coupons: MarketplaceCoupon[]; storeId?: string; saveAction: FormAction; deactivateAction: FormAction;
}) {
  return <section className={styles.section}><div className={styles.sectionHeader}><div><h2>{storeId ? 'كوبونات المتجر' : 'كوبونات المنصة'}</h2><p>{storeId ? 'الكوبونات هنا تشمل كل منتجات المتجر وتمويلها على التاجر.' : 'كوبونات عامة ممولة من المنصة وتطبق وفق شروط السلة.'}</p></div></div><CouponForm action={saveAction} storeId={storeId} /><hr className={styles.divider} />
    {coupons.length ? <div className={styles.list}>{coupons.map((coupon) => <div key={coupon.id}><CouponForm action={saveAction} storeId={storeId} coupon={coupon} />{coupon.is_active ? <form action={deactivateAction} className={styles.actions}>{storeId ? <input type="hidden" name="storeId" value={storeId} /> : null}<input type="hidden" name="couponId" value={coupon.id} /><input type="hidden" name="expectedUpdatedAt" value={coupon.updated_at} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /><Button.Root type="submit" className={styles.danger}>إيقاف الكوبون</Button.Root></form> : null}</div>)}</div> : <div className={styles.empty}>لا توجد كوبونات بعد.</div>}
  </section>;
}

export function AdminDeliveryZonesPanel({ zones, saveAction, activateAction }: {
  zones: MarketplaceDeliveryZone[]; saveAction: FormAction; activateAction: FormAction;
}) {
  return <section className={styles.section}><div className={styles.sectionHeader}><div><h2>مناطق التوصيل</h2><p>هذه المناطق هي المصدر الفعلي المتاح للعناوين وcheckout.</p></div></div>
    <form action={saveAction} className={styles.card}><h3>منطقة جديدة</h3><ZoneFields /><div className={styles.actions}><Button.Root type="submit" className={styles.primary}>إضافة المنطقة</Button.Root></div></form><hr className={styles.divider} />
    <div className={styles.list}>{zones.map((zone) => <div className={styles.card} key={zone.id}><form action={saveAction}><input type="hidden" name="zoneId" value={zone.id} /><input type="hidden" name="expectedUpdatedAt" value={zone.updated_at} /><ZoneFields zone={zone} /><div className={styles.actions}><Button.Root type="submit" className={styles.secondary}>حفظ التعديلات</Button.Root></div></form><form action={activateAction} className={styles.actions}><input type="hidden" name="zoneId" value={zone.id} /><input type="hidden" name="expectedUpdatedAt" value={zone.updated_at} /><input type="hidden" name="nextActive" value={String(!zone.is_active)} /><Button.Root type="submit" className={zone.is_active ? styles.danger : styles.primary}>{zone.is_active ? 'إيقاف المنطقة' : 'تفعيل المنطقة'}</Button.Root></form></div>)}</div>
  </section>;
}

function ZoneFields({ zone }: { zone?: MarketplaceDeliveryZone }) {
  const prefix = `zone-${zone?.id ?? 'new'}`;
  return <div className={styles.gridThree}><TextField id={`${prefix}-code`} name="code" label="الكود" dir="ltr" required defaultValue={zone?.code} /><TextField id={`${prefix}-name-ar`} name="nameAr" label="الاسم بالعربية" required defaultValue={zone?.name_ar} /><TextField id={`${prefix}-name-en`} name="nameEn" label="الاسم بالإنجليزية" defaultValue={zone?.name_en ?? ''} /><TextField id={`${prefix}-city`} name="city" label="المدينة" required defaultValue={zone?.city} /><TextField id={`${prefix}-sort`} name="sortOrder" label="ترتيب العرض" type="number" min="-10000" max="10000" required defaultValue={zone?.sort_order ?? 0} /></div>;
}
