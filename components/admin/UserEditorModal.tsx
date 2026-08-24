'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { useOverlayState } from '@heroui/react';
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
  const modalState = useOverlayState({ isOpen, onOpenChange });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await updateManagedUser({
        id: profile.id,
        ...form,
        merchantId: form.role === 'merchant' ? form.merchantId || null : null,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      onSuccess('تم حفظ بيانات الحساب وصلاحياته.');
    } catch (caught) {
      console.error('Managed user update transport failed:', caught);
      setError('انقطع الاتصال بعد الحفظ. جاري تحديث الحسابات للتأكد من النتيجة.');
      onSuccess('جاري مزامنة بيانات الحساب بعد انقطاع الاتصال.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`حذف حساب "${profile.display_name}" نهائياً؟`)) return;
    setPending(true);
    setError('');
    try {
      const result = await deleteManagedUser(profile.id);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      onSuccess('تم حذف الحساب.');
    } catch (caught) {
      console.error('Managed user delete transport failed:', caught);
      setError('انقطع الاتصال بعد طلب الحذف. جاري تحديث الحسابات للتأكد من النتيجة.');
      onSuccess('جاري مزامنة قائمة الحسابات بعد انقطاع الاتصال.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal state={modalState}>
      <Modal.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
        <Modal.Container placement="center" size="lg" scroll="inside" className="p-3">
          <Modal.Dialog aria-label={`إدارة حساب ${profile.display_name}`} dir="rtl" className="border border-zinc-200 bg-white">
            <Modal.Header className="flex items-center gap-2">
              <UserCog className="size-5" />
              <Modal.Heading>إدارة حساب {profile.display_name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <form id="managed-user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2"
                  >
                    {error}
                  </p>
                )}
                <TextField fullWidth isRequired className="space-y-1.5"><Label className="text-sm font-bold">الاسم</Label><Input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" /></TextField>
                <TextField fullWidth isRequired className="space-y-1.5"><Label className="text-sm font-bold">رقم الهاتف</Label><Input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" /></TextField>
                <Select
                  selectedKey={form.role}
                  onSelectionChange={(key) =>
                    setForm({
                      ...form,
                      role: String(key ?? form.role) as ManagedProfile['role'],
                    })
                  }
                >
                  <Label className="text-sm font-bold">الصلاحية</Label>
                  <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5"><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox><ListBox.Item id="admin" textValue="أدمن" className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100">أدمن</ListBox.Item><ListBox.Item id="merchant" textValue="محل / مطعم" className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100">محل / مطعم</ListBox.Item><ListBox.Item id="driver" textValue="كابتن" className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100">كابتن</ListBox.Item></ListBox></Select.Popover>
                </Select>
                {form.role === 'merchant' && (
                  <Select
                    isRequired
                    selectedKey={form.merchantId || null}
                    onSelectionChange={(key) =>
                      setForm({
                        ...form,
                        merchantId: String(key ?? ''),
                      })
                    }
                  >
                    <Label className="text-sm font-bold">المحل المرتبط</Label>
                    <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5"><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox>{merchants.map((merchant) => <ListBox.Item key={merchant.id} id={merchant.id} textValue={merchant.display_name} className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100">{merchant.display_name}</ListBox.Item>)}</ListBox></Select.Popover>
                  </Select>
                )}
                <TextField fullWidth className="space-y-1.5 sm:col-span-2"><Label className="text-sm font-bold">كلمة مرور مؤقتة جديدة (اختياري)</Label><Input type="password" name="managed-user-new-password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" /></TextField>
                <p className="-mt-2 text-xs text-zinc-500 sm:col-span-2">
                  12 حرفاً على الأقل، وسيُطلب من المستخدم تغييرها بعد الدخول.
                </p>
                <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 sm:col-span-2">
                  <div>
                    <p className="font-bold">الحساب مفعّل</p>
                    <p className="text-xs text-zinc-500">الحساب المعطّل لا يستطيع استخدام لوحة التشغيل.</p>
                  </div>
                  <Switch isSelected={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} aria-label="الحساب مفعّل"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </div>
              </form>
            </Modal.Body>
            <Modal.Footer className="flex justify-between">
              <Button
                variant="danger-soft"
                isPending={pending}
                onPress={remove}
              >
                {!pending && <Trash2 className="size-4" aria-hidden="true" />}
                حذف الحساب
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onPress={modalState.close}>إلغاء</Button>
                <Button
                  type="submit"
                  form="managed-user-form"
                  isPending={pending}
                  className="bg-zinc-900 font-bold text-white"
                >
                  {!pending && <Save className="size-4" aria-hidden="true" />}
                  حفظ
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
