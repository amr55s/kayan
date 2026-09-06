'use client';

import { Description, FieldError, Input, Label, ListBox, Select, TextArea, TextField } from '@heroui/react';
import type { ActivityKind, OnboardingDraftData } from '@/lib/onboarding/types';
import styles from './onboarding.module.css';

export function DraftField({ label, value, onChange, required = false, multiline = false, maxLength = 150, type = 'text', inputMode }: {
  label: string; value?: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean;
  maxLength?: number; type?: 'text' | 'tel'; inputMode?: 'text' | 'tel' | 'numeric' | 'decimal';
}) {
  return <TextField value={value ?? ''} onChange={onChange} isRequired={required} type={type}>
    <Label>{label}</Label>
    {multiline ? <TextArea className="dairtak-field" rows={4} maxLength={maxLength} /> : <Input className="dairtak-field" maxLength={maxLength} inputMode={inputMode ?? (type === 'tel' ? 'tel' : 'text')} />}
    <FieldError />
  </TextField>;
}

export function DraftSelect({ label, value, onChange, options }: {
  label: string; value?: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>;
}) {
  return <Select value={value || null} onChange={key => onChange(String(key ?? ''))} placeholder="اختر من القائمة">
    <Label>{label}</Label>
    <Select.Trigger className="dairtak-field"><Select.Value /><Select.Indicator /></Select.Trigger>
    <Select.Popover className="dairtak-theme" dir="rtl"><ListBox>
      {options.map(([key, title]) => <ListBox.Item key={key} id={key} textValue={title}>{title}<ListBox.ItemIndicator /></ListBox.Item>)}
    </ListBox></Select.Popover>
  </Select>;
}

export type PlaceOption = { id: string; title: string; category: string };
export function ActivityBasics({ kind, data, email, places, onChange }: {
  kind: ActivityKind; data: OnboardingDraftData; email: string; places: PlaceOption[];
  onChange: (patch: Partial<OnboardingDraftData>) => void;
}) {
  const categories = kind === 'restaurant' ? ['restaurants', 'home_made'] : kind === 'service' ? ['services', 'crafts']
    : kind === 'real_estate' ? ['real_estate'] : ['stores', 'market', 'veggies', 'pharmacy'];
  const existing = places.filter(place => categories.includes(place.category));
  return <div className={styles.fields}>
    <DraftField label="اسمك" value={data.displayName} required maxLength={100} onChange={displayName => onChange({ displayName })} />
    <TextField value={email} isReadOnly><Label>البريد المرتبط بحساب Google</Label><Input className="dairtak-field" /><Description>نستخدم بريد حسابك؛ لا تحتاج إلى كتابته أو تغييره هنا.</Description></TextField>
    <DraftField label="رقم الموبايل للتواصل" value={data.phone} required type="tel" maxLength={20} onChange={phone => onChange({ phone })} />
    <DraftField label="واتساب (اختياري)" value={data.whatsapp} type="tel" maxLength={20} onChange={whatsapp => onChange({ whatsapp })} />
    {kind === 'driver' ? <DraftSelect label="وسيلة التوصيل" value={data.vehicleType} onChange={vehicleType => onChange({ vehicleType })}
      options={[[ 'motorcycle', 'موتوسيكل' ], [ 'bicycle', 'عجلة' ], [ 'car', 'سيارة' ], [ 'other', 'وسيلة أخرى' ]]} /> : <>
      {kind !== 'real_estate' ? <DraftSelect label="مكان النشاط" value={data.placeMode ?? 'new'} onChange={placeMode => onChange({ placeMode: placeMode === 'existing' ? 'existing' : 'new', existingPlaceId: '' })}
        options={[[ 'new', 'إضافة نشاط جديد' ], [ 'existing', 'ربط مكان موجود في الدليل' ]]} /> : null}
      {data.placeMode === 'existing' && kind !== 'real_estate' ? <>
        <DraftSelect label="اختر مكانك" value={data.existingPlaceId} onChange={existingPlaceId => onChange({ existingPlaceId })}
          options={existing.map(place => [place.id, place.title] as const)} />
        <p className={styles.muted}>ستراجع الإدارة ملكيتك للمكان قبل ربطه. إن لم تجده، اختر إضافة نشاط جديد.</p>
      </> : <>
        <DraftField label={kind === 'real_estate' ? 'عنوان العرض' : 'اسم النشاط'} value={data.name} required onChange={name => onChange({ name })} />
        {kind === 'restaurant' ? <DraftSelect label="نوع الأكل" value={data.category ?? 'restaurants'} onChange={category => onChange({ category })}
          options={[[ 'restaurants', 'مطعم أو كافيه' ], [ 'home_made', 'أكل بيتي' ]]} /> : null}
        {kind === 'service' ? <DraftSelect label="تصنيف الخدمة" value={data.category ?? 'services'} onChange={category => onChange({ category })}
          options={[[ 'services', 'خدمة أو مكتب' ], [ 'crafts', 'حرفة أو صيانة' ]]} /> : null}
        <DraftField label={kind === 'service' ? 'عرّف الناس بخدمتك' : 'وصف النشاط أو العرض'} value={data.description} multiline required maxLength={2000} onChange={description => onChange({ description })} />
        <DraftField label="العنوان أو منطقة تقديم الخدمة" value={data.address} required maxLength={500} onChange={address => onChange({ address })} />
      </>}
    </>}
  </div>;
}

