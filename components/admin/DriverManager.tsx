'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Switch,
  Chip,
  Tooltip,
} from '@heroui/react';
import { Bike, UserPlus, Trash2, Plus, Phone, Pencil, Save, X } from 'lucide-react';
import {
  serverAddDriver,
  serverToggleDriverStatus,
  serverDeleteDriver,
  serverUpdateDriver,
} from '@/lib/supabase/admin-actions';
import { isValidEgyptianPhone } from '@/lib/utils';

type ManagedDriver = {
  id: string;
  name: string | null;
  phone: string;
  whatsapp?: string | null;
  vehicle_type?: string | null;
  is_active: boolean;
};

interface DriverManagerProps {
  drivers: ManagedDriver[];
  onRefresh: () => void;
}

export const DriverManager: React.FC<DriverManagerProps> = ({ drivers, onRefresh }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editing, setEditing] = useState<ManagedDriver | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    vehicleType: '',
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    if (!isValidEgyptianPhone(phone.trim())) {
      setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);
    const res = await serverAddDriver(name.trim() || 'كابتن توصيل', phone.trim());
    setIsSubmitting(false);

    if (res.success) {
      setName('');
      setPhone('');
      if (res.pinCode) {
        alert(`تمت إضافة الكابتن بنجاح!\nكود التفعيل الخاص به هو: ${res.pinCode}`);
      }
      onRefresh();
    } else {
      setErrorMsg(res.message || 'حدث خطأ أثناء إضافة الكابتن.');
    }
  };

  const handleToggle = async (driver: ManagedDriver) => {
    const res = await serverToggleDriverStatus(driver.id, driver.is_active);
    if (res.success) onRefresh();
  };

  const beginEdit = (driver: ManagedDriver) => {
    setEditing(driver);
    setEditForm({
      name: driver.name || 'كابتن توصيل',
      phone: driver.phone,
      whatsapp: driver.whatsapp || driver.phone,
      vehicleType: driver.vehicle_type || '',
    });
    setErrorMsg('');
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setIsSubmitting(true);
    const result = await serverUpdateDriver(editing.id, editForm);
    setIsSubmitting(false);
    if (!result.success) {
      setErrorMsg(result.message || 'تعذر تحديث بيانات الكابتن.');
      return;
    }
    setEditing(null);
    onRefresh();
  };

  const handleDelete = async (driverId: string) => {
    if (!confirm('هل أنت تأكد من حذف هذا المندوب؟')) return;
    const res = await serverDeleteDriver(driverId);
    if (res.success) onRefresh();
  };

  return (
    <div className="space-y-6 dir-rtl">
      {/* Form Card: Add Driver */}
      <Card shadow="sm" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <CardHeader className="font-extrabold text-base flex items-center gap-2 text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <UserPlus className="w-5 h-5 text-zinc-900 dark:text-white" />
          <span>إضافة كابتن / مندوب توصيل جديد (دليفري)</span>
        </CardHeader>
        <CardBody className="py-4 space-y-3">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
              {errorMsg}
            </div>
          )}
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 items-end">
            <Input
              labelPlacement="outside"
              label="اسم الكابتن"
              value={name}
              onValueChange={setName}
              size="md"
              variant="bordered"
              className="flex-1"
              classNames={{
                label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
              }}
            />
            <Input
              isRequired
              labelPlacement="outside"
              label="رقم الهاتف"
              value={phone}
              onValueChange={setPhone}
              size="md"
              variant="bordered"
              type="tel"
              className="flex-1"
              classNames={{
                label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
              }}
            />
            <Button
              type="submit"
              isLoading={isSubmitting}
              startContent={!isSubmitting && <Plus className="w-4 h-4 stroke-[3]" />}
              className="font-bold text-xs text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 h-12 sm:w-44 shadow-sm rounded-xl"
            >
              إضافة الكابتن
            </Button>
          </form>
        </CardBody>
      </Card>

      {editing && (
        <Card className="border border-zinc-300 bg-zinc-50">
          <CardHeader className="flex items-center gap-2 font-black">
            <Pencil className="size-5" />
            تعديل بيانات {editing.name || 'الكابتن'}
          </CardHeader>
          <CardBody>
            <form onSubmit={handleEdit} className="grid gap-3 sm:grid-cols-2">
              <Input
                isRequired
                label="الاسم"
                value={editForm.name}
                onValueChange={(name) => setEditForm({ ...editForm, name })}
              />
              <Input
                isRequired
                type="tel"
                label="الهاتف"
                value={editForm.phone}
                onValueChange={(phone) => setEditForm({ ...editForm, phone })}
              />
              <Input
                type="tel"
                label="واتساب"
                value={editForm.whatsapp}
                onValueChange={(whatsapp) => setEditForm({ ...editForm, whatsapp })}
              />
              <Input
                label="نوع المركبة"
                value={editForm.vehicleType}
                onValueChange={(vehicleType) => setEditForm({ ...editForm, vehicleType })}
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Save className="size-4" />}
                  className="bg-zinc-900 font-bold text-white"
                >
                  حفظ بيانات الكابتن
                </Button>
                <Button
                  type="button"
                  variant="flat"
                  onPress={() => setEditing(null)}
                  startContent={<X className="size-4" />}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Drivers Grid / List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Bike className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>قائمة كباتن التوصيل المسجلين</span>
          </h3>
          <Chip size="sm" variant="flat" className="font-extrabold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            إجمالي {drivers.length} كابتن
          </Chip>
        </div>

        {drivers.length === 0 ? (
          <Card shadow="sm" className="bg-white dark:bg-zinc-900 p-8 text-center border border-zinc-200 dark:border-zinc-800">
            <CardBody className="flex flex-col items-center gap-2 text-zinc-500">
              <Bike className="w-8 h-8 opacity-40 text-zinc-400" />
              <p className="font-medium text-sm">لا يوجد أفراد توصيل مسجلين حالياً.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {drivers.map((driver) => (
              <Card key={driver.id} shadow="sm" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <CardBody className="p-4 flex flex-row items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">
                      {driver.name || 'كابتن توصيل'}
                    </h4>
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono dir-ltr">
                      <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{driver.phone}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Tooltip content="تعديل البيانات">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        aria-label={`تعديل بيانات ${driver.name || 'الكابتن'}`}
                        onPress={() => beginEdit(driver)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </Tooltip>
                    <Switch
                      size="sm"
                      color="primary"
                      aria-label={`${driver.is_active ? 'تعطيل' : 'تفعيل'} ${driver.name || 'الكابتن'}`}
                      isSelected={driver.is_active}
                      onValueChange={() => handleToggle(driver)}
                    />
                    <Tooltip content="حذف المندوب" color="danger">
                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="light"
                        aria-label={`حذف ${driver.name || 'الكابتن'}`}
                        onClick={() => handleDelete(driver.id)}
                        className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
