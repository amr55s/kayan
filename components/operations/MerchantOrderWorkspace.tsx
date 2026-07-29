'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
} from '@heroui/react';
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
import { CATEGORY_OPTIONS } from '@/lib/categories';
import { uploadOptimizedImages } from '@/lib/images/client';

type Branch = {
  id: string;
  place_id: string | null;
  name: string;
  phone: string;
  address: string;
  area: string;
};
type Driver = { id: string; name: string; phone: string; activeUntil: string | null };
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
    <main className="dir-rtl mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6">
      <section>
        <h1 className="text-2xl font-black">مساحة المحل</h1>
        <p className="mt-1 text-sm text-zinc-500">
          إدارة بيانات كيان سيتي سبوت وتشغيل طلبات التوصيل من مكان واحد.
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

      <Tabs aria-label="مساحة المحل">
        <Tab id="orders" key="orders" title="تشغيل التوصيل">
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <Card className="border border-zinc-200">
                <CardHeader className="gap-2 font-extrabold">
                  <Plus className="size-5" />
                  مهمة توصيل جديدة
                </CardHeader>
                <CardBody>
                  <form onSubmit={submitOrder} className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="فرع الاستلام"
                      selectedKeys={branchId ? [branchId] : []}
                      onSelectionChange={(keys) =>
                        setBranchId(String(Array.from(keys)[0] ?? ''))
                      }
                      className="sm:col-span-2"
                      isRequired
                    >
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} — {branch.area}
                        </SelectItem>
                      ))}
                    </Select>
                    {selectedBranch && (
                      <p className="text-xs text-zinc-500 sm:col-span-2">
                        الاستلام من: {selectedBranch.address}
                      </p>
                    )}
                    <Input
                      label="اسم العميل"
                      isRequired
                      value={form.recipientName}
                      onValueChange={(recipientName) => setForm({ ...form, recipientName })}
                      startContent={<UserRound className="size-4" />}
                    />
                    <Input
                      label="هاتف العميل"
                      type="tel"
                      isRequired
                      value={form.recipientPhone}
                      onValueChange={(recipientPhone) =>
                        setForm({ ...form, recipientPhone })
                      }
                    />
                    <Input
                      label="المنطقة"
                      isRequired
                      value={form.deliveryArea}
                      onValueChange={(deliveryArea) => setForm({ ...form, deliveryArea })}
                      startContent={<MapPin className="size-4" />}
                    />
                    <Input
                      label="قيمة التحصيل (اختياري)"
                      type="number"
                      min="0"
                      value={form.collectionAmount}
                      onValueChange={(collectionAmount) =>
                        setForm({ ...form, collectionAmount })
                      }
                      startContent={<CircleDollarSign className="size-4" />}
                    />
                    <Textarea
                      label="العنوان بالتفصيل"
                      isRequired
                      className="sm:col-span-2"
                      value={form.deliveryAddress}
                      onValueChange={(deliveryAddress) =>
                        setForm({ ...form, deliveryAddress })
                      }
                    />
                    <Textarea
                      label="ملاحظات للكابتن (اختياري)"
                      className="sm:col-span-2"
                      value={form.notes}
                      onValueChange={(notes) => setForm({ ...form, notes })}
                    />
                    <Input
                      label="رسوم التوصيل (اختياري)"
                      type="number"
                      min="0"
                      value={form.deliveryFee}
                      onValueChange={(deliveryFee) => setForm({ ...form, deliveryFee })}
                    />
                    <Select
                      label="كابتن معروف (اختياري)"
                      selectedKeys={directDriverId ? [directDriverId] : ['']}
                      onSelectionChange={(keys) =>
                        setDirectDriverId(String(Array.from(keys)[0] ?? ''))
                      }
                    >
                      <SelectItem key="all" value="">
                        بث لجميع الكباتن المتاحين
                      </SelectItem>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name} — {driver.phone}
                        </SelectItem>
                      ))}
                    </Select>
                    <Button
                      type="submit"
                      isLoading={pending}
                      className="bg-zinc-900 font-extrabold text-white sm:col-span-2"
                      startContent={!pending && <Send className="size-4" />}
                    >
                      نشر مهمة التوصيل
                    </Button>
                  </form>
                </CardBody>
              </Card>

              <Card className="border border-zinc-200">
                <CardHeader className="gap-2 font-extrabold">
                  <Bike className="size-5" />
                  الكباتن المتاحون الآن
                </CardHeader>
                <CardBody className="space-y-3">
                  {drivers.length ? (
                    drivers.map((driver) => (
                      <div
                        key={driver.id}
                        className="flex items-center justify-between rounded-xl bg-zinc-50 p-3 text-sm"
                      >
                        <div>
                          <p className="font-bold">{driver.name}</p>
                          <p className="dir-ltr text-zinc-500">{driver.phone}</p>
                        </div>
                        <Radio className="size-4 text-emerald-600" />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">لا يوجد كابتن متاح حالياً.</p>
                  )}
                </CardBody>
              </Card>
            </div>

            <Card className="border border-zinc-200">
              <CardHeader className="gap-2 font-extrabold">
                <Clock3 className="size-5" />
                الطلبات الأخيرة
              </CardHeader>
              <CardBody className="gap-3">
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
                              variant="flat"
                              isDisabled={pending}
                              onPress={() => runOrderAction(order.id, 'rebroadcast')}
                              className="border border-zinc-200 bg-zinc-100"
                            >
                              بث عام
                            </Button>
                          )}
                          {['open', 'assigned', 'unassigned'].includes(order.status) && (
                            <Button
                              variant="flat"
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
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab id="profile" key="profile" title="بيانات الخدمة">
          <MerchantDirectoryManager branches={branches} places={places} />
        </Tab>
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
        <CardBody className="items-center gap-2 py-10 text-center">
          <Store className="size-8 text-zinc-400" />
          <p className="font-bold">لا يوجد مكان عام مرتبط بحسابك بعد.</p>
          <p className="text-sm text-zinc-500">
            اطلب من الإدارة ربط فرع المحل ببطاقة المكان في كيان سيتي سبوت.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card className="border border-zinc-200">
        <CardHeader className="font-black">الأماكن المرتبطة</CardHeader>
        <CardBody className="gap-2">
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
        </CardBody>
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
    phone: place.phone,
    whatsapp: place.whatsapp || '',
    instapayVfcash: place.instapay_vfcash || '',
    description: place.description || '',
    whatsappGroupUrl: place.whatsapp_group_url || '',
    telegramUrl: place.telegram_url || '',
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
              : 'تم حفظ التعديلات وظهرت في كيان سيتي سبوت.'
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
      <CardHeader className="flex flex-col items-start gap-1">
        <span className="font-black">تعديل بطاقة {place.title}</span>
        <span className="text-xs font-normal text-zinc-500">
          الفرع المرتبط: {branch.name}
        </span>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {message && (
            <p className="rounded-xl bg-zinc-100 p-3 text-sm font-semibold sm:col-span-2">
              {message}
            </p>
          )}
          <Input
            isRequired
            label="اسم المكان"
            value={form.title}
            onValueChange={(title) => setForm({ ...form, title })}
          />
          <Select
            isRequired
            label="التصنيف"
            selectedKeys={[String(form.category)]}
            onSelectionChange={(keys) =>
              setForm({ ...form, category: String(Array.from(keys)[0] ?? form.category) })
            }
          >
            {CATEGORY_OPTIONS.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.label}
              </SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            type="tel"
            label="رقم الهاتف"
            value={form.phone}
            onValueChange={(phone) => setForm({ ...form, phone })}
          />
          <Input
            type="tel"
            label="رقم واتساب"
            value={form.whatsapp}
            onValueChange={(whatsapp) => setForm({ ...form, whatsapp })}
          />
          <Input
            label="رقم إنستاباي / فودافون كاش"
            value={form.instapayVfcash}
            onValueChange={(instapayVfcash) => setForm({ ...form, instapayVfcash })}
          />
          <Textarea
            label="وصف المكان"
            className="sm:col-span-2"
            minRows={3}
            value={form.description}
            onValueChange={(description) => setForm({ ...form, description })}
          />
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            label="رابط جروب أو قناة WhatsApp"
            placeholder="https://chat.whatsapp.com/…"
            value={form.whatsappGroupUrl}
            onValueChange={(whatsappGroupUrl) => setForm({ ...form, whatsappGroupUrl })}
          />
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            label="رابط Telegram"
            placeholder="https://t.me/…"
            value={form.telegramUrl}
            onValueChange={(telegramUrl) => setForm({ ...form, telegramUrl })}
          />
          <Textarea
            autoComplete="street-address"
            label="العنوان"
            value={form.address}
            onValueChange={(address) => setForm({ ...form, address })}
          />
          <Input
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
              <span className="text-sm font-bold">صور المكان والمنيو</span>
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
            isLoading={pending}
            className="bg-zinc-900 font-bold text-white sm:col-span-2"
          >
            إرسال التعديلات للمراجعة
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
