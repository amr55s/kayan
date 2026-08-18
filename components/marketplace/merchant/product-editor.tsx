'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextArea } from '@heroui/react/textarea';
import { ProductGalleryManager } from './product-gallery-manager';
import { ProductStatusBadge } from './status-badge';
import type {
  MerchantProductEditorActions,
  MerchantProductEditorViewModel,
  MerchantVariantEditorViewModel,
} from './view-models';
import styles from './merchant-marketplace.module.css';

const MAX_VARIANTS = 50;

function emptyVariant(clientKey: string): MerchantVariantEditorViewModel {
  return {
    clientKey,
    id: null,
    title: '',
    sku: '',
    barcode: '',
    weightGrams: '',
    option1Name: '',
    option1Value: '',
    option2Name: '',
    option2Value: '',
    priceEgp: '',
    compareAtPriceEgp: '',
    trackInventory: true,
    onHand: '0',
    lowStockThreshold: '0',
    isActive: true,
    extraAttributesJson: '{}',
  };
}

function variantField(index: number, name: string) {
  return `variants[${index}][${name}]`;
}

function FeedbackAlert({ viewModel }: { viewModel: MerchantProductEditorViewModel }) {
  if (viewModel.feedback.status === 'idle') return null;
  const errors = Object.entries(viewModel.feedback.fieldErrors ?? {});
  return (
    <Alert.Root
      status={viewModel.feedback.status === 'error' ? 'danger' : 'success'}
      className={styles.alert}
      role={viewModel.feedback.status === 'error' ? 'alert' : 'status'}
      aria-live={viewModel.feedback.status === 'error' ? 'assertive' : 'polite'}
    >
      <Alert.Content>
        <Alert.Title className={styles.alertTitle}>
          {viewModel.feedback.status === 'error' ? 'لم يتم حفظ التعديلات' : 'تم الحفظ'}
        </Alert.Title>
        {viewModel.feedback.message ? (
          <Alert.Description className={styles.alertDescription}>
            {viewModel.feedback.message}
          </Alert.Description>
        ) : null}
        {errors.length > 0 ? (
          <ul className={styles.errorList}>
            {errors.flatMap(([field, messages]) => messages.map((message) => (
              <li key={`${field}:${message}`}>{message}</li>
            )))}
          </ul>
        ) : null}
      </Alert.Content>
    </Alert.Root>
  );
}

