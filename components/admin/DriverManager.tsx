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
import { Bike, Trash2, Phone, Pencil, Save, X } from 'lucide-react';
import {
  serverToggleDriverStatus,
  serverDeleteDriver,
  serverUpdateDriver,
} from '@/lib/supabase/admin-actions';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editing, setEditing] = useState<ManagedDriver | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    vehicleType: '',
  });

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
      <Card shadow="sm" className="border border-zinc-200 bg-zinc-50">
        <CardBody className="text-sm leading-7 text-zinc-600">
          إضافة حسابات الكباتن الجديدة تتم من تبويب «طلبات الحسابات». هذه القائمة
          مخصصة لإدارة البطاقات القديمة وتعديلها أو حذفها.
        </CardBody>
      </Card>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {errorMsg}
        </div>
      )}

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
