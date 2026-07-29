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
} from '@heroui/react';
import { Bike, CheckCircle2, KeyRound, Send } from 'lucide-react';
import { submitAccountRequest } from '@/lib/operations/actions';
import { isValidEgyptianPhone } from '@/lib/utils';

interface DriverModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DriverModal({
  isOpen,
  onOpenChange,
  onSuccess,
}: DriverModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function resetForm() {
    setName('');
    setPhone('');
    setWhatsapp('');
    setVehicleType('');
    setPassword('');
    setConfirmPassword('');
    setIsSuccess(false);
    setErrorMsg('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMsg('');

    if (!isValidEgyptianPhone(phone)) {
      setErrorMsg('أدخل رقم هاتف مصري صحيحاً، مثال: 01012345678.');
      return;
    }
    if (whatsapp && !isValidEgyptianPhone(whatsapp)) {
      setErrorMsg('رقم واتساب غير صحيح.');
      return;
    }
    if (password.length < 12) {
      setErrorMsg('كلمة المرور يجب أن تتكون من 12 حرفاً على الأقل.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsSubmitting(true);
    const result = await submitAccountRequest({
      kind: 'driver',
      displayName: name,
      phone,
      whatsapp: whatsapp || phone,
      vehicleType,
      password,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMsg(result.message);
      return;
    }
    setIsSuccess(true);
    onSuccess?.();
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
      size="md"
      placement="center"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: 'dir-rtl max-h-[90vh] max-w-[95vw] border border-zinc-200 bg-white font-sans sm:max-w-lg',
        header: 'shrink-0 border-b border-zinc-100 pb-3',
        body: 'overscroll-contain py-4',
        footer: 'sticky bottom-0 z-10 shrink-0 border-t border-zinc-100 bg-white pt-3',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
                <Bike className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-zinc-950">طلب حساب كابتن</h2>
                <p className="mt-0.5 text-xs font-normal text-zinc-500">
                  التسجيل بحساب وكلمة مرور بعد مراجعة الإدارة.
                </p>
              </div>
            </ModalHeader>

            <ModalBody>
              {isSuccess ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="size-14 text-emerald-600" />
                  <h3 className="text-xl font-black">تم إرسال الطلب</h3>
                  <p className="max-w-sm text-sm leading-7 text-zinc-600">
                    بعد موافقة الإدارة ستدخل برقم الهاتف وكلمة المرور التي اخترتها.
                    لو رقمك مرتبط ببطاقة كابتن قديمة سيتم ربط الحساب بها تلقائياً.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button as="a" href="/share" variant="flat" className="font-bold">
                      ساعدنا في نشر كيان
                    </Button>
                    <Button onPress={onClose} className="bg-zinc-950 font-bold text-white">
                      تم
                    </Button>
                  </div>
                </div>
              ) : (
                <form id="driver-account-form" onSubmit={handleSubmit} className="space-y-4">
                  {errorMsg && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                      {errorMsg}
                    </p>
                  )}
                  <Input
                    isRequired
                    name="displayName"
                    autoComplete="name"
                    label="اسم الكابتن"
                    value={name}
                    onValueChange={setName}
                  />
                  <Input
                    isRequired
                    name="phone"
                    autoComplete="tel"
                    type="tel"
                    inputMode="tel"
                    label="رقم الهاتف"
                    placeholder="01012345678"
                    value={phone}
                    onValueChange={setPhone}
                  />
                  <Input
                    name="whatsapp"
                    autoComplete="tel"
                    type="tel"
                    inputMode="tel"
                    label="رقم واتساب"
                    value={whatsapp}
                    onValueChange={setWhatsapp}
                  />
                  <Input
                    name="vehicleType"
                    autoComplete="off"
                    label="نوع المركبة"
                    placeholder="موتوسيكل، دراجة، سيارة"
                    value={vehicleType}
                    onValueChange={setVehicleType}
                  />
                  <Input
                    isRequired
                    name="new-password"
                    autoComplete="new-password"
                    type="password"
                    label="كلمة المرور"
                    value={password}
                    onValueChange={setPassword}
                    startContent={<KeyRound className="size-4 text-zinc-400" />}
                  />
                  <Input
                    isRequired
                    name="confirm-password"
                    autoComplete="new-password"
                    type="password"
                    label="تأكيد كلمة المرور"
                    value={confirmPassword}
                    onValueChange={setConfirmPassword}
                  />
                </form>
              )}
            </ModalBody>

            {!isSuccess && (
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={isSubmitting}>
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="driver-account-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Send className="size-4" />}
                  className="bg-zinc-950 font-bold text-white"
                >
                  إرسال طلب الحساب
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
