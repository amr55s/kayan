'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Switch,
  Image as HeroImage,
} from '@heroui/react';
import { Edit, PlusCircle, Check, Upload, X, Star, Building, CreditCard, Trash2 } from 'lucide-react';
import { Place } from '@/types';
import { serverInsertPlaceDirectly, serverUpdateActivePlace, serverDeleteActivePlace } from '@/lib/supabase/admin-actions';
import { uploadImageToStorage } from '@/lib/supabase/actions';
import { CATEGORY_OPTIONS } from '@/lib/categories';
import { isValidEgyptianPhone } from '@/lib/utils';

interface EditPlaceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  place?: Place | null;
  onSuccess: () => void;
}

export const EditPlaceModal: React.FC<EditPlaceModalProps> = ({
  isOpen,
  onOpenChange,
  mode,
  place,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('restaurants');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instapayVfcash, setInstapayVfcash] = useState('');
  const [description, setDescription] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);

  // Images state
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTitle(mode === 'edit' && place ? place.title || '' : '');
      setCategory(mode === 'edit' && place ? (place.category as string) || 'restaurants' : 'restaurants');
      setPhone(mode === 'edit' && place ? place.phone || '' : '');
      setWhatsapp(mode === 'edit' && place ? place.whatsapp || '' : '');
      setInstapayVfcash(mode === 'edit' && place ? place.instapay_vfcash || '' : '');
      setDescription(mode === 'edit' && place ? place.description || '' : '');
      setIsFeatured(mode === 'edit' && place ? place.is_featured || false : false);
      setExistingImages(mode === 'edit' && place ? place.images || [] : []);
      setNewImageFiles([]);
      setNewImagePreviews([]);
      setErrorMsg('');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, place, isOpen]);

  const resetForm = () => {
    newImagePreviews.forEach((url) => URL.revokeObjectURL(url));

    setTitle('');
    setCategory('restaurants');
    setPhone('');
    setWhatsapp('');
    setInstapayVfcash('');
    setDescription('');
    setIsFeatured(false);
    setExistingImages([]);
    setNewImageFiles([]);
    setNewImagePreviews([]);
    setErrorMsg('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    const validImages = filesArray.filter((file) => file.type.startsWith('image/'));

    const updatedFiles = [...newImageFiles, ...validImages];
    const updatedPreviews = updatedFiles.map((file) => URL.createObjectURL(file));

    setNewImageFiles(updatedFiles);
    setNewImagePreviews(updatedPreviews);
  };

  const handleRemoveExistingImage = (indexToRemove: number) => {
    setExistingImages(existingImages.filter((_, idx) => idx !== indexToRemove));
  };

  const handleRemoveNewImage = (indexToRemove: number) => {
    if (newImagePreviews[indexToRemove]) {
      URL.revokeObjectURL(newImagePreviews[indexToRemove]);
    }
    const updatedFiles = newImageFiles.filter((_, idx) => idx !== indexToRemove);
    const updatedPreviews = newImagePreviews.filter((_, idx) => idx !== indexToRemove);
    setNewImageFiles(updatedFiles);
    setNewImagePreviews(updatedPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !phone.trim() || !category) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة (اسم المكان، التصنيف، رقم الهاتف)');
      return;
    }

    if (!isValidEgyptianPhone(phone.trim())) {
      setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // Upload new images to storage
      const uploadedUrls: string[] = [];
      for (const file of newImageFiles) {
        const url = await uploadImageToStorage(file);
        if (url) uploadedUrls.push(url);
      }

      const finalImages = Array.from(new Set([...existingImages, ...uploadedUrls]));

      if (mode === 'create') {
        const res = await serverInsertPlaceDirectly({
          title: title.trim(),
          category,
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || undefined,
          instapay_vfcash: instapayVfcash.trim() || undefined,
          description: description.trim() || undefined,
          images: finalImages,
          is_featured: isFeatured,
        });

        if (!res.success) throw new Error(res.message);
      } else if (mode === 'edit' && place) {
        const res = await serverUpdateActivePlace(place.id, {
          title: title.trim(),
          category,
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || undefined,
          instapay_vfcash: instapayVfcash.trim() || undefined,
          description: description.trim() || undefined,
          images: finalImages,
          is_featured: isFeatured,
        });

        if (!res.success) throw new Error(res.message);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error submitting place form:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ المكان، يرجى المحاولة لاحقاً.');
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
        body: "py-4 space-y-4 overflow-y-auto",
        footer: "border-t border-zinc-100 dark:border-zinc-800 pt-3 shrink-0 sticky bottom-0 bg-white dark:bg-zinc-900 z-10",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg">
              <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                {mode === 'create' ? <PlusCircle className="w-5 h-5" /> : <Edit className="w-5 h-5" />}
              </div>
              <div className="flex flex-col">
                <span>{mode === 'create' ? 'إضافة مكان جديد' : 'تعديل بيانات المكان'}</span>
                <span className="text-xs text-zinc-500 font-normal">النشر الفوري وإدارة صور المنيو</span>
              </div>
            </ModalHeader>

            <ModalBody className="py-4 space-y-4">
              <form id="edit-place-modal-form" onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
                    {errorMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    isRequired
                    labelPlacement="outside"
                    label="اسم المكان / الخدمة"
                    value={title}
                    onValueChange={setTitle}
                    variant="bordered"
                    size="md"
                    startContent={<Building className="w-4 h-4 text-zinc-400 shrink-0" />}
                    classNames={{
                      label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                      inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                    }}
                  />

                  <Select
                    isRequired
                    labelPlacement="outside"
                    label="التصنيف"
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
                    label="رقم الهاتف الأساسي"
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
                </div>

                <div className="pt-2 mt-1">
                  <Input
                    labelPlacement="outside"
                    label="رقم فودافون كاش / InstaPay"
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

                <Textarea
                  labelPlacement="outside"
                  label="الوصف أو مواعيد العمل"
                  value={description}
                  onValueChange={setDescription}
                  variant="bordered"
                  minRows={2}
                  classNames={{
                    label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                    inputWrapper: "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                  }}
                />

                {/* Featured Switch */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="font-extrabold text-xs text-amber-900 dark:text-amber-300">
                      تمييز المكان في أعلى قائمة الخدمات (Featured Place)
                    </span>
                  </div>
                  <Switch
                    size="sm"
                    color="warning"
                    isSelected={isFeatured}
                    onValueChange={setIsFeatured}
                  />
                </div>

                {/* Professional Image Manager */}
                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <span>إدارة صور المنيو والمكان</span>
                    <span className="text-zinc-400 font-normal">
                      إجمالي {existingImages.length + newImageFiles.length} صور
                    </span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-800 dark:hover:border-zinc-200 rounded-xl p-3 text-center cursor-pointer bg-white dark:bg-zinc-900 transition-colors flex items-center justify-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300"
                  >
                    <Upload className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
                    <span>اضغط هنا لإضافة صور جديدة من جهازك</span>
                  </div>

                  {/* Existing & New Images Gallery Grid */}
                  {(existingImages.length > 0 || newImagePreviews.length > 0) && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-2">
                      {/* Existing Images */}
                      {existingImages.map((imgUrl, idx) => (
                        <div key={`existing-${idx}`} className="relative group w-full h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                          <HeroImage
                            src={imgUrl}
                            alt={`صورة ${idx + 1}`}
                            classNames={{
                              wrapper: "w-full h-full",
                              img: "w-full h-full object-cover",
                            }}
                            radius="none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingImage(idx)}
                            className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-md transition-transform hover:scale-105"
                            title="حذف الصورة"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* New Upload Previews */}
                      {newImagePreviews.map((previewUrl, idx) => (
                        <div key={`new-${idx}`} className="relative group w-full h-20 rounded-xl overflow-hidden border-2 border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                          <HeroImage
                            src={previewUrl}
                            alt={`صورة جديدة ${idx + 1}`}
                            classNames={{
                              wrapper: "w-full h-full",
                              img: "w-full h-full object-cover",
                            }}
                            radius="none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveNewImage(idx)}
                            className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-md transition-transform hover:scale-105"
                            title="حذف الصورة الجديدة"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </ModalBody>

            <ModalFooter className="flex items-center justify-between">
              {mode === 'edit' && place ? (
                <Button
                  color="danger"
                  variant="flat"
                  startContent={<Trash2 className="w-4 h-4" />}
                  isLoading={isSubmitting}
                  onClick={async () => {
                    if (confirm(`هل أنت متأكد من حذف مكان "${title || place.title}" نهائياً من كيان سيتي سبوت؟`)) {
                      setIsSubmitting(true);
                      const res = await serverDeleteActivePlace(place.id);
                      setIsSubmitting(false);
                      if (res.success) {
                        onOpenChange(false);
                        if (onSuccess) onSuccess();
                      } else {
                        setErrorMsg(res.message || 'حدث خطأ أثناء حذف المكان.');
                      }
                    }
                  }}
                  className="font-bold text-xs h-11"
                >
                  حذف المكان نهائياً
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="flat" color="default" onClick={onClose} disabled={isSubmitting} className="h-11 font-semibold">
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="edit-place-modal-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Check className="w-4 h-4" />}
                  className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-6 h-11 shadow-sm rounded-xl"
                >
                  {mode === 'create' ? 'إضافة المكان ونشره في كيان سيتي سبوت' : 'حفظ التعديلات الحالية'}
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
