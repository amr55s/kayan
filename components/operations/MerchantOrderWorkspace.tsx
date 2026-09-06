'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { Tabs } from '@heroui/react/tabs';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import {
  Bike,
  CircleDollarSign,
  Clock3,
  ImagePlus,
  MapPin,
  Plus,
  Radio,
  Send,
  Store,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  changeDeliveryOrderStatus,
  createDeliveryOrder,
  rebroadcastDeliveryOrder,
  updateMerchantPlace,
} from '@/lib/operations/actions';
import { useDeliveryRealtime } from '@/hooks/useDeliveryRealtime';
import type { Place } from '@/types';
import {
  CATEGORY_OPTIONS,
  getListingDescriptionLabel,
  getListingImageLabel,
} from '@/lib/categories';
import { uploadOptimizedImages } from '@/lib/images/client';

type Branch = {
  id: string;
  place_id: string | null;
  name: string;
  phone: string;
  address: string;
  area: string;
};
type Driver = { id: string; name: string; vehicleType: string | null; activeUntil: string | null };
type Order = {
  id: string;
  public_code: string;
  status: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  delivery_area: string;
  collection_amount: number | string | null;
  delivery_fee: number | string | null;
  assigned_driver_id: string | null;
  expires_at: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  open: 'معروض',
  assigned: 'تم الحجز',
  picked_up: 'تم الاستلام',
  delivered: 'تم التسليم',
  unassigned: 'غير مُسند',
  cancelled: 'ملغي',
  issue: 'مشكلة',
};

type OperationSelectOption = { id: string; label: string; value?: string };

function OperationInput({ label, value, onValueChange, icon, className, isRequired, ...props }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'> & { label: string; value: string; onValueChange: (value: string) => void; icon?: React.ReactNode; className?: string; isRequired?: boolean }) {
  return (
    <TextField fullWidth isRequired={isRequired} className={`space-y-1.5 ${className || ''}`}>
      <Label className="text-sm font-bold text-zinc-800">{label}</Label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span> : null}
        <Input {...props} required={isRequired} value={value} onChange={(event) => onValueChange(event.target.value)} className={`min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 ${icon ? 'ps-10' : ''}`} />
      </div>
    </TextField>
  );
}

function OperationTextarea({ label, value, onValueChange, className, isRequired, ...props }: Omit<React.ComponentProps<typeof TextArea>, 'value' | 'onChange' | 'className'> & { label: string; value: string; onValueChange: (value: string) => void; className?: string; isRequired?: boolean }) {
  return <TextField fullWidth isRequired={isRequired} className={`space-y-1.5 ${className || ''}`}><Label className="text-sm font-bold text-zinc-800">{label}</Label><TextArea {...props} required={isRequired} value={value} onChange={(event) => onValueChange(event.target.value)} className="min-h-24 w-full rounded-xl border border-zinc-200 bg-white p-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" /></TextField>;
}

function OperationSelect({ label, value, onValueChange, options, isRequired }: { label: string; value: string; onValueChange: (value: string) => void; options: OperationSelectOption[]; isRequired?: boolean }) {
  const selectedId = options.find((option) => (option.value ?? option.id) === value)?.id ?? null;
  return (
    <Select isRequired={isRequired} selectedKey={selectedId} onSelectionChange={(key) => {
      const option = options.find((item) => item.id === String(key));
      onValueChange(option?.value ?? option?.id ?? '');
    }}>
      <Label className="text-sm font-bold text-zinc-800">{label}</Label>
      <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/10"><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox>{options.map((option) => <ListBox.Item key={option.id} id={option.id} textValue={option.label} className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100 data-[selected]:font-bold">{option.label}</ListBox.Item>)}</ListBox></Select.Popover>
    </Select>
  );
}

