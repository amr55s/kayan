'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { Switch } from '@heroui/react/switch';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { useOverlayState } from '@heroui/react';
import {
  BadgePercent,
  CalendarClock,
  Pencil,
  Plus,
  Store,
  Tag,
  Trash2,
} from 'lucide-react';
import type { CouponDiscountType, Place, StoreCoupon } from '@/types';
import {
  serverDeleteStoreCoupon,
  serverUpsertStoreCoupon,
  type StoreCouponInput,
} from '@/lib/supabase/admin-actions';

type CouponDraft = Omit<StoreCouponInput, 'discount_value' | 'minimum_order_amount' | 'display_order'> & {
  discount_value: string;
  minimum_order_amount: string;
  display_order: string;
};

function dateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function optionalIso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function createDraft(placeId: string, coupon?: StoreCoupon): CouponDraft {
  return {
    id: coupon?.id,
    place_id: coupon?.place_id ?? placeId,
    title: coupon?.title ?? '',
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    discount_type: coupon?.discount_type ?? 'percentage',
    discount_value: coupon ? String(coupon.discount_value) : '10',
    minimum_order_amount: coupon?.minimum_order_amount == null
      ? ''
      : String(coupon.minimum_order_amount),
    applies_to: coupon?.applies_to ?? 'كل المنتجات',
    usage_limit_text: coupon?.usage_limit_text ?? '',
    is_active: coupon?.is_active ?? true,
    is_featured: coupon?.is_featured ?? false,
    display_order: String(coupon?.display_order ?? 0),
    starts_at: dateTimeLocal(coupon?.starts_at ?? null),
    expires_at: dateTimeLocal(coupon?.expires_at ?? null),
  };
}

type CouponOption = { id: string; label: string };

function CouponInput({ label, value, onValueChange, icon, isRequired, ...props }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { label: string; value: string; onValueChange: (value: string) => void; icon?: React.ReactNode; isRequired?: boolean }) {
  return <TextField fullWidth isRequired={isRequired} className="space-y-1.5"><Label className="text-sm font-bold text-zinc-800">{label}</Label><div className="relative">{icon ? <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span> : null}<Input {...props} required={isRequired} value={value} onChange={(event) => onValueChange(event.target.value)} className={`min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 ${icon ? 'ps-10' : ''}`} /></div></TextField>;
}

function CouponTextarea({ label, value, onValueChange, isRequired, ...props }: Omit<React.ComponentProps<typeof TextArea>, 'value' | 'onChange'> & { label: string; value: string; onValueChange: (value: string) => void; isRequired?: boolean }) {
  return <TextField fullWidth isRequired={isRequired} className="space-y-1.5"><Label className="text-sm font-bold text-zinc-800">{label}</Label><TextArea {...props} required={isRequired} value={value} onChange={(event) => onValueChange(event.target.value)} className="min-h-24 w-full rounded-xl border border-zinc-200 bg-white p-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" /></TextField>;
}

function CouponSelect({ label, value, onValueChange, options, isRequired }: { label: string; value: string; onValueChange: (value: string) => void; options: CouponOption[]; isRequired?: boolean }) {
  return <Select isRequired={isRequired} selectedKey={value || null} onSelectionChange={(key) => onValueChange(String(key ?? ''))}><Label className="text-sm font-bold text-zinc-800">{label}</Label><Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/10"><Select.Value /><Select.Indicator /></Select.Trigger><Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox>{options.map((option) => <ListBox.Item key={option.id} id={option.id} textValue={option.label} className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100 data-[selected]:font-bold">{option.label}</ListBox.Item>)}</ListBox></Select.Popover></Select>;
}

function discountLabel(coupon: StoreCoupon) {
  const value = Number(coupon.discount_value).toLocaleString('ar-EG', {
    maximumFractionDigits: 2,
  });
  return coupon.discount_type === 'percentage'
    ? `خصم ${value}%`
    : `خصم ${value} جنيه`;
}

function couponState(coupon: StoreCoupon) {
  const now = Date.now();
  if (!coupon.is_active) return { label: 'متوقف', className: 'bg-zinc-100 text-zinc-600' };
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now) {
    return { label: 'مجدول', className: 'bg-sky-50 text-sky-800' };
  }
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= now) {
    return { label: 'منتهي', className: 'bg-rose-50 text-rose-800' };
  }
  return { label: 'منشور', className: 'bg-emerald-50 text-emerald-800' };
}

