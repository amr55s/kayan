'use client';

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Input } from '@heroui/react';
import {
  BellRing,
  Bike,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  changeDeliveryOrderStatus,
  claimDeliveryOrder,
  renewDriverAvailability,
  updateDriverPublicProfile,
} from '@/lib/operations/actions';
import { useDeliveryRealtime } from '@/hooks/useDeliveryRealtime';
import { formatPhoneForTel, formatWhatsAppUrl } from '@/lib/utils';
import { PushSubscriptionButton } from './PushSubscriptionButton';

type Order = {
  id: string;
  public_code: string;
  status: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  delivery_area: string;
  notes: string | null;
  collection_amount: number | string | null;
  delivery_fee: number | string | null;
  expires_at: string;
  assigned_driver_id: string | null;
};

type PublicProfile = {
  displayName: string;
  contactPhone: string;
  whatsapp: string;
  vehicleType: string;
};

const statusLabel: Record<string, string> = {
  open: 'مهمة متاحة',
  assigned: 'في انتظار الاستلام',
  picked_up: 'قيد التوصيل',
  issue: 'تحتاج تدخل الإدارة',
};

const cairoTime = new Intl.DateTimeFormat('ar-EG', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});

function availabilityCopy(activeUntil: string | null, now: number) {
  if (!activeUntil) return { active: false, label: 'غير متاح حاليًا', remaining: 'فعّل التواجد لاستقبال المهام' };
  const remainingMs = new Date(activeUntil).getTime() - now;
  if (remainingMs <= 0) return { active: false, label: 'انتهى وقت التواجد', remaining: 'يمكنك تجديد التواجد الآن' };
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return {
    active: true,
    label: `متاح حتى ${cairoTime.format(new Date(activeUntil))}`,
    remaining: hours
      ? `متبقٍ ${hours} ساعة${minutes ? ` و${minutes} دقيقة` : ''}`
      : `متبقٍ ${remainingMinutes} دقيقة`,
  };
}

