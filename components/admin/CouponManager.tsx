'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
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
        <CardHeader className="flex flex-col items-stretch gap-4 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
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
            startContent={<Plus className="size-4" aria-hidden="true" />}
            className="bg-zinc-950 font-bold text-white"
          >
            كوبون جديد
          </Button>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <Input
            isClearable
            label="ابحث باسم المتجر أو العرض أو الكود"
            value={search}
            onValueChange={setSearch}
          />
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
                      startContent={<Pencil className="size-4" aria-hidden="true" />}
                      className="flex-1 border border-zinc-200 bg-zinc-50 font-bold text-zinc-800"
                    >
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
        </CardBody>
      </Card>

      <Modal
        isOpen={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !pending) setDraft(null);
        }}
        scrollBehavior="inside"
        classNames={{ base: 'max-w-3xl border border-zinc-200 bg-white' }}
      >
        <ModalContent>
          {(onClose) => draft && (
            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <ModalHeader className="border-b border-zinc-100">
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <Tag className="size-5" aria-hidden="true" />
                  {draft.id ? 'تعديل الكوبون' : 'إنشاء كوبون جديد'}
                </h2>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  اكتب الشروط بوضوح؛ العميل سيشاهدها قبل فتح WhatsApp.
                </p>
              </ModalHeader>
              <ModalBody className="space-y-4 py-4">
                {formError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                    {formError}
                  </p>
                )}
                <Select
                  isRequired
                  label="المتجر"
                  selectedKeys={[draft.place_id]}
                  onChange={(event) => setField('place_id', event.target.value)}
                >
                  {places.map((place) => (
                    <SelectItem key={place.id} value={place.id}>{place.title}</SelectItem>
                  ))}
                </Select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    isRequired
                    label="اسم العرض"
                    placeholder="مثال: خصم ديرتك 10%"
                    maxLength={80}
                    value={draft.title}
                    onValueChange={(value) => setField('title', value)}
                  />
                  <Input
                    isRequired
                    label="كود الكوبون"
                    placeholder="DAIRTAK10"
                    maxLength={32}
                    value={draft.code}
                    onValueChange={(value) => setField('code', value.toUpperCase())}
                    startContent={<Tag className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                </div>
                <Textarea
                  isRequired
                  label="وصف العرض"
                  placeholder="اشرح للعميل الخصم ومتى يستفيد منه."
                  minRows={2}
                  maxLength={280}
                  value={draft.description}
                  onValueChange={(value) => setField('description', value)}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Select
                    label="نوع الخصم"
                    selectedKeys={[draft.discount_type]}
                    onChange={(event) => setField('discount_type', event.target.value as CouponDiscountType)}
                  >
                    <SelectItem key="percentage" value="percentage">نسبة مئوية</SelectItem>
                    <SelectItem key="fixed" value="fixed">قيمة ثابتة</SelectItem>
                  </Select>
                  <Input
                    isRequired
                    type="number"
                    min="0.01"
                    max={draft.discount_type === 'percentage' ? '100' : undefined}
                    step="0.01"
                    label={draft.discount_type === 'percentage' ? 'نسبة الخصم %' : 'قيمة الخصم بالجنيه'}
                    value={draft.discount_value}
                    onValueChange={(value) => setField('discount_value', value)}
                  />
                  <Input
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
                  <Input
                    isRequired
                    label="الخصم على إيه؟"
                    placeholder="كل المنتجات أو منتجات محددة"
                    maxLength={160}
                    value={draft.applies_to}
                    onValueChange={(value) => setField('applies_to', value)}
                  />
                  <Input
                    isRequired
                    label="الحد أو شروط الاستخدام"
                    placeholder="مثال: الحد الأدنى 450 جنيه"
                    maxLength={160}
                    value={draft.usage_limit_text}
                    onValueChange={(value) => setField('usage_limit_text', value)}
                  />
                </div>
                <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                  <Input
                    type="datetime-local"
                    label="يبدأ في (اختياري)"
                    value={draft.starts_at ?? ''}
                    onValueChange={(value) => setField('starts_at', value)}
                    startContent={<CalendarClock className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                  <Input
                    type="datetime-local"
                    label="ينتهي في (اختياري)"
                    value={draft.expires_at ?? ''}
                    onValueChange={(value) => setField('expires_at', value)}
                    startContent={<CalendarClock className="size-4 text-zinc-400" aria-hidden="true" />}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="1000"
                    label="ترتيب الظهور"
                    value={draft.display_order}
                    onValueChange={(value) => setField('display_order', value)}
                  />
                  <div className="flex flex-wrap items-center gap-5 pt-2 text-sm font-bold">
                    <label className="flex items-center gap-2">
                      <Switch
                        isSelected={draft.is_active}
                        onValueChange={(value) => setField('is_active', value)}
                      />
                      منشور
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch
                        isSelected={draft.is_featured}
                        onValueChange={(value) => setField('is_featured', value)}
                      />
                      مميز
                    </label>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="gap-2 border-t border-zinc-100">
                <Button type="button" variant="flat" onPress={onClose} isDisabled={pending}>
                  إلغاء
                </Button>
                <Button type="submit" isLoading={pending} className="bg-zinc-950 font-bold text-white">
                  {draft.id ? 'حفظ التعديلات' : 'إنشاء ونشر الكوبون'}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
