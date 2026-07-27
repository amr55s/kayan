'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';

interface DriverPinSuccessModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pinCode: string;
  driverPhone: string;
}

export const DriverPinSuccessModal: React.FC<DriverPinSuccessModalProps> = ({
  isOpen,
  onOpenChange,
  pinCode,
  driverPhone,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPin = async () => {
    try {
      await navigator.clipboard.writeText(pinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy PIN:', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      placement="center"
      backdrop="blur"
      classNames={{
        base: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 dir-rtl font-sans",
        header: "border-b border-zinc-100 dark:border-zinc-800 pb-3",
        footer: "border-t border-zinc-100 dark:border-zinc-800 pt-3",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span>تم التسجيل</span>
                <span className="text-xs text-zinc-500 font-normal">احفظ الكود لتجديد ظهورك في خدمات الكيان</span>
              </div>
            </ModalHeader>

            <ModalBody className="py-6 space-y-4 text-center">
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
                تم تفعيل الهاتف <strong className="dir-ltr inline-block font-mono text-zinc-900 dark:text-white">{driverPhone}</strong> لمدة ساعتين.
              </p>

              {/* Prominent PIN Display */}
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 flex flex-col items-center justify-center gap-2">
                <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  كود التفعيل
                </span>
                <div className="text-4xl font-black font-mono tracking-widest text-zinc-900 dark:text-white dir-ltr">
                  {pinCode}
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  onClick={handleCopyPin}
                  startContent={copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  className="font-bold text-xs bg-white dark:bg-zinc-800 shadow-sm mt-1 px-4 h-9"
                >
                  {copied ? 'تم نسخ الكود!' : 'نسخ الكود'}
                </Button>
              </div>

              {/* Warning Alert */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300 text-right">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  احتفظ بهذا الكود؛ ستحتاجه لتجديد ظهورك في قائمة الكباتن.
                </span>
              </div>
            </ModalBody>

            <ModalFooter>
              <Button
                onClick={() => onClose()}
                className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 w-full h-11 shadow-sm rounded-xl"
              >
                إغلاق
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
