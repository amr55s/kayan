'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Input } from '@heroui/react';
import { Bike, CheckCircle2, Clock3, MapPin, PackageCheck, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { changeDeliveryOrderStatus, claimDeliveryOrder, renewDriverAvailability, updateDriverPublicProfile } from '@/lib/operations/actions';
import { useDeliveryRealtime } from '@/hooks/useDeliveryRealtime';
import { PushSubscriptionButton } from './PushSubscriptionButton';

type Order = { id: string; public_code: string; status: string; recipient_name: string; recipient_phone: string; delivery_address: string; delivery_area: string; notes: string | null; collection_amount: number | string | null; delivery_fee: number | string | null; expires_at: string; assigned_driver_id: string | null };

const statusLabel: Record<string, string> = { open: 'مهمة متاحة', assigned: 'في انتظار الاستلام', picked_up: 'قيد التوصيل', issue: 'تحتاج تدخل الإدارة' };

export function DriverWorkspace({ orders, availableUntil, publicProfile }: { orders: Order[]; availableUntil: string | null; publicProfile: { displayName: string; whatsapp: string; vehicleType: string } }) {
  useDeliveryRealtime('driver');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileForm, setProfileForm] = useState(publicProfile);
  const active = availableUntil && new Date(availableUntil) > new Date();
  function run(action: () => Promise<{ success: boolean; message?: string }>) {
    setActionMessage('');
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setActionMessage(result.message || 'تعذر تنفيذ العملية.');
        return;
      }
      router.refresh();
    });
  }
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateDriverPublicProfile(profileForm);
      setProfileMessage(result.success ? 'تم تحديث بيانات بطاقتك العامة.' : result.message);
    });
  }

  return <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-6 dir-rtl">
    <Card className="border border-zinc-200 bg-zinc-950 text-white"><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-black">منطقة الكابتن</h1><p className="mt-1 text-sm text-zinc-300">{active ? `متاح حتى ${new Date(availableUntil).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : 'أنت غير متاح حالياً'}</p>{actionMessage && <p role="alert" className="mt-2 text-sm font-bold text-rose-300">{actionMessage}</p>}</div><Button isLoading={pending} onPress={() => run(renewDriverAvailability)} className="bg-white font-extrabold text-zinc-950" startContent={!pending && <Bike className="size-4" />}>تفعيل التواجد لساعتين</Button></CardBody></Card>
    <Card className="border border-zinc-200"><CardHeader className="font-black">بيانات البطاقة العامة</CardHeader><CardBody><form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">{profileMessage && <p className="rounded-xl bg-zinc-100 p-3 text-sm font-semibold sm:col-span-2">{profileMessage}</p>}<Input isRequired name="displayName" autoComplete="name" label="اسم الكابتن" value={profileForm.displayName} onValueChange={(displayName) => setProfileForm({ ...profileForm, displayName })} /><Input name="whatsapp" autoComplete="tel" type="tel" label="رقم واتساب" value={profileForm.whatsapp} onValueChange={(whatsapp) => setProfileForm({ ...profileForm, whatsapp })} /><Input name="vehicleType" autoComplete="off" label="نوع المركبة" value={profileForm.vehicleType} onValueChange={(vehicleType) => setProfileForm({ ...profileForm, vehicleType })} /><Button type="submit" isLoading={pending} className="bg-zinc-900 font-bold text-white sm:col-span-2">حفظ البيانات العامة</Button></form></CardBody></Card>
    <section className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">العروض والمهام</h2><p className="text-sm text-zinc-500">ستظهر هنا جميع التفاصيل طالما العرض متاح أو أنت الكابتن المعيّن.</p></div><div className="flex items-center gap-2"><PushSubscriptionButton /><Chip>{orders.length}</Chip></div></section>
    <div className="grid gap-4">
      {orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} pending={pending} run={run} />) : <Card><CardBody className="py-10 text-center text-sm text-zinc-500">لا توجد مهام متاحة الآن. أبقِ التواجد مفعلاً لتصلك الإشعارات.</CardBody></Card>}
    </div>
  </main>;
}

function OrderCard({ order, pending, run }: { order: Order; pending: boolean; run: (action: () => Promise<{ success: boolean }>) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((new Date(order.expires_at).getTime() - now) / 60_000));
  return <Card className="border border-zinc-200"><CardHeader className="flex items-start justify-between gap-3"><div><p className="font-black">#{order.public_code} — {statusLabel[order.status] ?? order.status}</p><p className="mt-1 text-sm text-zinc-500">{order.recipient_name} · <span className="dir-ltr">{order.recipient_phone}</span></p></div>{order.status === 'open' && <Chip color="warning" variant="flat" startContent={<Clock3 className="size-3" />}>{remaining} د</Chip>}</CardHeader><CardBody className="space-y-3 pt-0"><div className="rounded-xl bg-zinc-50 p-3 text-sm"><p className="flex items-center gap-1 font-bold"><MapPin className="size-4 text-rose-600" />{order.delivery_area}</p><p className="mt-1 text-zinc-600">{order.delivery_address}</p></div>{order.notes && <p className="text-sm text-zinc-600">ملاحظة: {order.notes}</p>}<div className="flex flex-wrap gap-2 text-xs text-zinc-600">{order.collection_amount !== null && <Chip variant="flat">تحصيل: {order.collection_amount} ج.م</Chip>}{order.delivery_fee !== null && <Chip variant="flat">التوصيل: {order.delivery_fee} ج.م</Chip>}</div><div className="flex flex-wrap gap-2">{order.status === 'open' && <Button isLoading={pending} onPress={() => run(() => claimDeliveryOrder(order.id))} className="bg-zinc-900 font-extrabold text-white" startContent={!pending && <CheckCircle2 className="size-4" />}>قبول المهمة</Button>}{order.status === 'assigned' && <><Button isLoading={pending} onPress={() => run(() => changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'picked_up' }))} className="bg-zinc-900 font-bold text-white" startContent={!pending && <PackageCheck className="size-4" />}>تأكيد الاستلام</Button><Button variant="flat" isDisabled={pending} onPress={() => run(() => changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'open' }))} startContent={<RotateCcw className="size-4" />}>إعادة العرض</Button></>}{order.status === 'picked_up' && <Button isLoading={pending} onPress={() => run(() => changeDeliveryOrderStatus({ orderId: order.id, nextStatus: 'delivered' }))} className="bg-zinc-900 font-bold text-white" startContent={!pending && <PackageCheck className="size-4" />}>تأكيد التسليم</Button>}</div></CardBody></Card>;
}
