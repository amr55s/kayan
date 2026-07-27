'use client';

import React, { useState, useRef } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Image as HeroImage,
} from '@heroui/react';
import { Store, Send, CheckCircle2, Upload, X } from 'lucide-react';
import { updateMerchantPlace } from '@/lib/supabase/actions';
import { isValidEgyptianPhone } from '@/lib/utils';

interface EditMerchantModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const EditMerchantModal: React.FC<EditMerchantModalProps> = ({
  isOpen,
  onOpenChange,
  onSuccess,
}) => {
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instapayVfcash, setInstapayVfcash] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setPhone('');
    setWhatsapp('');
    setInstapayVfcash('');
    setDescription('');
    setSelectedFiles([]);
    setFilePreviews([]);
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    const validImages = filesArray.filter((file) => file.type.startsWith('image/'));

    if (selectedFiles.length + validImages.length > 3) {
      setErrorMsg('يمكنك إضافة حتى 3 صور فقط.');
      return;
    }

    setErrorMsg('');
    const newFiles = [...selectedFiles, ...validImages].slice(0, 3);
    setSelectedFiles(newFiles);
    setFilePreviews(newFiles.map((file) => URL.createObjectURL(file)));
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== indexToRemove);
    const updatedPreviews = filePreviews.filter((_, idx) => idx !== indexToRemove);
    setSelectedFiles(updatedFiles);
    setFilePreviews(updatedPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      setErrorMsg('يرجى إدخال رقم الهاتف المسجل به المكان.');
      return;
    }

    if (!isValidEgyptianPhone(phone.trim())) {
      setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await updateMerchantPlace(
        phone.trim(),
        {
          whatsapp: whatsapp.trim() || undefined,
          instapay_vfcash: instapayVfcash.trim() || undefined,
          description: description.trim() || undefined,
        },
        selectedFiles
      );

      if (!res.success) {
        throw new Error(res.message);
      }

      setSuccessMsg(res.message || 'تم تحديث بيانات ومرفقات مكانك.');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Merchant update error:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء التحديث، يرجى التأكد من أن المكان مسجل بهذا الرقم.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
      size="lg"
      placement="center"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 dir-rtl",
        header: "border-b border-zinc-100 dark:border-zinc-800 pb-3",
        footer: "border-t border-zinc-100 dark:border-zinc-800 pt-3",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg">
              <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                <Store className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span>تحديث البيانات أو صور المنيو</span>
                <span className="text-xs text-zinc-500 font-normal">خدمة مميكنة لأصحاب المحلات والأماكن المسجلة</span>
              </div>
            </ModalHeader>

            <ModalBody className="py-4 space-y-4">
              {successMsg ? (
                <div className="py-6 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h4 className="font-extrabold text-lg text-zinc-900 dark:text-white">
                    تم التحديث
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xs leading-relaxed font-semibold">
                    {successMsg}
                  </p>
                  <Button
                    onClick={() => {
                      resetForm();
                      onClose();
                    }}
                    className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 mt-2 px-8 h-11 shadow-sm rounded-xl"
                  >
                    تم، إغلاق النافذة
                  </Button>
                </div>
              ) : (
                <form id="merchant-edit-form" onSubmit={handleSubmit} className="space-y-4">
                  {errorMsg && (
                    <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
                      {errorMsg}
                    </div>
                  )}

                  <Input
                    isRequired
                    labelPlacement="outside"
                    label="رقم الهاتف المسجل للمكان"
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
                    label="رقم الواتساب الجديد (اختياري)"
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

                  <div className="pt-2 mt-1">
                    <Input
                      labelPlacement="outside"
                      label="رقم InstaPay / فودافون كاش (اختياري)"
                      value={instapayVfcash}
                      onValueChange={setInstapayVfcash}
                      variant="bordered"
                      type="tel"
                      size="md"
                      classNames={{
                        label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1.5",
                        inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      }}
                    />
                  </div>

                  <Textarea
                    labelPlacement="outside"
                    label="تحديث الوصف أو مواعيد العمل"
                    value={description}
                    onValueChange={setDescription}
                    variant="bordered"
                    minRows={2}
                    classNames={{
                      label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                      inputWrapper: "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                    }}
                  />

                  {/* Add New Images Section */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                      <span>إضافة صور جديدة للمنيو أو المكان (3 صور بحد أقصى)</span>
                      <span className="text-zinc-400 font-normal text-[11px]">{selectedFiles.length} / 3 صور</span>
                    </label>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {selectedFiles.length < 3 && (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-800 dark:hover:border-zinc-200 rounded-2xl p-4 text-center cursor-pointer bg-zinc-50/50 dark:bg-zinc-800/40 transition-colors flex flex-col items-center justify-center gap-1.5"
                      >
                        <Upload className="w-6 h-6 text-zinc-800 dark:text-zinc-200" />
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          اضغط هنا لإضافة صور منيو أو للمكان
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          يدعم صور JPG, PNG, WEBP
                        </span>
                      </div>
                    )}

                    {filePreviews.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 pt-2">
                        {filePreviews.map((previewUrl, idx) => (
                          <div key={idx} className="relative w-full h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 group bg-zinc-100 dark:bg-zinc-800">
                            <HeroImage
                              src={previewUrl}
                              alt={`صورة ${idx + 1}`}
                              classNames={{
                                wrapper: "w-full h-full",
                                img: "w-full h-full object-cover",
                              }}
                              radius="none"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              aria-label="إزالة"
                              className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/80 text-white transition-colors hover:bg-rose-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </form>
              )}
            </ModalBody>

            {!successMsg && (
              <ModalFooter>
                <Button variant="flat" color="default" onClick={onClose} disabled={isSubmitting} className="h-11 font-semibold">
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="merchant-edit-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Send className="w-4 h-4" />}
                  className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-6 h-11 shadow-sm rounded-xl"
                >
                  تحديث بيانات المكان
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
