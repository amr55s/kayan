'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import {
  ArrowUpLeft,
  BadgePercent,
  Check,
  Copy,
  MessageCircle,
  ReceiptText,
  ShoppingBag,
  Tag,
  X,
} from 'lucide-react';
import type { Place, StoreCoupon } from '@/types';
import { formatWhatsAppUrl } from '@/lib/utils';
import { SITE_NAME_AR } from '@/lib/brand';
import { trackSiteEvent } from '@/lib/analytics/client';

function couponDiscount(coupon: StoreCoupon) {
  const value = Number(coupon.discount_value).toLocaleString('ar-EG', {
    maximumFractionDigits: 2,
  });
  return coupon.discount_type === 'percentage'
    ? `${value}% خصم`
    : `${value} جنيه خصم`;
}

function minimumOrder(coupon: StoreCoupon) {
  return coupon.minimum_order_amount == null
    ? 'بدون حد أدنى للأوردر'
    : `على أوردر يبدأ من ${Number(coupon.minimum_order_amount).toLocaleString('ar-EG')} جنيه`;
}

function whatsAppMessage(place: Place, coupon: StoreCoupon) {
  return [
    `مرحباً ${place.title}، أريد الطلب باستخدام كوبون ${coupon.code} عبر ${SITE_NAME_AR}.`,
    `العرض: ${couponDiscount(coupon)} — ${minimumOrder(coupon)}.`,
    `يشمل: ${coupon.applies_to}.`,
    `الشروط: ${coupon.usage_limit_text}`,
  ].join('\n');
}

function CouponDetails({ coupon }: { coupon: StoreCoupon }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-2xl bg-zinc-950 p-4 text-white">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-300">عرض حصري عبر كيان</p>
            <h3 className="mt-1 text-xl font-black">{couponDiscount(coupon)}</h3>
            <p className="mt-1 text-xs font-semibold text-zinc-300">{minimumOrder(coupon)}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm font-black" dir="ltr">
            {coupon.code}
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold leading-6 text-zinc-700 sm:leading-7">{coupon.description}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold leading-6 text-zinc-700">
          <ShoppingBag className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <span><b className="block text-zinc-950">المنتجات المشمولة</b>{coupon.applies_to}</span>
        </p>
        <p className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold leading-6 text-zinc-700">
          <ReceiptText className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <span><b className="block text-zinc-950">حد وشروط الاستخدام</b>{coupon.usage_limit_text}</span>
        </p>
      </div>
      {coupon.expires_at && (
        <p className="text-center text-[11px] font-semibold text-zinc-500">
          متاح حتى {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(coupon.expires_at))}
        </p>
      )}
    </div>
  );
}

export function CouponOffer({ place }: { place: Place }) {
  const coupons = useMemo(
    () => (place.coupons ?? []).filter((coupon) => coupon.is_active),
    [place.coupons],
  );
  const [selected, setSelected] = useState<StoreCoupon | null>(null);
  const [copied, setCopied] = useState(false);
  if (!coupons.length) return null;
  const lead = coupons[0];

  async function copyCode() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSelected(lead)}
        className="group/coupon flex min-h-14 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-orange-50 px-3 py-2.5 text-start transition-colors hover:border-amber-300 hover:from-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500"
        aria-label={`عرض تفاصيل كوبون ${lead.code} لمتجر ${place.title}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-zinc-950 shadow-sm">
            <BadgePercent className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block truncate text-sm font-black text-zinc-950">{couponDiscount(lead)}</b>
            <span className="block truncate text-[11px] font-bold text-amber-900">{minimumOrder(lead)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-black text-zinc-800">
          التفاصيل
          <ArrowUpLeft className="size-3.5 transition-transform group-hover/coupon:-translate-x-0.5 group-hover/coupon:-translate-y-0.5" aria-hidden="true" />
        </span>
      </button>

      <Modal
        isOpen={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setCopied(false);
          }
        }}
        placement="center"
        aria-label={`تفاصيل كوبون ${selected?.code ?? lead.code}`}
        classNames={{
          wrapper: 'items-center p-3 sm:p-6',
          base: 'max-h-[min(88dvh,720px)] max-w-lg border border-zinc-200 bg-white',
          header: 'p-3 sm:p-4',
          body: 'px-3 sm:px-4',
          footer: 'p-3 sm:p-4',
        }}
      >
        <ModalContent>
          {(onClose) => selected && (
            <>
              <ModalHeader className="border-b border-zinc-100">
                <div className="flex w-full items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Chip className="bg-amber-100 text-amber-900">كوبون مميز</Chip>
                      {coupons.length > 1 && <Chip variant="flat">{coupons.length} عروض</Chip>}
                    </div>
                    <h2 className="mt-2 text-lg font-black text-zinc-950">{selected.title}</h2>
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500">{place.title}</p>
                  </div>
                  <Button
                    isIconOnly
                    variant="light"
                    onPress={onClose}
                    aria-label="إغلاق تفاصيل الكوبون"
                    className="size-11 min-w-11 text-zinc-600"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Button>
                </div>
              </ModalHeader>
              <ModalBody className="space-y-4 overscroll-contain py-3 sm:py-4">
                {coupons.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="عروض المتجر">
                    {coupons.map((coupon) => (
                      <Button
                        key={coupon.id}
                        size="sm"
                        variant={coupon.id === selected.id ? 'solid' : 'flat'}
                        onPress={() => {
                          setSelected(coupon);
                          setCopied(false);
                        }}
                        className={coupon.id === selected.id ? 'shrink-0 bg-zinc-950 text-white' : 'shrink-0'}
                      >
                        {couponDiscount(coupon)}
                      </Button>
                    ))}
                  </div>
                )}
                <CouponDetails coupon={selected} />
              </ModalBody>
              <ModalFooter className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-t border-zinc-100">
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={copyCode}
                  aria-label="نسخ كود الخصم"
                  className="min-h-12 min-w-12 border border-zinc-200 bg-zinc-50"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
                <Button
                  as="a"
                  href={formatWhatsAppUrl(
                    place.whatsapp || place.phone,
                    whatsAppMessage(place, selected),
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackSiteEvent('whatsapp_click', {
                    targetType: 'place',
                    targetKey: place.id,
                  })}
                  startContent={<MessageCircle className="size-5" aria-hidden="true" />}
                  endContent={<Tag className="size-4" aria-hidden="true" />}
                  className="min-h-12 min-w-0 bg-emerald-600 px-3 text-sm font-black text-white hover:bg-emerald-700 sm:px-4 sm:text-base"
                >
                  استخدم الكوبون على واتساب
                </Button>
                <span className="sr-only" aria-live="polite">{copied ? 'تم نسخ كود الخصم' : ''}</span>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