export function DriverWorkspace({
  orders,
  availableUntil,
  serverNow,
  publicProfile,
}: {
  orders: Order[];
  availableUntil: string | null;
  serverNow: number;
  publicProfile: PublicProfile;
}) {
  useDeliveryRealtime('driver');
  const router = useRouter();
  const [actionPending, startActionTransition] = useTransition();
  const [profilePending, startProfileTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileForm, setProfileForm] = useState(publicProfile);
  const [now, setNow] = useState(serverNow);
  const availability = availabilityCopy(availableUntil, now);
  const isProfileDirty = JSON.stringify(profileForm) !== JSON.stringify(publicProfile);
  const openOrders = orders.filter((order) => order.status === 'open').length;
  const activeOrders = orders.filter((order) =>
    ['assigned', 'picked_up', 'issue'].includes(order.status),
  ).length;

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isProfileDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isProfileDirty]);

  function run(action: () => Promise<{ success: boolean; message?: string }>) {
    setActionMessage('');
    startActionTransition(async () => {
      const result = await action();
      if (!result.success) {
        setActionMessage(result.message || 'تعذر تنفيذ العملية. حاول مرة أخرى.');
        return;
      }
      setActionMessage('تم تحديث الحالة بنجاح.');
      router.refresh();
    });
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileMessage('');
    startProfileTransition(async () => {
      const result = await updateDriverPublicProfile(profileForm);
      if (!result.success) {
        setProfileMessage(result.message);
        return;
      }
      setProfileMessage('تم تحديث بيانات بطاقتك العامة.');
      router.refresh();
    });
  }

  return (
    <main
      id="main-content"
      className="dir-rtl mx-auto min-h-[calc(100dvh-4rem)] max-w-5xl space-y-5 overflow-x-clip px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6"
    >
      <Card className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 text-white shadow-lg shadow-zinc-950/10">
        <CardBody className="gap-5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-pretty sm:text-2xl">منطقة الكابتن</h1>
                <Chip
                  size="sm"
                  className={
                    availability.active
                      ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : 'border border-zinc-700 bg-zinc-900 text-zinc-300'
                  }
                >
                  {availability.active ? 'متاح' : 'غير متاح'}
                </Chip>
              </div>
              <p className="mt-1 text-sm font-semibold text-zinc-200">{availability.label}</p>
              <p className="mt-1 text-xs text-zinc-400">{availability.remaining}</p>
            </div>
            <Button
              isLoading={actionPending}
              onPress={() => run(renewDriverAvailability)}
              className="min-h-12 w-full bg-white px-5 font-extrabold text-zinc-950 sm:w-auto"
              startContent={!actionPending && <Bike className="size-5" aria-hidden="true" />}
            >
              {availability.active ? 'تجديد التواجد لساعتين' : 'تفعيل التواجد لساعتين'}
            </Button>
          </div>
          {actionMessage && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-bold text-zinc-100"
            >
              {actionMessage}
            </p>
          )}
        </CardBody>
      </Card>

      <section aria-label="ملخص الكابتن" className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="مهام متاحة" value={openOrders} icon={<BellRing className="size-4" />} />
        <SummaryCard label="مهام جارية" value={activeOrders} icon={<PackageCheck className="size-4" />} />
        <SummaryCard
          label="حالة البطاقة"
          value={publicProfile.contactPhone ? 'مكتملة' : 'ناقصة'}
          icon={<ShieldCheck className="size-4" />}
        />
      </section>

      <Card className="rounded-3xl border border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-col items-stretch gap-2 border-b border-zinc-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-black text-zinc-950">بيانات البطاقة العامة</h2>
            <p className="mt-1 text-xs leading-6 text-zinc-500">
              رقم الدخول لا يتغير هنا. رقما الاتصال وواتساب هما اللذان يعملان في أزرار بطاقتك.
            </p>
          </div>
          <Chip size="sm" variant="flat" className="w-fit text-zinc-700">
            تظهر التعديلات فور الحفظ
          </Chip>
        </CardHeader>
        <CardBody className="p-4 sm:p-5">
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            {profileMessage && (
              <p
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold sm:col-span-2"
              >
                {profileMessage}
              </p>
            )}
            <Input
              isRequired
              name="displayName"
              autoComplete="name"
              label="اسم الكابتن"
              value={profileForm.displayName}
              onValueChange={(displayName) => setProfileForm({ ...profileForm, displayName })}
            />
            <Input
              isRequired
              name="contactPhone"
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              label="رقم للتواصل"
              placeholder="مثال: 01012345678"
              value={profileForm.contactPhone}
              onValueChange={(contactPhone) => setProfileForm({ ...profileForm, contactPhone })}
            />
            <Input
              name="whatsapp"
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              label="رقم واتساب"
              placeholder="مثال: 01012345678"
              value={profileForm.whatsapp}
              onValueChange={(whatsapp) => setProfileForm({ ...profileForm, whatsapp })}
            />
            <p className="-mt-2 text-xs leading-5 text-zinc-500 sm:col-span-2">
              رقم التواصل يشغّل زر «اتصال»، ورقم واتساب يشغّل زر «واتساب» ويمكن أن يختلف عنه.
            </p>
            <Input
              name="vehicleType"
              autoComplete="off"
              label="نوع المركبة"
              placeholder="موتوسيكل، دراجة، سيارة"
              value={profileForm.vehicleType}
              onValueChange={(vehicleType) => setProfileForm({ ...profileForm, vehicleType })}
            />

            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Button
                as="a"
                href={`tel:${formatPhoneForTel(profileForm.contactPhone)}`}
                isDisabled={!profileForm.contactPhone}
                variant="flat"
                startContent={<Phone className="size-4" aria-hidden="true" />}
                className="min-h-11 font-bold"
              >
                تجربة الاتصال
              </Button>
              <Button
                as="a"
                href={formatWhatsAppUrl(profileForm.whatsapp || profileForm.contactPhone)}
                target="_blank"
                rel="noopener noreferrer"
                isDisabled={!profileForm.whatsapp && !profileForm.contactPhone}
                variant="flat"
                startContent={<MessageCircle className="size-4" aria-hidden="true" />}
                className="min-h-11 font-bold"
              >
                تجربة واتساب
              </Button>
            </div>

            <Button
              type="submit"
              isLoading={profilePending}
              isDisabled={!isProfileDirty}
              className="min-h-12 bg-zinc-950 font-bold text-white sm:col-span-2"
            >
              حفظ بيانات البطاقة
            </Button>
          </form>
        </CardBody>
      </Card>

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black">العروض والمهام</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              تظهر تفاصيل المهمة طالما العرض متاح أو أنت الكابتن المعيّن.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PushSubscriptionButton />
            <Chip className="font-black tabular-nums">{orders.length}</Chip>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          {orders.length ? (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                pending={actionPending}
                now={now}
                run={run}
              />
            ))
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center">
              <Smartphone className="size-8 text-zinc-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-zinc-700">لا توجد مهام متاحة الآن</p>
              <p className="mt-1 max-w-sm text-xs leading-6 text-zinc-500">
                فعّل التواجد والإشعارات، واترك التطبيق مثبتًا على هاتفك لتصل إليك المهام الجديدة.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 rounded-2xl border border-zinc-200 shadow-none">
      <CardBody className="gap-2 p-3 sm:flex-row sm:items-center sm:p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold text-zinc-500 sm:text-xs">{label}</p>
          <p className="truncate text-base font-black tabular-nums sm:text-lg">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function OrderCard({
  order,
  pending,
  now,
  run,
}: {
  order: Order;
  pending: boolean;
  now: number;
  run: (action: () => Promise<{ success: boolean; message?: string }>) => void;
}) {
  const remaining = useMemo(
    () => Math.max(0, Math.ceil((new Date(order.expires_at).getTime() - now) / 60_000)),
    [now, order.expires_at],
  );

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black">
            #{order.public_code} — {statusLabel[order.status] ?? order.status}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {order.recipient_name} · <bdi dir="ltr">{order.recipient_phone}</bdi>
          </p>
        </div>
        {order.status === 'open' && (
          <Chip
            color="warning"
            variant="flat"
            startContent={<Clock3 className="size-3" aria-hidden="true" />}
            className="shrink-0 tabular-nums"
          >
            {remaining} د
          </Chip>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
        <p className="flex items-start gap-1 font-bold">
          <MapPin className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span className="break-words">{order.delivery_area}</span>
        </p>
        <p className="mt-1 break-words text-zinc-600">{order.delivery_address}</p>
      </div>

      {order.notes && <p className="mt-3 break-words text-sm text-zinc-600">ملاحظة: {order.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
        {order.collection_amount !== null && (
          <Chip variant="flat">تحصيل: {order.collection_amount} ج.م</Chip>
        )}
        {order.delivery_fee !== null && (
          <Chip variant="flat">التوصيل: {order.delivery_fee} ج.م</Chip>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
        {order.status === 'open' && (
          <Button
            isLoading={pending}
            onPress={() => run(() => claimDeliveryOrder(order.id))}
            className="min-h-11 bg-zinc-950 font-extrabold text-white"
            startContent={!pending && <CheckCircle2 className="size-4" aria-hidden="true" />}
          >
            قبول المهمة
          </Button>
        )}
        {order.status === 'assigned' && (
          <>
            <Button
              isLoading={pending}
              onPress={() =>
                run(() =>
                  changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'picked_up' }),
                )
              }
              className="min-h-11 bg-zinc-950 font-bold text-white"
              startContent={!pending && <PackageCheck className="size-4" aria-hidden="true" />}
            >
              تأكيد الاستلام
            </Button>
            <Button
              variant="flat"
              isDisabled={pending}
              onPress={() =>
                run(() => changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'open' }))
              }
              className="min-h-11"
              startContent={<RotateCcw className="size-4" aria-hidden="true" />}
            >
              إعادة العرض
            </Button>
          </>
        )}
        {order.status === 'picked_up' && (
          <Button
            isLoading={pending}
            onPress={() =>
              run(() => changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'delivered' }))
            }
            className="min-h-11 bg-zinc-950 font-bold text-white"
            startContent={!pending && <PackageCheck className="size-4" aria-hidden="true" />}
          >
            تأكيد التسليم
          </Button>
        )}
      </div>
    </article>
  );
}