export function MerchantProductEditor({
  viewModel,
  actions = {},
}: {
  viewModel: MerchantProductEditorViewModel;
  actions?: MerchantProductEditorActions;
}) {
  const nextVariantKey = useRef(viewModel.variants.length + 1);
  const [variants, setVariants] = useState<MerchantVariantEditorViewModel[]>(() => (
    viewModel.variants.length > 0 ? viewModel.variants : [emptyVariant('new-variant-1')]
  ));
  const canSave = viewModel.canEdit && Boolean(viewModel.storeId && actions.saveProductAction);
  const isFirstPublish = !viewModel.firstPublishedAt;

  const updateVariant = (
    clientKey: string,
    patch: Partial<MerchantVariantEditorViewModel>,
  ) => {
    setVariants((current) => current.map((variant) => (
      variant.clientKey === clientKey ? { ...variant, ...patch } : variant
    )));
  };

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) return;
    const key = `new-variant-${nextVariantKey.current}`;
    nextVariantKey.current += 1;
    setVariants((current) => [...current, emptyVariant(key)]);
  };

  const removeVariant = (clientKey: string) => {
    setVariants((current) => current.filter((variant) => variant.clientKey !== clientKey));
  };

  return (
    <div>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>كتالوج المتجر</p>
          <h1 className={styles.title}>
            {viewModel.mode === 'create' ? 'إضافة منتج جديد' : `تعديل ${viewModel.name}`}
          </h1>
          <p className={styles.subtitle}>
            اكتب بيانات المنتج يدويًا، ثم راجع المتغيرات والمخزون والصور قبل الإرسال.
          </p>
        </div>
        <div className={styles.inlineActions}>
          <ProductStatusBadge status={viewModel.status} />
          <Link href="/merchant/marketplace" className={styles.secondaryLink}>
            العودة للمنتجات
          </Link>
        </div>
      </header>

      <div className={styles.editorMain}>
        <FeedbackAlert viewModel={viewModel} />
        {viewModel.pendingRevision ? (
          <Alert.Root status="warning" className={styles.alert}>
            <Alert.Content>
              <Alert.Title className={styles.alertTitle}>تعديلات في انتظار مراجعة الإدارة</Alert.Title>
              <Alert.Description className={styles.alertDescription}>
                البيانات والصور الحساسة الجديدة محفوظة، لكنها لن تظهر للعملاء قبل الاعتماد.
                {' '}الصور داخل الطلب: {viewModel.pendingRevision.imageCount.toLocaleString('ar-EG')}.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        ) : null}
        <Alert.Root status="warning" className={styles.alert}>
          <Alert.Content>
            <Alert.Title className={styles.alertTitle}>
              {isFirstPublish ? 'أول نشر يمر بالمراجعة' : 'هذا المنتج سبق اعتماده'}
            </Alert.Title>
            <Alert.Description className={styles.alertDescription}>
              {isFirstPublish
                ? 'احفظ مسودة مكتملة ثم أرسلها للمراجعة. لن يظهر المنتج للعملاء قبل موافقة الإدارة لأول مرة.'
                : 'يمكن حفظ تعديلات البيانات والمخزون من دون إعادة أول مراجعة. الأرشفة توقف ظهور المنتج في المتجر.'}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
        {viewModel.moderationNote ? (
          <Alert.Root status="danger" className={styles.alert}>
            <Alert.Content>
              <Alert.Title className={styles.alertTitle}>ملاحظة المراجعة</Alert.Title>
              <Alert.Description className={styles.alertDescription}>
                {viewModel.moderationNote}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        ) : null}
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.editorMain}>
          <form action={actions.saveProductAction} className={styles.editorMain}>
            <input type="hidden" name="intent" value="save-product" />
            <input type="hidden" name="storeId" value={viewModel.storeId || ''} />
            <input type="hidden" name="productId" value={viewModel.productId || ''} />
            <input type="hidden" name="expectedUpdatedAt" value={viewModel.updatedAt || ''} />
            <input type="hidden" name="idempotencyKey" value={viewModel.idempotencyKey} />

            <section className={styles.editorSection} aria-labelledby="product-basics-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="product-basics-title" className={styles.sectionTitle}>البيانات الأساسية</h2>
                  <p className={styles.helper}>الاسم والوصف يظهران للعميل كما تكتبهما هنا.</p>
                </div>
              </div>

              <div className={styles.fieldsTwo}>
                <div className={styles.fieldGroup}>
                  <Label.Root htmlFor="merchant-product-name" className={styles.label} isRequired>
                    اسم المنتج
                  </Label.Root>
                  <Input.Root
                    id="merchant-product-name"
                    name="name"
                    defaultValue={viewModel.name}
                    maxLength={200}
                    required
                    disabled={!viewModel.canEdit}
                    className={styles.field}
                    placeholder="اسم واضح كما سيظهر في المتجر"
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <Label.Root htmlFor="merchant-product-key" className={styles.label}>
                    كود المنتج
                  </Label.Root>
                  <Input.Root
                    id="merchant-product-key"
                    name="productKey"
                    defaultValue={viewModel.productKey}
                    maxLength={64}
                    readOnly={viewModel.mode === 'edit'}
                    disabled={!viewModel.canEdit}
                    className={styles.field}
                    placeholder="يُنشأ تلقائيًا عند تركه فارغًا"
                    dir="ltr"
                  />
                </div>

                <label className={styles.fieldGroup} htmlFor="merchant-product-category">
                  <span className={styles.label}>التصنيف</span>
                  <select
                    id="merchant-product-category"
                    name="categoryId"
                    defaultValue={viewModel.categoryId}
                    disabled={!viewModel.canEdit}
                    className={styles.select}
                  >
                    <option value="">اختر التصنيف</option>
                    {viewModel.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>

                <div className={styles.fieldGroup}>
                  <Label.Root htmlFor="merchant-product-brand" className={styles.label}>
                    العلامة التجارية
                  </Label.Root>
                  <Input.Root
                    id="merchant-product-brand"
                    name="brand"
                    defaultValue={viewModel.brand}
                    maxLength={120}
                    disabled={!viewModel.canEdit}
                    className={styles.field}
                    placeholder="اختياري"
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <Label.Root htmlFor="merchant-product-description" className={styles.label} isRequired>
                  وصف المنتج
                </Label.Root>
                <TextArea.Root
                  id="merchant-product-description"
                  name="description"
                  defaultValue={viewModel.description}
                  maxLength={10_000}
                  required
                  disabled={!viewModel.canEdit}
                  className={styles.textarea}
                  placeholder="اكتب المكونات أو الخامة أو المقاس وطريقة الاستخدام وأي معلومات تساعد العميل على القرار."
                />
                <p className={styles.helper}>
                  الوصف يدوي فقط. لا تُدرج أرقام تواصل أو روابط خارجية داخل الوصف.
                </p>
              </div>
            </section>

            <section className={styles.editorSection} aria-labelledby="product-variants-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="product-variants-title" className={styles.sectionTitle}>المتغيرات والأسعار</h2>
                  <p className={styles.helper}>كل SKU يجب أن يكون فريدًا داخل المتجر.</p>
                </div>
                <Button.Root
                  type="button"
                  onPress={addVariant}
                  isDisabled={!viewModel.canEdit || variants.length >= MAX_VARIANTS}
                  className={styles.secondaryButton}
                >
                  <Plus size={15} aria-hidden="true" />
                  إضافة متغير
                </Button.Root>
              </div>

              <div className={styles.variantList}>
                {variants.map((variant, index) => (
                  <article key={variant.clientKey} className={styles.variantCard}>
                    <div className={styles.variantHeader}>
                      <h3 className={styles.cardTitle}>المتغير {index + 1}</h3>
                      <Button.Root
                        type="button"
                        isIconOnly
                        onPress={() => removeVariant(variant.clientKey)}
                        isDisabled={!viewModel.canEdit || variants.length === 1}
                        className={styles.dangerButton}
                        aria-label={`حذف المتغير ${index + 1}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button.Root>
                    </div>
                    <input type="hidden" name={variantField(index, 'id')} value={variant.id || ''} />
                    <input type="hidden" name={variantField(index, 'clientKey')} value={variant.clientKey} />
                    <input type="hidden" name={variantField(index, 'extraAttributesJson')} value={variant.extraAttributesJson} />
                    <input
                      type="hidden"
                      name={variantField(index, 'trackInventory')}
                      value={String(variant.trackInventory)}
                    />
                    <input
                      type="hidden"
                      name={variantField(index, 'isActive')}
                      value={String(variant.isActive)}
                    />

                    <div className={styles.variantFields}>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-title`} className={styles.label} isRequired>
                          اسم المتغير
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-title`}
                          name={variantField(index, 'title')}
                          value={variant.title}
                          onChange={(event) => updateVariant(variant.clientKey, { title: event.target.value })}
                          maxLength={160}
                          required
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="مثال: كبير / أحمر"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-sku`} className={styles.label} isRequired>
                          SKU
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-sku`}
                          name={variantField(index, 'sku')}
                          value={variant.sku}
                          onChange={(event) => updateVariant(variant.clientKey, { sku: event.target.value })}
                          maxLength={80}
                          required
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          dir="ltr"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-barcode`} className={styles.label}>
                          الباركود
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-barcode`}
                          name={variantField(index, 'barcode')}
                          value={variant.barcode}
                          onChange={(event) => updateVariant(variant.clientKey, { barcode: event.target.value })}
                          maxLength={64}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          dir="ltr"
                          placeholder="اختياري"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-weight`} className={styles.label}>
                          الوزن بالجرام
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-weight`}
                          name={variantField(index, 'weightGrams')}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={variant.weightGrams}
                          onChange={(event) => updateVariant(variant.clientKey, { weightGrams: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="اختياري"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-price`} className={styles.label} isRequired>
                          السعر (جنيه)
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-price`}
                          name={variantField(index, 'priceEgp')}
                          type="text"
                          inputMode="decimal"
                          value={variant.priceEgp}
                          onChange={(event) => updateVariant(variant.clientKey, { priceEgp: event.target.value })}
                          required
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          dir="ltr"
                          placeholder="0.00"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-compare-price`} className={styles.label}>
                          السعر قبل الخصم
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-compare-price`}
                          name={variantField(index, 'compareAtPriceEgp')}
                          type="text"
                          inputMode="decimal"
                          value={variant.compareAtPriceEgp}
                          onChange={(event) => updateVariant(variant.clientKey, { compareAtPriceEgp: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          dir="ltr"
                          placeholder="اختياري"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-option-1-name`} className={styles.label}>
                          اسم الخيار الأول
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-option-1-name`}
                          name={variantField(index, 'option1Name')}
                          value={variant.option1Name}
                          onChange={(event) => updateVariant(variant.clientKey, { option1Name: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="اللون"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-option-1-value`} className={styles.label}>
                          قيمة الخيار الأول
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-option-1-value`}
                          name={variantField(index, 'option1Value')}
                          value={variant.option1Value}
                          onChange={(event) => updateVariant(variant.clientKey, { option1Value: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="أحمر"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-option-2-name`} className={styles.label}>
                          اسم الخيار الثاني
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-option-2-name`}
                          name={variantField(index, 'option2Name')}
                          value={variant.option2Name}
                          onChange={(event) => updateVariant(variant.clientKey, { option2Name: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="المقاس"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-option-2-value`} className={styles.label}>
                          قيمة الخيار الثاني
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-option-2-value`}
                          name={variantField(index, 'option2Value')}
                          value={variant.option2Value}
                          onChange={(event) => updateVariant(variant.clientKey, { option2Value: event.target.value })}
                          disabled={!viewModel.canEdit}
                          className={styles.field}
                          placeholder="كبير"
                        />
                      </div>
                      <Checkbox.Root
                        isSelected={variant.trackInventory}
                        onChange={(trackInventory) => updateVariant(variant.clientKey, { trackInventory })}
                        isDisabled={!viewModel.canEdit}
                        className={styles.checkbox}
                      >
                        <Checkbox.Content>
                          <Checkbox.Control className={styles.checkboxControl}>
                            <Checkbox.Indicator><Check size={11} aria-hidden="true" /></Checkbox.Indicator>
                          </Checkbox.Control>
                          تتبع المخزون
                        </Checkbox.Content>
                      </Checkbox.Root>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-stock`} className={styles.label}>
                          الكمية الحالية
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-stock`}
                          name={variantField(index, 'onHand')}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={variant.onHand}
                          onChange={(event) => updateVariant(variant.clientKey, { onHand: event.target.value })}
                          disabled={!viewModel.canEdit || !variant.trackInventory}
                          className={styles.field}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <Label.Root htmlFor={`variant-${index}-threshold`} className={styles.label}>
                          تنبيه المخزون المنخفض
                        </Label.Root>
                        <Input.Root
                          id={`variant-${index}-threshold`}
                          name={variantField(index, 'lowStockThreshold')}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={variant.lowStockThreshold}
                          onChange={(event) => updateVariant(variant.clientKey, { lowStockThreshold: event.target.value })}
                          disabled={!viewModel.canEdit || !variant.trackInventory}
                          className={styles.field}
                        />
                      </div>
                      <Checkbox.Root
                        isSelected={variant.isActive}
                        onChange={(isActive) => updateVariant(variant.clientKey, { isActive })}
                        isDisabled={!viewModel.canEdit}
                        className={styles.checkbox}
                      >
                        <Checkbox.Content>
                          <Checkbox.Control className={styles.checkboxControl}>
                            <Checkbox.Indicator><Check size={11} aria-hidden="true" /></Checkbox.Indicator>
                          </Checkbox.Control>
                          متغير نشط
                        </Checkbox.Content>
                      </Checkbox.Root>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className={styles.formActions}>
              <Button.Root
                type="submit"
                isDisabled={!canSave}
                className={styles.primaryButton}
              >
                <Save size={16} aria-hidden="true" />
                حفظ المسودة
              </Button.Root>
              {!actions.saveProductAction ? (
                <p className={styles.helper}>الحفظ يتاح عند ربط إجراء المنتج بالخادم.</p>
              ) : null}
            </div>
          </form>

          {viewModel.productId ? (
            <form action={actions.submitForReviewAction} className={styles.editorSection}>
              <input type="hidden" name="intent" value="submit-for-review" />
              <input type="hidden" name="productId" value={viewModel.productId} />
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>إرسال المنتج للمراجعة</h2>
                  <p className={styles.helper}>تأكد من وجود وصف ومتغير نشط ومخزون وصورة واحدة على الأقل.</p>
                </div>
                <Button.Root
                  type="submit"
                  isDisabled={!viewModel.canSubmitForReview || !actions.submitForReviewAction}
                  className={styles.primaryButton}
                >
                  <Send size={16} aria-hidden="true" />
                  إرسال للمراجعة
                </Button.Root>
              </div>
            </form>
          ) : null}
        </div>

        <aside className={styles.editorAside}>
          <ProductGalleryManager
            key={viewModel.gallery.map((item) => `${item.id}:${item.updatedAt}`).join('|') || 'empty'}
            productId={viewModel.productId}
            merchantId={viewModel.merchantId}
            storeId={viewModel.storeId}
            expectedEntityUpdatedAt={viewModel.updatedAt}
            initialItems={viewModel.gallery}
            pendingDeletions={viewModel.pendingMediaDeletions}
            actions={actions}
            canEdit={viewModel.canEdit}
          />
          <section className={styles.editorSection} aria-labelledby="editor-summary-title">
            <h2 id="editor-summary-title" className={styles.sectionTitle}>ملخص الحفظ</h2>
            <dl>
              <div className={styles.summaryBar}>
                <dt className={styles.meta}>المتجر</dt>
                <dd className={styles.cardTitle}>{viewModel.storeName || 'غير مربوط'}</dd>
              </div>
              <div className={styles.summaryBar}>
                <dt className={styles.meta}>المتغيرات</dt>
                <dd className={styles.cardTitle}>{variants.length.toLocaleString('ar-EG')}</dd>
              </div>
              <div className={styles.summaryBar}>
                <dt className={styles.meta}>الصور</dt>
                <dd className={styles.cardTitle}>{viewModel.gallery.length.toLocaleString('ar-EG')}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