export function MerchantOrderWorkspace({
  branches,
  places,
  drivers,
  orders,
}: {
  branches: Branch[];
  places: Place[];
  drivers: Driver[];
  orders: Order[];
}) {
  useDeliveryRealtime('merchant');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [directDriverId, setDirectDriverId] = useState('');
  const [form, setForm] = useState({
    recipientName: '',
    recipientPhone: '',
    deliveryAddress: '',
    deliveryArea: '',
    notes: '',
    collectionAmount: '',
    deliveryFee: '',
  });
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId),
    [branchId, branches],
  );

  function submitOrder(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    startTransition(async () => {
      try {
        const result = await createDeliveryOrder({
          branchId,
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          deliveryAddress: form.deliveryAddress,
          deliveryArea: form.deliveryArea,
          notes: form.notes || null,
          collectionAmount: form.collectionAmount || null,
          deliveryFee: form.deliveryFee || null,
          directDriverId: directDriverId || null,
        });
        if (!result.success) {
          setMessage(result.message);
          return;
        }
        setMessage(`تم إنشاء الطلب #${result.data?.publicCode} وعرضه لمدة 10 دقائق.`);
        setForm({
          recipientName: '',
          recipientPhone: '',
          deliveryAddress: '',
          deliveryArea: '',
          notes: '',
          collectionAmount: '',
          deliveryFee: '',
        });
        setDirectDriverId('');
      } catch (error) {
        console.error('Create delivery order transport failed:', error);
        setMessage('انقطع الاتصال بعد إرسال الطلب. احتفظنا بالبيانات؛ حدّث قائمة الطلبات قبل إعادة الإرسال.');
      }
    });
  }

  function runOrderAction(orderId: string, action: 'rebroadcast' | 'cancel') {
    startTransition(async () => {
      try {
        const result =
          action === 'rebroadcast'
            ? await rebroadcastDeliveryOrder(orderId)
            : await changeDeliveryOrderStatus({
                orderId,
                nextStatus: 'cancelled',
                reason: 'ألغاه المحل',
              });
        setMessage(result.success ? 'تم تحديث حالة الطلب.' : result.message);
      } catch (error) {
        console.error('Delivery order action transport failed:', error);
        setMessage('انقطع الاتصال بعد إرسال التحديث. أعد مزامنة القائمة قبل تكرار العملية.');
      }
    });
  }

  return (
    <main id="main-content" className="dir-rtl mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6">
      <div className="flex justify-end"><Link href="/merchant/marketplace" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-950 bg-zinc-950 px-4 text-sm font-black text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"><Store className="size-4" aria-hidden="true" />إدارة منتجات المتجر</Link></div>
      <section>
        <h1 className="text-2xl font-black">مساحة المحل</h1>
        <p className="mt-1 text-sm text-zinc-500">
          إدارة بيانات ديرتك وتشغيل طلبات التوصيل من مكان واحد.
        </p>
      </section>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-sm font-semibold text-zinc-800"
        >
          {message}
        </p>
      )}

      <Tabs aria-label="مساحة المحل" defaultSelectedKey="orders">
        <Tabs.ListContainer><Tabs.List aria-label="أقسام مساحة المحل"><Tabs.Tab id="orders">تشغيل التوصيل</Tabs.Tab><Tabs.Tab id="profile">بيانات الخدمة</Tabs.Tab></Tabs.List></Tabs.ListContainer>
        <Tabs.Panel id="orders">
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <Card className="border border-zinc-200">
                <Card.Header className="gap-2 font-extrabold">
                  <Plus className="size-5" />
                  مهمة توصيل جديدة
                </Card.Header>
                <Card.Content>
                  <form onSubmit={submitOrder} className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><OperationSelect label="فرع الاستلام" value={branchId} onValueChange={setBranchId} isRequired options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} — ${branch.area}` }))} /></div>
                    {selectedBranch && (
                      <p className="text-xs text-zinc-500 sm:col-span-2">
                        الاستلام من: {selectedBranch.address}
                      </p>
                    )}
                    <OperationInput
                      label="اسم العميل"
                      isRequired
                      value={form.recipientName}
                      onValueChange={(recipientName) => setForm({ ...form, recipientName })}
                      icon={<UserRound className="size-4" aria-hidden="true" />}
                    />
                    <OperationInput
                      label="هاتف العميل"
                      type="tel"
                      isRequired
                      value={form.recipientPhone}
                      onValueChange={(recipientPhone) =>
                        setForm({ ...form, recipientPhone })
                      }
                    />
                    <OperationInput
                      label="المنطقة"
                      isRequired
                      value={form.deliveryArea}
                      onValueChange={(deliveryArea) => setForm({ ...form, deliveryArea })}
                      icon={<MapPin className="size-4" aria-hidden="true" />}
                    />
                    <OperationInput
                      label="قيمة التحصيل (اختياري)"
                      type="number"
                      min="0"
                      value={form.collectionAmount}
                      onValueChange={(collectionAmount) =>
                        setForm({ ...form, collectionAmount })
                      }
                      icon={<CircleDollarSign className="size-4" aria-hidden="true" />}
                    />
                    <OperationTextarea
                      label="العنوان بالتفصيل"
                      isRequired
                      className="sm:col-span-2"
                      value={form.deliveryAddress}
                      onValueChange={(deliveryAddress) =>
                        setForm({ ...form, deliveryAddress })
                      }
                    />
                    <OperationTextarea
                      label="ملاحظات للكابتن (اختياري)"
                      className="sm:col-span-2"
                      value={form.notes}
                      onValueChange={(notes) => setForm({ ...form, notes })}
                    />
                    <OperationInput
                      label="رسوم التوصيل (اختياري)"
                      type="number"
                      min="0"
                      value={form.deliveryFee}
                      onValueChange={(deliveryFee) => setForm({ ...form, deliveryFee })}
                    />
                    <OperationSelect label="كابتن معروف (اختياري)" value={directDriverId} onValueChange={setDirectDriverId} options={[{ id: 'all', value: '', label: 'بث لجميع الكباتن المتاحين' }, ...drivers.map((driver) => ({ id: driver.id, label: driver.name }))]} />
                    <Button
                      type="submit"
                      isPending={pending}
                      className="bg-zinc-900 font-extrabold text-white sm:col-span-2"
                    >
                      {!pending && <Send className="size-4" aria-hidden="true" />}
                      نشر مهمة التوصيل
                    </Button>
                  </form>
                </Card.Content>
              </Card>

              <Card className="border border-zinc-200">
                <Card.Header className="gap-2 font-extrabold">
                  <Bike className="size-5" />
                  الكباتن المتاحون الآن
                </Card.Header>
                <Card.Content className="space-y-3">
                  {drivers.length ? (
                    drivers.map((driver) => (
                      <div
                        key={driver.id}
                        className="flex items-center justify-between rounded-xl bg-zinc-50 p-3 text-sm"
                      >
                        <div>
                          <p className="font-bold">{driver.name}</p>
                          {driver.vehicleType ? <p className="text-zinc-500">{driver.vehicleType}</p> : null}
                        </div>
                        <Radio className="size-4 text-emerald-600" />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">لا يوجد كابتن متاح حالياً.</p>
                  )}
                </Card.Content>
              </Card>
            </div>

            <Card className="border border-zinc-200">
              <Card.Header className="gap-2 font-extrabold">
                <Clock3 className="size-5" />
                الطلبات الأخيرة
              </Card.Header>
              <Card.Content className="gap-3">
                {orders.length ? (
                  orders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-2xl border border-zinc-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-black">
                            #{order.public_code} — {order.recipient_name}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {order.delivery_area} · {statusLabels[order.status] ?? order.status}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {order.status === 'open' && order.assigned_driver_id && (
                            <Button
                              variant="secondary"
                              isDisabled={pending}
                              onPress={() => runOrderAction(order.id, 'rebroadcast')}
                              className="border border-zinc-200 bg-zinc-100"
                            >
                              بث عام
                            </Button>
                          )}
                          {['open', 'assigned', 'unassigned'].includes(order.status) && (
                            <Button
                              variant="danger-soft"
                              isDisabled={pending}
                              onPress={() => runOrderAction(order.id, 'cancel')}
                              className="border border-rose-200 bg-rose-50 text-rose-700"
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-zinc-500">
                    لا توجد طلبات حتى الآن.
                  </p>
                )}
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="profile">
          <MerchantDirectoryManager branches={branches} places={places} />
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}

function MerchantDirectoryManager({
  branches,
  places,
}: {
  branches: Branch[];
  places: Place[];
}) {
  const linkedPlaces = places
    .map((place) => ({
      place,
      branch: branches.find((branch) => branch.place_id === place.id),
    }))
    .filter(
      (item): item is { place: Place; branch: Branch } => Boolean(item.branch),
    );
  const [selectedId, setSelectedId] = useState(linkedPlaces[0]?.place.id ?? '');
  const selected = linkedPlaces.find((item) => item.place.id === selectedId);

  if (!linkedPlaces.length) {
    return (
      <Card className="border border-dashed border-zinc-300">
        <Card.Content className="items-center gap-2 py-10 text-center">
          <Store className="size-8 text-zinc-400" />
          <p className="font-bold">لا يوجد مكان عام مرتبط بحسابك بعد.</p>
          <p className="text-sm text-zinc-500">
            اطلب من الإدارة ربط فرع المحل ببطاقة المكان في ديرتك.
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card className="border border-zinc-200">
        <Card.Header className="font-black">الأماكن المرتبطة</Card.Header>
        <Card.Content className="gap-2">
          {linkedPlaces.map(({ place, branch }) => (
            <button
              key={place.id}
              type="button"
              onClick={() => setSelectedId(place.id)}
              className={`min-h-[44px] rounded-xl border p-3 text-start ${
                place.id === selectedId
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-900'
              }`}
            >
              <span className="block font-bold">{place.title}</span>
              <span className="block text-xs opacity-70">{branch.name}</span>
            </button>
          ))}
        </Card.Content>
      </Card>
      {selected && (
        <MerchantPlaceEditor
          key={selected.place.id}
          place={selected.place}
          branch={selected.branch}
        />
      )}
    </div>
  );
}

function MerchantPlaceEditor({ place, branch }: { place: Place; branch: Branch }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState<string[]>(place.images || []);
  const [form, setForm] = useState({
    title: place.title,
    category: place.category,
    description: place.description || '',
    address: place.address || '',
    mapUrl: place.map_url || '',
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const uploadResult = await uploadOptimizedImages(
          files,
          'merchant',
          ({ current, total, stage }) => setMessage(
            stage === 'optimizing'
              ? `جاري تحسين الصورة ${current} من ${total} مع الحفاظ على وضوح المنيو...`
              : `جاري رفع الصورة ${current} من ${total}...`,
          ),
        );
        const result = await updateMerchantPlace(
          {
            placeId: place.id,
            ...form,
            existingImages: images,
          },
          uploadResult.urls,
        );
        setMessage(
          result.success
            ? uploadResult.failedFiles.length
              ? `تم حفظ التعديلات، لكن تعذر إرفاق ${uploadResult.failedFiles.length} من الصور. يمكنك إعادة محاولة الصور الفاشلة.`
              : 'تم حفظ التعديلات وظهرت في ديرتك.'
            : result.message,
        );
        if (result.success) setFiles([]);
      } catch (error) {
        console.error('Merchant place update failed:', error);
        setMessage(
          error instanceof Error
            ? error.message
            : 'تعذر إرسال التعديلات. حاول مرة أخرى.',
        );
      }
    });
  }

  return (
    <Card className="border border-zinc-200">
      <Card.Header className="flex flex-col items-start gap-1">
        <span className="font-black">تعديل بطاقة {place.title}</span>
        <span className="text-xs font-normal text-zinc-500">
          الفرع المرتبط: {branch.name}
        </span>
      </Card.Header>
      <Card.Content>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {message && (
            <p className="rounded-xl bg-zinc-100 p-3 text-sm font-semibold sm:col-span-2">
              {message}
            </p>
          )}
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs leading-6 text-zinc-600 sm:col-span-2">
            الطلبات والتحديثات تتم من داخل الموقع. بيانات التواصل القديمة محفوظة كسجل تشغيلي ولا تظهر للعملاء.
          </p>
          <OperationInput
            isRequired
            label="اسم المكان"
            value={form.title}
            onValueChange={(title) => setForm({ ...form, title })}
          />
          <OperationSelect isRequired label="التصنيف" value={String(form.category)} onValueChange={(category) => setForm({ ...form, category })} options={CATEGORY_OPTIONS.map((category) => ({ id: category.id, label: category.label }))} />
          <OperationTextarea
            label={getListingDescriptionLabel(String(form.category))}
            placeholder={form.category === 'stores'
              ? 'أهم المنتجات والماركات، نطاق الأسعار، وخيارات الاستلام أو التوصيل…'
              : undefined}
            className="sm:col-span-2"
            rows={3}
            value={form.description}
            onValueChange={(description) => setForm({ ...form, description })}
          />
          <OperationTextarea
            autoComplete="street-address"
            label="العنوان"
            value={form.address}
            onValueChange={(address) => setForm({ ...form, address })}
          />
          <OperationInput
            type="url"
            inputMode="url"
            autoComplete="off"
            label="رابط الخريطة"
            placeholder="https://maps.app.goo.gl/…"
            value={form.mapUrl}
            onValueChange={(mapUrl) => setForm({ ...form, mapUrl })}
          />

          <div className="space-y-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{getListingImageLabel(String(form.category))}</span>
              <Chip className="bg-zinc-100 text-zinc-700">{images.length} صورة</Chip>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((image) => (
                  <div
                    key={image}
                    className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      aria-label="حذف الصورة"
                      onClick={() => setImages((current) => current.filter((item) => item !== image))}
                      className="absolute end-1 top-1 flex size-11 items-center justify-center rounded-full bg-zinc-950/80 text-white"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 text-sm font-bold text-zinc-700">
              <ImagePlus className="size-4" />
              إضافة صور جديدة
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 6))}
              />
            </label>
            {files.length > 0 && (
              <p className="text-xs text-zinc-500">
                جاهز لرفع {files.length} ملف عند الحفظ.
              </p>
            )}
          </div>

          <Button
            type="submit"
            isPending={pending}
            className="bg-zinc-900 font-bold text-white sm:col-span-2"
          >
            إرسال التعديلات للمراجعة
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
