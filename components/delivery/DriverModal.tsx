'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Tabs,
  Tab,
} from '@heroui/react';
import { Bike, Send, Clock, RefreshCw, UserPlus, KeyRound } from 'lucide-react';
import { registerDriver, renewDriverWithPin } from '@/lib/supabase/actions';
import { isValidEgyptianPhone } from '@/lib/utils';
import { DriverPinSuccessModal } from './DriverPinSuccessModal';

interface DriverModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const DriverModal: React.FC<DriverModalProps> = ({
  isOpen,
  onOpenChange,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'renew'>('register');

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pinCode, setPinCode] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pin Success Modal state
  const [createdPin, setCreatedPin] = useState('');
  const [registeredPhone, setRegisteredPhone] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  const resetForm = () => {
    setName('');
    setPhone('');
    setWhatsapp('');
    setVehicleType('');
    setPinCode('');
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'register') {
      if (!phone.trim()) {
        setErrorMsg('يرجى إدخال رقم الهاتف الجوال.');
        return;
      }

      if (!isValidEgyptianPhone(phone.trim())) {
        setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
        return;
      }
    } else {
      if (!isValidEgyptianPhone(phone.trim()) || !/^\d{5}$/.test(pinCode.trim())) {
        setErrorMsg('أدخل رقم الهاتف المصري وكود التفعيل المكون من 5 أرقام.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      if (activeTab === 'register') {
        const res = await registerDriver(name, phone, whatsapp || phone, vehicleType);

        if (!res.success) {
          setErrorMsg(res.message || 'حدث خطأ أثناء عملية التسجيل، يرجى المحاولة لاحقاً.');
          return;
        }

        if (!res.pinCode) {
          setErrorMsg('تم التسجيل لكن تعذر عرض كود التفعيل. تواصل مع الإدارة.');
          return;
        }
        setCreatedPin(res.pinCode);
        setRegisteredPhone(phone.trim());
        setShowPinModal(true);

        onOpenChange(false);
        resetForm();
        if (onSuccess) onSuccess();
      } else {
        const res = await renewDriverWithPin(pinCode, phone);

        if (!res.success) {
          setErrorMsg(res.message || 'كود التفعيل غير صحيح! تأكد من الأرقام الـ 5.');
          return;
        }

        alert(res.message || 'تم تجديد تواجدك لمدة ساعتين.');
        onOpenChange(false);
        resetForm();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      console.error('Driver registration exception:', err);
      setErrorMsg('حدث خطأ أثناء الاتصال بالخادم، يرجى إعادة المحاولة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          onOpenChange(open);
        }}
        size="md"
        placement="center"
        backdrop="blur"
        classNames={{
          base: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 dir-rtl font-sans max-w-[95vw] sm:max-w-lg my-auto max-h-[90vh]",
          header: "border-b border-zinc-100 dark:border-zinc-800 pb-3 shrink-0",
          body: "py-4 space-y-4 overflow-y-auto",
          footer: "border-t border-zinc-100 dark:border-zinc-800 pt-3 shrink-0 sticky bottom-0 bg-white dark:bg-zinc-900 z-10",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg">
                <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                  <Bike className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span>تسجيل كابتن توصيل</span>
                  <span className="text-xs text-zinc-500 font-normal">بطاقتك تظهر في خدمات الكيان لمدة ساعتين</span>
                </div>
              </ModalHeader>

              <ModalBody className="py-4 space-y-4">
                <div className="space-y-4">
                  <Tabs
                    selectedKey={activeTab}
                    onSelectionChange={(k) => setActiveTab(k as 'register' | 'renew')}
                    fullWidth
                    size="md"
                    color="primary"
                    variant="solid"
                    classNames={{
                      tabList: "bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl",
                      tab: "font-bold text-xs h-10",
                      cursor: "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900",
                    }}
                  >
                    <Tab
                      key="register"
                      title={
                        <div className="flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4" />
                          <span>تسجيل جديد</span>
                        </div>
                      }
                    />
                    <Tab
                      key="renew"
                      title={
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-4 h-4" />
                          <span>تجديد بالكود</span>
                        </div>
                      }
                    />
                  </Tabs>

                  <form id="driver-modal-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
                    {errorMsg && (
                      <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
                        {errorMsg}
                      </div>
                    )}

                    {activeTab === 'register' ? (
                      <>
                        <Input
                          isRequired
                          labelPlacement="outside"
                          label="الاسم"
                          value={name}
                          onValueChange={setName}
                          variant="bordered"
                          size="md"
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
                          variant="bordered"
                          type="tel"
                          size="md"
                          classNames={{
                            label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                            inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                          }}
                        />

                        <Input
                          labelPlacement="outside"
                          label="رقم الواتساب (اختياري)"
                          value={whatsapp}
                          onValueChange={setWhatsapp}
                          variant="bordered"
                          type="tel"
                          size="md"
                          classNames={{
                            label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                            inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                          }}
                        />

                        <Input
                          labelPlacement="outside"
                          label="نوع المركبة"
                          placeholder="موتوسيكل، دراجة، سيارة"
                          value={vehicleType}
                          onValueChange={setVehicleType}
                          variant="bordered"
                          size="md"
                          classNames={{
                            label: "font-bold text-xs text-zinc-700 mb-1",
                            inputWrapper: "h-12 border-zinc-300 bg-white",
                          }}
                        />
                      </>
                    ) : (
                      <div className="space-y-4 pt-1">
                        <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-200 flex items-start gap-2.5 text-xs text-zinc-700">
                          <Clock className="w-4 h-4 text-zinc-700 shrink-0 mt-0.5" />
                          <span>
                            أدخل الهاتف وكود التفعيل لتظهر لمدة ساعتين إضافيتين.
                          </span>
                        </div>

                        <Input
                          isRequired
                          labelPlacement="outside"
                          label="رقم الهاتف"
                          value={phone}
                          onValueChange={setPhone}
                          variant="bordered"
                          type="tel"
                          size="lg"
                          classNames={{
                            label: "font-bold text-xs text-zinc-700 mb-1",
                            inputWrapper: "h-12 border-zinc-300 bg-white",
                          }}
                        />

                        <Input
                          isRequired
                          labelPlacement="outside"
                          label="كود التفعيل"
                          value={pinCode}
                          onValueChange={setPinCode}
                          variant="bordered"
                          type="text"
                          maxLength={5}
                          startContent={<KeyRound className="w-4 h-4 text-zinc-500 shrink-0" />}
                          size="lg"
                          classNames={{
                            label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                            inputWrapper: "h-12 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono tracking-wider text-center text-lg font-bold",
                          }}
                        />
                      </div>
                    )}
                  </form>
                </div>
              </ModalBody>

              <ModalFooter className="flex flex-col gap-2 sm:flex-row">
                <Button variant="flat" color="default" onClick={onClose} disabled={isSubmitting} className="min-h-[44px] font-semibold">
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="driver-modal-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Send className="w-4 h-4" />}
                  className="min-h-[44px] rounded-xl bg-zinc-900 px-6 font-bold text-white shadow-sm hover:bg-zinc-800"
                >
                  {activeTab === 'register' ? 'تسجيل الكابتن' : 'تجديد التواجد'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Driver PIN Success Modal */}
      <DriverPinSuccessModal
        isOpen={showPinModal}
        onOpenChange={setShowPinModal}
        pinCode={createdPin}
        driverPhone={registeredPhone}
      />
    </>
  );
};
