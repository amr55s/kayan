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
  Select,
  SelectItem,
  Progress,
  Image as HeroImage,
} from '@heroui/react';
import {
  PlusCircle,
  Send,
  CheckCircle2,
  Upload,
  X,
  Phone,
  CreditCard,
  Building,
  FileText,
} from 'lucide-react';
import { submitPendingListing } from '@/lib/supabase/actions';
import { CATEGORY_OPTIONS } from '@/lib/categories';
import { isValidEgyptianPhone } from '@/lib/utils';

interface AddListingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddListingModal: React.FC<AddListingModalProps> = ({ isOpen, onOpenChange }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('restaurants');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instapayVfcash, setInstapayVfcash] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    filePreviews.forEach((url) => URL.revokeObjectURL(url));

    setTitle('');
    setCategory('restaurants');
    setPhone('');
    setWhatsapp('');
    setInstapayVfcash('');
    setDescription('');
    setSelectedFiles([]);
    setFilePreviews([]);
    setIsSuccess(false);
    setErrorMsg('');
    setUploadProgress(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const filesArray = Array.from(e.target.files);
    const validImages = filesArray.filter((file) => file.type.startsWith('image/'));

    const oversized = validImages.find((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      setErrorMsg(`الصورة "${oversized.name}" تتجاوز الحد الأقصى (5 ميجابايت).`);
      return;
    }

    if (selectedFiles.length + validImages.length > 3) {
      setErrorMsg('يمكنك رفع حتى 3 صور فقط للمكان أو المنيو.');
      return;
    }

    setErrorMsg('');
    const newFiles = [...selectedFiles, ...validImages].slice(0, 3);
    setSelectedFiles(newFiles);

    const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
    setFilePreviews(newPreviews);
  };

  const handleRemoveImage = (indexToRemove: number) => {
    if (filePreviews[indexToRemove]) {
      URL.revokeObjectURL(filePreviews[indexToRemove]);
    }
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== indexToRemove);
    const updatedPreviews = filePreviews.filter((_, idx) => idx !== indexToRemove);
    setSelectedFiles(updatedFiles);
    setFilePreviews(updatedPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !phone.trim() || !category) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة (اسم المكان، التصنيف، ورقم الهاتف)');
      return;
    }

    if (!isValidEgyptianPhone(phone.trim())) {
      setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setUploadProgress(30);

    try {
      setUploadProgress(60);
      const res = await submitPendingListing(
        {
          title: title.trim(),
          category,
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || phone.trim(),
          instapay_vfcash: instapayVfcash.trim() || undefined,
          description: description.trim() || undefined,
        },
        selectedFiles
      );

      setUploadProgress(100);

      if (!res.success) {
        throw new Error(res.message);
      }

      setIsSuccess(true);
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة لاحقاً.');
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
      size="2xl"
      placement="center"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 dir-rtl font-sans max-w-[95vw] sm:max-w-2xl my-auto max-h-[90vh]",
        header: "border-b border-zinc-100 dark:border-zinc-800 pb-3 shrink-0",
        body: "py-4 space-y-5 overflow-y-auto",
        footer: "border-t border-zinc-100 dark:border-zinc-800 pt-3 shrink-0 sticky bottom-0 bg-white dark:bg-zinc-900 z-10",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg">
              <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span>تسجيل محل أو خدمة</span>
                <span className="text-xs text-zinc-500 font-normal">نشر مجاني للمحلات والأنشطة والخدمات المحلية</span>
              </div>
            </ModalHeader>

            <ModalBody className="py-4 space-y-5">
              {isSuccess ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="font-extrabold text-xl text-zinc-900 dark:text-white">
                    تم إرسال طلبك
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-sm leading-relaxed font-bold">
                    سيتم مراجعة ونشر مكانك في خدمات الكيان خلال يوم عمل واحد إن شاء الله.
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
                <form id="add-listing-form" onSubmit={handleSubmit} className="space-y-5">
                  {errorMsg && (
                    <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
                      {errorMsg}
                    </div>
                  )}

                  {isSubmitting && (
                    <Progress
                      size="sm"
                      value={uploadProgress}
                      color="primary"
                      className="w-full"
                      aria-label="جاري إرسال البيانات..."
                    />
                  )}

                  {/* Section 1: البيانات الأساسية */}
                  <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-zinc-900 dark:text-white pb-1 border-b border-zinc-200/60 dark:border-zinc-800">
                      <Building className="w-4 h-4" />
                      <span>القسم الأول: البيانات الأساسية والتواصل</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        isRequired
                        labelPlacement="outside"
                        label="اسم المكان / التجارة"
                        value={title}
                        onValueChange={setTitle}
                        variant="bordered"
                        size="md"
                        classNames={{
                          label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                          inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                        }}
                      />

                      <Select
                        isRequired
                        labelPlacement="outside"
                        label="تصنيف الخدمة"
                        selectedKeys={[category]}
                        onChange={(e) => setCategory(e.target.value)}
                        variant="bordered"
                        size="md"
                        classNames={{
                          label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                          trigger: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                        }}
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        isRequired
                        labelPlacement="outside"
                        label="رقم الهاتف المباشر"
                        value={phone}
                        onValueChange={setPhone}
                        variant="bordered"
                        type="tel"
                        startContent={<Phone className="w-4 h-4 text-zinc-400 shrink-0" />}
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
                    </div>

                    <div className="pt-2 mt-1">
                      <Input
                        labelPlacement="outside"
                        label="رقم فودافون كاش / InstaPay (اختياري للتحويلات)"
                        value={instapayVfcash}
                        onValueChange={setInstapayVfcash}
                        variant="bordered"
                        type="tel"
                        startContent={<CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />}
                        size="md"
                        classNames={{
                          label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1.5",
                          inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                        }}
                      />
                    </div>
                  </div>

                  {/* Section 2: الصور والوصف */}
                  <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-zinc-900 dark:text-white pb-1 border-b border-zinc-200/60 dark:border-zinc-800">
                      <FileText className="w-4 h-4" />
                      <span>القسم الثاني: الوصف وصور المنيو / المكان</span>
                    </div>

                    <Textarea
                      labelPlacement="outside"
                      label="وصف مختصر أو مواعيد العمل"
                      value={description}
                      onValueChange={setDescription}
                      variant="bordered"
                      minRows={2}
                      classNames={{
                        label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                        inputWrapper: "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      }}
                    />

                    {/* Drag-and-Drop Minimalist Dropzone */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        <span>إرفاق صور المنيو أو المكان (1 إلى 3 صور)</span>
                        <span className="text-zinc-400 text-[11px]">{selectedFiles.length} / 3 صور</span>
                      </div>

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
                          className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-800 dark:hover:border-zinc-200 rounded-2xl p-4 text-center cursor-pointer bg-white dark:bg-zinc-900 transition-colors flex flex-col items-center justify-center gap-1.5"
                        >
                          <Upload className="w-6 h-6 text-zinc-800 dark:text-zinc-200" />
                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            اضغط هنا لرفع صور المنيو أو المكان
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            يدعم صور JPG, PNG, WEBP (حتى 5MB لكل صورة)
                          </span>
                        </div>
                      )}

                      {filePreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 pt-1">
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
                                aria-label="إزالة الصورة"
                                className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/80 text-white transition-colors hover:bg-rose-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </ModalBody>

            {!isSuccess && (
              <ModalFooter>
                <Button variant="flat" color="default" onClick={onClose} disabled={isSubmitting} className="h-11 font-semibold">
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="add-listing-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Send className="w-4 h-4" />}
                  className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-6 h-11 shadow-sm rounded-xl"
                >
                  إرسال الطلب للمراجعة
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
