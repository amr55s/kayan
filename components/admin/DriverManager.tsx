'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Switch,
  Tooltip,
} from '@heroui/react';
import {
  Bike,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Pencil,
  Phone,
  Save,
  Search,
  Trash2,
  UserRoundCheck,
  X,
} from 'lucide-react';
import {
  serverDeleteDriver,
  serverToggleDriverStatus,
  serverUpdateDriver,
} from '@/lib/supabase/admin-actions';

type ManagedDriver = {
  id: string;
  name: string | null;
  phone: string;
  whatsapp?: string | null;
  vehicle_type?: string | null;
  is_active: boolean;
  is_available: boolean;
  active_until?: string | null;
  created_at: string;
  source: 'public' | 'account';
};

interface DriverManagerProps {
  drivers: ManagedDriver[];
  onRefresh: () => void;
}

export function DriverManager({ drivers, onRefresh }: DriverManagerProps) {
  const [pendingId, setPendingId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editing, setEditing] = useState<ManagedDriver | null>(null);
  const [search, setSearch] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    vehicleType: '',
  });

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    if (!query) return drivers;
    return drivers.filter((driver) =>
      [
        driver.name,
        driver.phone,
        driver.whatsapp,
        driver.vehicle_type,
        driver.source === 'account' ? 'حساب' : 'بطاقة قديمة',
      ].some((value) => value?.toLocaleLowerCase('ar').includes(query)),
    );
  }, [drivers, search]);

  const accountDrivers = drivers.filter((driver) => driver.source === 'account').length;
  const activeDrivers = drivers.filter((driver) => driver.is_active).length;
  const availableDrivers = drivers.filter((driver) => driver.is_available).length;
  const incompleteDrivers = drivers.filter(
    (driver) => !driver.phone || !driver.whatsapp || !driver.vehicle_type,
  ).length;

  async function handleToggle(driver: ManagedDriver) {
    setPendingId(driver.id);
    setErrorMsg('');
    const result = await serverToggleDriverStatus(
      driver.id,
      driver.is_active,
      driver.source,
    );
    setPendingId('');
    if (!result.success) {
      setErrorMsg(result.message || 'تعذر تحديث حالة الكابتن.');
      return;
    }
    onRefresh();
  }

  function beginEdit(driver: ManagedDriver) {
    setEditing(driver);
    setEditForm({
      name: driver.name || 'كابتن توصيل',
      phone: driver.phone,
      whatsapp: driver.whatsapp || driver.phone,
      vehicleType: driver.vehicle_type || '',
    });
    setErrorMsg('');
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setPendingId(editing.id);
    setErrorMsg('');
    const result = await serverUpdateDriver(editing.id, editForm, editing.source);
    setPendingId('');
    if (!result.success) {
      setErrorMsg(result.message || 'تعذر تحديث بيانات الكابتن.');
      return;
    }
    setEditing(null);
    onRefresh();
  }

  async function handleDelete(driver: ManagedDriver) {
    if (driver.source === 'account') return;
    if (!window.confirm('هل تريد حذف بطاقة الكابتن القديمة نهائيًا؟')) return;
    setPendingId(driver.id);
    setErrorMsg('');
    const result = await serverDeleteDriver(driver.id);
    setPendingId('');
    if (!result.success) {
      setErrorMsg(result.message || 'تعذر حذف بطاقة الكابتن.');
      return;
    }
    onRefresh();
  }

  return (
    <div className="dir-rtl min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <AdminDriverMetric label="كل الكباتن" value={drivers.length} icon={<Bike className="size-4" />} />
        <AdminDriverMetric label="حسابات كاملة" value={accountDrivers} icon={<UserRoundCheck className="size-4" />} />
        <AdminDriverMetric label="متاحون الآن" value={availableDrivers} icon={<CheckCircle2 className="size-4" />} />
        <AdminDriverMetric label="بيانات ناقصة" value={incompleteDrivers} icon={<Clock3 className="size-4" />} />
      </div>

      <Card className="rounded-3xl border border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-col items-stretch gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-black text-zinc-950">
              <Bike className="size-5" aria-hidden="true" />
              إدارة كباتن التوصيل
            </h3>
            <p className="mt-1 text-xs leading-6 text-zinc-500">
              عدّل رقم الاتصال وواتساب والمركبة، وفعّل أو أوقف ظهور الحساب من مكان واحد.
            </p>
          </div>
          <Chip variant="flat" className="w-fit font-bold text-zinc-700">
            {activeDrivers} حساب نشط
          </Chip>
        </CardHeader>
        <CardBody className="gap-4 p-4 sm:p-5">
          <Input
            isClearable
            name="driverSearch"
            autoComplete="off"
            label="بحث في الكباتن"
            placeholder="الاسم أو الرقم أو المركبة…"
            value={search}
            onValueChange={setSearch}
            startContent={<Search className="size-4 text-zinc-400" aria-hidden="true" />}
          />

          {errorMsg && (
            <p
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
            >
              {errorMsg}
            </p>
          )}

          {editing && (
            <form
              onSubmit={handleEdit}
              className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2 sm:p-4"
            >
              <div className="sm:col-span-2">
                <p className="flex items-center gap-2 font-black">
                  <Pencil className="size-4" aria-hidden="true" />
                  تعديل {editing.name || 'الكابتن'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {editing.source === 'account'
                    ? 'حساب كابتن مسجل — لا يتغير رقم تسجيل الدخول.'
                    : 'بطاقة كابتن قديمة.'}
                </p>
              </div>
              <Input
                isRequired
                name="driverName"
                autoComplete="name"
                label="اسم الكابتن"
                value={editForm.name}
                onValueChange={(name) => setEditForm({ ...editForm, name })}
              />
              <Input
                isRequired
                name="driverContactPhone"
                autoComplete="tel"
                type="tel"
                inputMode="tel"
                label="رقم الاتصال العام"
                value={editForm.phone}
                onValueChange={(phone) => setEditForm({ ...editForm, phone })}
              />
              <Input
                isRequired
                name="driverWhatsapp"
                autoComplete="tel"
                type="tel"
                inputMode="tel"
                label="رقم واتساب"
                value={editForm.whatsapp}
                onValueChange={(whatsapp) => setEditForm({ ...editForm, whatsapp })}
              />
              <p className="-mt-2 text-xs leading-5 text-zinc-500 sm:col-span-2">
                هذان الرقمان يشغّلان زري «اتصال» و«واتساب» في البطاقة العامة ولا يغيّران رقم تسجيل الدخول.
              </p>
              <Input
                name="driverVehicle"
                autoComplete="off"
                label="نوع المركبة"
                placeholder="موتوسيكل، دراجة، سيارة"
                value={editForm.vehicleType}
                onValueChange={(vehicleType) => setEditForm({ ...editForm, vehicleType })}
              />
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:flex">
                <Button
                  type="submit"
                  isLoading={pendingId === editing.id}
                  startContent={pendingId !== editing.id && <Save className="size-4" aria-hidden="true" />}
                  className="min-h-11 bg-zinc-950 font-bold text-white"
                >
                  حفظ البيانات
                </Button>
                <Button
                  type="button"
                  variant="flat"
                  isDisabled={pendingId === editing.id}
                  onPress={() => setEditing(null)}
                  startContent={<X className="size-4" aria-hidden="true" />}
                  className="min-h-11"
                >
                  إلغاء
                </Button>
              </div>
            </form>
          )}

          {filteredDrivers.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredDrivers.map((driver) => (
                <article
                  key={`${driver.source}:${driver.id}`}
                  className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h4 className="max-w-full truncate text-sm font-extrabold text-zinc-950">
                          {driver.name || 'كابتن توصيل'}
                        </h4>
                        <Chip
                          size="sm"
                          className={
                            driver.source === 'account'
                              ? 'bg-sky-50 text-[10px] text-sky-800'
                              : 'bg-zinc-100 text-[10px] text-zinc-600'
                          }
                        >
                          {driver.source === 'account' ? 'حساب' : 'بطاقة قديمة'}
                        </Chip>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <Bike className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{driver.vehicle_type || 'المركبة غير محددة'}</span>
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      aria-label={`${driver.is_active ? 'تعطيل' : 'تفعيل'} ${driver.name || 'الكابتن'}`}
                      isSelected={driver.is_active}
                      disabled={Boolean(pendingId)}
                      onValueChange={() => handleToggle(driver)}
                    />
                  </div>

                  <dl className="mt-3 grid gap-1.5 rounded-xl bg-zinc-50 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1 text-zinc-500">
                        <Phone className="size-3.5" aria-hidden="true" />
                        اتصال
                      </dt>
                      <dd><bdi dir="ltr" className="font-mono">{driver.phone || 'غير محدد'}</bdi></dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1 text-zinc-500">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        واتساب
                      </dt>
                      <dd><bdi dir="ltr" className="font-mono">{driver.whatsapp || 'غير محدد'}</bdi></dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Chip
                      size="sm"
                      className={
                        driver.is_available
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-zinc-100 text-zinc-600'
                      }
                    >
                      {driver.is_available ? 'متاح الآن' : driver.is_active ? 'غير متواجد' : 'موقوف'}
                    </Chip>
                    <div className="flex gap-1">
                      <Tooltip content="تعديل البيانات">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          aria-label={`تعديل بيانات ${driver.name || 'الكابتن'}`}
                          onPress={() => beginEdit(driver)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                      </Tooltip>
                      {driver.source === 'public' && (
                        <Tooltip content="حذف البطاقة القديمة" color="danger">
                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="light"
                            aria-label={`حذف ${driver.name || 'الكابتن'}`}
                            isDisabled={Boolean(pendingId)}
                            onPress={() => handleDelete(driver)}
                            className="text-rose-600"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <Bike className="mx-auto size-8 text-zinc-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-zinc-600">
                {drivers.length ? 'لا توجد نتائج مطابقة.' : 'لا يوجد كباتن مسجلون حاليًا.'}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AdminDriverMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-zinc-200 shadow-none">
      <CardBody className="flex-row items-center gap-2 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold text-zinc-500 sm:text-xs">{label}</p>
          <p className="text-lg font-black tabular-nums">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}