export function ActivityContent({ kind, data, onChange }: {
  kind: ActivityKind; data: OnboardingDraftData; onChange: (patch: Partial<OnboardingDraftData>) => void;
}) {
  if (kind === 'driver') return <p className={styles.notice}>ملف التوصيل لا يحتاج منتجات. بعد القبول ستجد مهام التوصيل وإعدادات التوفر في لوحة الكابتن.</p>;
  if (kind === 'service') return <p className={styles.notice}>وصف خدمتك هو بداية ظهورك في الدليل. يمكنك إضافة صور توضح شغلك؛ لا تحتاج إلى إضافة منتج تجاري.</p>;
  if (kind === 'real_estate') {
    const details = data.realEstate ?? { offerType: 'rent', propertyType: 'apartment', priceEgp: '' };
    const change = (patch: Partial<typeof details>) => onChange({ realEstate: { ...details, ...patch } });
    return <div className={styles.fields}>
      <DraftSelect label="نوع العرض" value={details.offerType} options={[[ 'rent', 'إيجار' ], [ 'sale', 'بيع' ]]} onChange={offerType => change({ offerType })} />
      <DraftSelect label="نوع العقار" value={details.propertyType} options={[[ 'apartment', 'شقة' ], [ 'villa', 'فيلا' ], [ 'house', 'منزل' ], [ 'shop', 'محل' ], [ 'office', 'مكتب' ], [ 'land', 'أرض' ], [ 'other', 'أخرى' ]]} onChange={propertyType => change({ propertyType })} />
      <DraftField label="السعر بالجنيه المصري" value={details.priceEgp} inputMode="decimal" required maxLength={12} onChange={priceEgp => change({ priceEgp })} />
      <DraftField label="عدد الغرف (مطلوب للوحدات السكنية)" value={details.rooms} inputMode="numeric" maxLength={3} onChange={rooms => change({ rooms })} />
      <DraftField label="عدد الحمامات" value={details.bathrooms} inputMode="numeric" maxLength={3} onChange={bathrooms => change({ bathrooms })} />
      <DraftField label="المساحة بالمتر المربع" value={details.areaSqm} inputMode="decimal" maxLength={8} onChange={areaSqm => change({ areaSqm })} />
      <DraftField label="الدور (الأرضي = 0)" value={details.floor} inputMode="numeric" maxLength={3} onChange={floor => change({ floor })} />
      <DraftSelect label="الفرش (اختياري)" value={details.furnishing} options={[[ '', 'غير محدد' ], [ 'furnished', 'مفروش' ], [ 'semi_furnished', 'نصف مفروش' ], [ 'unfurnished', 'بدون فرش' ]]} onChange={furnishing => change({ furnishing })} />
    </div>;
  }
  const product = data.product;
  return <div className={styles.fields}>
    <p className={styles.notice}>أول {kind === 'restaurant' ? 'صنف' : 'منتج'} اختياري. يُحفظ كمسودة، ولن يُنشر قبل مراجعة النشاط والمنتج.</p>
    {product ? <>
      <DraftField label={kind === 'restaurant' ? 'اسم الصنف' : 'اسم المنتج'} value={product.name} required onChange={name => onChange({ product: { ...product, name } })} />
      <DraftField label="وصف مختصر" value={product.description} multiline maxLength={2000} onChange={description => onChange({ product: { ...product, description } })} />
      <DraftField label="السعر بالجنيه المصري" value={product.priceEgp} inputMode="decimal" required maxLength={12} onChange={priceEgp => onChange({ product: { ...product, priceEgp } })} />
    </> : <p className={styles.muted}>يمكنك تجهيز الكتالوج لاحقًا من لوحة نشاطك.</p>}
  </div>;
}
