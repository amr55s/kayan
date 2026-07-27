'use client';

import { FormEvent, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
} from '@heroui/react';
import { Save, Trash2, UserCog } from 'lucide-react';
import { deleteManagedUser, updateManagedUser } from '@/lib/operations/actions';

type ManagedProfile = {
  id: string;
  display_name: string;
  phone: string;
  role: 'admin' | 'merchant' | 'driver';
  is_active: boolean;
  merchant_id: string | null;
};

type Merchant = {
  id: string;
  display_name: string;
};

export function UserEditorModal({
  profile,
  merchants,
  isOpen,
  onOpenChange,
  onSuccess,
}: {
  profile: ManagedProfile;
  merchants: Merchant[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}) {
  const [form, setForm] = useState({
    displayName: profile.display_name,
    phone: profile.phone,
    role: profile.role,
    merchantId: profile.merchant_id || '',
    isActive: profile.is_active,
    newPassword: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const result = await updateManagedUser({
      id: profile.id,
      ...form,
      merchantId: form.role === 'merchant' ? form.merchantId || null : null,
    });
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    onOpenChange(false);
    onSuccess('تم حفظ بيانات الحساب وصلاحياته.');
  }

  async function remove() {
    if (!window.confirm(`حذف حساب "${profile.display_name}" نهائياً؟`)) return;
    setPending(true);
    setError('');
    const result = await deleteManagedUser(profile.id);
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    onOpenChange(false);
    onSuccess('تم حذف الحساب.');
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="xl"
      placement="center"
      scrollBehavior="inside"
      classNames={{ base: 'dir-rtl' }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <UserCog className="size-5" />
              إدارة حساب {profile.display_name}
            </ModalHeader>
            <ModalBody>
              <form id="managed-user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2"
                  >
                    {error}
                  </p>
                )}
                <Input
                  isRequired
                  label="الاسم"
                  value={form.displayName}
                  onValueChange={(displayName) => setForm({ ...form, displayName })}
                />
                <Input
                  isRequired
                  type="tel"
                  label="رقم الهاتف"
                  value={form.phone}
                  onValueChange={(phone) => setForm({ ...form, phone })}
                />
                <Select
                  label="الصلاحية"
                  selectedKeys={[form.role]}
                  onSelectionChange={(keys) =>
                    setForm({
                      ...form,
                      role: String(Array.from(keys)[0] ?? form.role) as ManagedProfile['role'],
                    })
                  }
                >
                  <SelectItem key="admin">أدمن</SelectItem>
                  <SelectItem key="merchant">محل / مطعم</SelectItem>
                  <SelectItem key="driver">كابتن</SelectItem>
                </Select>
                {form.role === 'merchant' && (
                  <Select
                    isRequired
                    label="المحل المرتبط"
                    selectedKeys={form.merchantId ? [form.merchantId] : []}
                    onSelectionChange={(keys) =>
                      setForm({
                        ...form,
                        merchantId: String(Array.from(keys)[0] ?? ''),
                      })
                    }
                  >
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id}>{merchant.display_name}</SelectItem>
                    ))}
                  </Select>
                )}
                <Input
                  type="password"
                  label="كلمة مرور مؤقتة جديدة (اختياري)"
                  name="managed-user-new-password"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onValueChange={(newPassword) => setForm({ ...form, newPassword })}
                  className="sm:col-span-2"
                />
                <p className="-mt-2 text-xs text-zinc-500 sm:col-span-2">
                  12 حرفاً على الأقل، وسيُطلب من المستخدم تغييرها بعد الدخول.
                </p>
                <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 sm:col-span-2">
                  <div>
                    <p className="font-bold">الحساب مفعّل</p>
                    <p className="text-xs text-zinc-500">الحساب المعطّل لا يستطيع استخدام لوحة التشغيل.</p>
                  </div>
                  <Switch
                    isSelected={form.isActive}
                    onValueChange={(isActive) => setForm({ ...form, isActive })}
                  />
                </div>
              </form>
            </ModalBody>
            <ModalFooter className="flex justify-between">
              <Button
                color="danger"
                variant="flat"
                isLoading={pending}
                onPress={remove}
                startContent={!pending && <Trash2 className="size-4" />}
              >
                حذف الحساب
              </Button>
              <div className="flex gap-2">
                <Button variant="flat" onPress={onClose}>إلغاء</Button>
                <Button
                  type="submit"
                  form="managed-user-form"
                  isLoading={pending}
                  startContent={!pending && <Save className="size-4" />}
                  className="bg-zinc-900 font-bold text-white"
                >
                  حفظ
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