export function CouponManager({
  places,
  onRefresh,
  onMessage,
}: {
  places: Place[];
  onRefresh: () => void;
  onMessage: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<CouponDraft | null>(null);
  const [formError, setFormError] = useState('');
  const modalState = useOverlayState({
    isOpen: Boolean(draft),
    onOpenChange: (open) => {
      if (!open && !pending) setDraft(null);
    },
  });
  const coupons = useMemo(
    () => places.flatMap((place) =>
      (place.coupons ?? []).map((coupon) => ({ coupon, place })),
    ),
    [places],
  );
  const filtered = coupons.filter(({ coupon, place }) => {
    const query = search.trim().toLowerCase();
    return !query
      || coupon.title.toLowerCase().includes(query)
      || coupon.code.toLowerCase().includes(query)
      || place.title.toLowerCase().includes(query);
  });

  function setField<K extends keyof CouponDraft>(key: K, value: CouponDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function openCreate() {
    if (!places.length) {
      onMessage('أضف متجراً أولاً قبل إنشاء كوبون.');
      return;
    }
    setFormError('');
    setDraft(createDraft(places[0].id));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setFormError('');
    startTransition(async () => {
      try {
        const result = await serverUpsertStoreCoupon({
          ...draft,
          code: draft.code.toUpperCase(),
          discount_value: Number(draft.discount_value),
          minimum_order_amount: draft.minimum_order_amount === ''
            ? null
            : Number(draft.minimum_order_amount),
          display_order: Number(draft.display_order || 0),
          starts_at: optionalIso(draft.starts_at),
          expires_at: optionalIso(draft.expires_at),
        });
        if (!result.success) {
          setFormError(result.message);
          return;
        }
        setDraft(null);
        onMessage(result.message);
        onRefresh();
      } catch {
        setFormError('تعذر حفظ الكوبون الآن. تحقق من الاتصال وحاول مرة أخرى.');
      }
    });
  }

  function remove(coupon: StoreCoupon) {
    if (!window.confirm(`حذف كوبون ${coupon.code} نهائياً؟`)) return;
    startTransition(async () => {
      try {
        const result = await serverDeleteStoreCoupon(coupon.id);
        onMessage(result.message);
        if (result.success) onRefresh();
      } catch {
        onMessage('تعذر حذف الكوبون الآن. تحقق من الاتصال وحاول مرة أخرى.');
      }
    });
  }

  return (
    <>
      <Card className="border border-zinc-200 shadow-none">
        <Card.Header className="flex flex-col items-stretch gap-4 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-zinc-950">
              <BadgePercent className="size-5" aria-hidden="true" />
              كوبونات المتاجر
            </h2>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              أنشئ العرض وحدّه الأدنى والمنتجات المشمولة، ثم يظهر تلقائياً داخل بطاقة المتجر.
            </p>
          </div>
          <Button
            onPress={openCreate}
            className="bg-zinc-950 font-bold text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
            كوبون جديد
          </Button>
        </Card.Header>
        <Card.Content className="gap-4 p-4">
          <CouponInput label="ابحث باسم المتجر أو العرض أو الكود" value={search} onValueChange={setSearch} />
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map(({ coupon, place }) => {
              const state = couponState(coupon);
              return (
                <article
                  key={coupon.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip className={state.className}>{state.label}</Chip>
                        {coupon.is_featured && (
                          <Chip className="bg-amber-50 text-amber-800">مميز</Chip>
                        )}
                      </div>
                      <h3 className="mt-2 truncate font-black text-zinc-950">{coupon.title}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-zinc-500">
                        <Store className="size-3.5" aria-hidden="true" />
                        {place.title}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-xl bg-zinc-950 px-3 py-2 font-mono text-sm font-black text-white" dir="ltr">
                      {coupon.code}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <p className="rounded-xl bg-amber-50 p-2.5 font-black text-amber-900">
                      {discountLabel(coupon)}
                    </p>
                    <p className="rounded-xl bg-zinc-50 p-2.5 font-bold text-zinc-700">
                      {coupon.minimum_order_amount
                        ? `من ${Number(coupon.minimum_order_amount).toLocaleString('ar-EG')} ج.م`
                        : 'بدون حد أدنى'}
                    </p>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-6 text-zinc-600">
                    {coupon.description}
                  </p>
                  <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3">
                    <Button
                      isDisabled={pending}
                      onPress={() => {
                        setFormError('');
                        setDraft(createDraft(place.id, coupon));
                      }}
                      className="flex-1 border border-zinc-200 bg-zinc-50 font-bold text-zinc-800"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      تعديل
                    </Button>
                    <Button
                      isIconOnly
                      isDisabled={pending}
                      onPress={() => remove(coupon)}
                      aria-label={`حذف كوبون ${coupon.code}`}
                      className="bg-rose-50 text-rose-700"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {!filtered.length && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm font-semibold text-zinc-500">
              {coupons.length ? 'لا توجد كوبونات مطابقة للبحث.' : 'لا توجد كوبونات بعد. أنشئ أول عرض لأي متجر.'}
            </div>
          )}
        </Card.Content>
      </Card>

      <Modal state={modalState}>
        <Modal.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
          <Modal.Container placement="center" size="lg" scroll="inside" className="p-3">
            <Modal.Dialog aria-label={draft?.id ? 'تعديل الكوبون' : 'إنشاء كوبون جديد'} dir="rtl" className="max-w-3xl border border-zinc-200 bg-white">
          {draft ? (
            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <Modal.Header className="border-b border-zinc-100">
                <Modal.Heading className="flex items-center gap-2 text-lg font-black">
                  <Tag className="size-5" aria-hidden="true" />
                  {draft.id ? 'تعديل الكوبون' : 'إنشاء كوبون جديد'}
                </Modal.Heading>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  اكتب الشروط بوضوح؛ العميل سيشاهدها قبل تطبيق الكود داخل السلة.
                </p>
              </Modal.Header>
              <Modal.Body className="space-y-4 py-4">
                {formError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                    {formError}
                  </p>
                )}
                <CouponSelect isRequired label="المتجر" value={draft.place_id} onValueChange={(value) => setField('place_id', value)} options={places.map((place) => ({ id: place.id, label: place.title }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CouponInput
                    isRequired
                    label="اسم العرض"
                    placeholder="مثال: خصم ديرتك 10%"
                    maxLength={80}
                    value={draft.title}
                    onValueChange={(value) => setField('title', value)}
                  />
                  <CouponInput
                    isRequired
                    label="كود الكوبون"
                    placeholder="DAIRTAK10"
                    maxLength={32}
                    value={draft.code}
                    onValueChange={(value) => setField('code', value.toUpperCase())}
                    icon={<Tag className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                </div>
                <CouponTextarea
                  isRequired
                  label="وصف العرض"
                  placeholder="اشرح للعميل الخصم ومتى يستفيد منه."
                  rows={2}
                  maxLength={280}
                  value={draft.description}
                  onValueChange={(value) => setField('description', value)}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <CouponSelect label="نوع الخصم" value={draft.discount_type} onValueChange={(value) => setField('discount_type', value as CouponDiscountType)} options={[{ id: 'percentage', label: 'نسبة مئوية' }, { id: 'fixed', label: 'قيمة ثابتة' }]} />
                  <CouponInput
                    isRequired
                    type="number"
                    min="0.01"
                    max={draft.discount_type === 'percentage' ? '100' : undefined}
                    step="0.01"
                    label={draft.discount_type === 'percentage' ? 'نسبة الخصم %' : 'قيمة الخصم بالجنيه'}
                    value={draft.discount_value}
                    onValueChange={(value) => setField('discount_value', value)}
                  />
                  <CouponInput
                    type="number"
                    min="0"
                    step="0.01"
                    label="الحد الأدنى للأوردر"
                    placeholder="بدون حد أدنى"
                    value={draft.minimum_order_amount}
                    onValueChange={(value) => setField('minimum_order_amount', value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CouponInput
                    isRequired
                    label="الخصم على إيه؟"
                    placeholder="كل المنتجات أو منتجات محددة"
                    maxLength={160}
                    value={draft.applies_to}
                    onValueChange={(value) => setField('applies_to', value)}
                  />
                  <CouponInput
                    isRequired
                    label="الحد أو شروط الاستخدام"
                    placeholder="مثال: الحد الأدنى 450 جنيه"
                    maxLength={160}
                    value={draft.usage_limit_text}
                    onValueChange={(value) => setField('usage_limit_text', value)}
                  />
                </div>
                <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                  <CouponInput
                    type="datetime-local"
                    label="يبدأ في (اختياري)"
                    value={draft.starts_at ?? ''}
                    onValueChange={(value) => setField('starts_at', value)}
                    icon={<CalendarClock className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                  <CouponInput
                    type="datetime-local"
                    label="ينتهي في (اختياري)"
                    value={draft.expires_at ?? ''}
                    onValueChange={(value) => setField('expires_at', value)}
                    icon={<CalendarClock className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                  <CouponInput
                    type="number"
                    min="0"
                    max="1000"
                    label="ترتيب الظهور"
                    value={draft.display_order}
                    onValueChange={(value) => setField('display_order', value)}
                  />
                  <div className="flex flex-wrap items-center gap-5 pt-2 text-sm font-bold">
                    <label className="flex items-center gap-2">
                      <Switch isSelected={draft.is_active} onChange={(value) => setField('is_active', value)} aria-label="الكوبون منشور"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                      منشور
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch isSelected={draft.is_featured} onChange={(value) => setField('is_featured', value)} aria-label="الكوبون مميز"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                      مميز
                    </label>
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer className="gap-2 border-t border-zinc-100">
                <Button type="button" variant="secondary" onPress={modalState.close} isDisabled={pending}>
                  إلغاء
                </Button>
                <Button type="submit" isPending={pending} className="bg-zinc-950 font-bold text-white">
                  {draft.id ? 'حفظ التعديلات' : 'إنشاء ونشر الكوبون'}
                </Button>
              </Modal.Footer>
            </form>
          ) : null}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
