'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { Switch } from '@heroui/react/switch';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { useOverlayState } from '@heroui/react';
import { Edit, PlusCircle, Check, Upload, X, Star, Building, Trash2 } from 'lucide-react';
import { Place } from '@/types';
import { serverInsertPlaceDirectly, serverUpdateActivePlace, serverDeleteActivePlace } from '@/lib/supabase/admin-actions';
import {
  imageFileKey,
  LISTING_IMAGE_ACCEPT,
  uploadOptimizedImages,
} from '@/lib/images/client';
import {
  CATEGORY_OPTIONS,
  getListingDescriptionLabel,
  getListingImageLabel,
} from '@/lib/categories';
import { isValidEgyptianPhone } from '@/lib/utils';

function PlaceInput({ label, value, onValueChange, icon, isRequired, ...props }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { label: string; value: string; onValueChange: (value: string) => void; icon?: React.ReactNode; isRequired?: boolean }) {
  return <TextField fullWidth isRequired={isRequired} className="space-y-1.5"><Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{label}</Label><div className="relative">{icon ? <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span> : null}<Input {...props} required={isRequired} value={value} onChange={(event) => onValueChange(event.target.value)} className={`min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 ${icon ? 'ps-10' : ''}`} /></div></TextField>;
}

function PlaceTextarea({ label, value, onValueChange, ...props }: Omit<React.ComponentProps<typeof TextArea>, 'value' | 'onChange'> & { label: string; value: string; onValueChange: (value: string) => void }) {
  return <TextField fullWidth className="space-y-1.5"><Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{label}</Label><TextArea {...props} value={value} onChange={(event) => onValueChange(event.target.value)} className="min-h-24 w-full rounded-xl border border-zinc-300 bg-white p-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900" /></TextField>;
}

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
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);

  // Images state
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [processingMsg, setProcessingMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalState = useOverlayState({
    isOpen,
    onOpenChange: (open) => {
      if (!open) resetForm();
      onOpenChange(open);
    },
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTitle(mode === 'edit' && place ? place.title || '' : '');
      setCategory(mode === 'edit' && place ? (place.category as string) || 'restaurants' : 'restaurants');
      setPhone(mode === 'edit' && place ? place.phone || '' : '');
      setWhatsapp(mode === 'edit' && place ? place.whatsapp || '' : '');
      setInstapayVfcash(mode === 'edit' && place ? place.instapay_vfcash || '' : '');
      setDescription(mode === 'edit' && place ? place.description || '' : '');
      setWhatsappGroupUrl(mode === 'edit' && place ? place.whatsapp_group_url || '' : '');
      setTelegramUrl(mode === 'edit' && place ? place.telegram_url || '' : '');
      setAddress(mode === 'edit' && place ? place.address || '' : '');
      setMapUrl(mode === 'edit' && place ? place.map_url || '' : '');
      setIsFeatured(mode === 'edit' && place ? place.is_featured || false : false);
      setExistingImages(mode === 'edit' && place ? place.images || [] : []);
      setNewImageFiles([]);
      setNewImagePreviews([]);
      setUploadedImageUrls([]);
      setErrorMsg('');
      setProcessingMsg('');
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
    setWhatsappGroupUrl('');
    setTelegramUrl('');
    setAddress('');
    setMapUrl('');
    setIsFeatured(false);
    setExistingImages([]);
    setNewImageFiles([]);
    setNewImagePreviews([]);
    setUploadedImageUrls([]);
    setErrorMsg('');
    setProcessingMsg('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    if (newImageFiles.length + uploadedImageUrls.length + filesArray.length > 6) {
      setErrorMsg('يمكن رفع 6 صور جديدة كحد أقصى في المرة الواحدة.');
      e.target.value = '';
      return;
    }

    const updatedFiles = [...newImageFiles, ...filesArray];
    newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    const updatedPreviews = updatedFiles.map((file) => URL.createObjectURL(file));

    setNewImageFiles(updatedFiles);
    setNewImagePreviews(updatedPreviews);
    setErrorMsg('');
    e.target.value = '';
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
    if (mode === 'create' && newImageFiles.length + uploadedImageUrls.length === 0) {
      setErrorMsg('أضف صورة واحدة على الأقل للمكان أو المنيو قبل النشر.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setProcessingMsg('');

    try {
      const uploadResult = await uploadOptimizedImages(
        newImageFiles,
        'requests',
        ({ current, total, stage }) => {
          setProcessingMsg(
            stage === 'optimizing'
              ? `جاري تحسين الصورة ${current} من ${total} مع الحفاظ على وضوح النص...`
              : `جاري رفع الصورة ${current} من ${total}...`,
          );
        },
      );

      const nextUploadedUrls = Array.from(new Set([
        ...uploadedImageUrls,
        ...uploadResult.urls,
      ]));
      setUploadedImageUrls(nextUploadedUrls);

      const failedKeys = new Set(uploadResult.failures.map((failure) => failure.fileKey));
      const retryFiles: File[] = [];
      const retryPreviews: string[] = [];
      newImageFiles.forEach((file, index) => {
        if (failedKeys.has(imageFileKey(file))) {
          retryFiles.push(file);
          if (newImagePreviews[index]) retryPreviews.push(newImagePreviews[index]);
        } else if (newImagePreviews[index]) {
          URL.revokeObjectURL(newImagePreviews[index]);
        }
      });
      setNewImageFiles(retryFiles);
      setNewImagePreviews(retryPreviews);

      if (uploadResult.failedFiles.length) {
        const firstFailure = uploadResult.failures[0]?.message;
        setErrorMsg(
          `تعذر رفع ${uploadResult.failedFiles.length} من الصور${firstFailure ? `: ${firstFailure}` : '.'} لم يتم حفظ المكان بدونها؛ اضغط حفظ لإعادة محاولة الصور الفاشلة فقط.`,
        );
        return;
      }

      const finalImages = Array.from(new Set([...existingImages, ...nextUploadedUrls]));

      if (mode === 'create') {
        const res = await serverInsertPlaceDirectly({
          title: title.trim(),
          category,
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || undefined,
          instapay_vfcash: instapayVfcash.trim() || undefined,
          description: description.trim() || undefined,
          whatsapp_group_url: whatsappGroupUrl.trim() || undefined,
          telegram_url: telegramUrl.trim() || undefined,
          address: address.trim() || undefined,
          map_url: mapUrl.trim() || undefined,
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
          whatsapp_group_url: whatsappGroupUrl.trim() || null,
          telegram_url: telegramUrl.trim() || null,
          address: address.trim() || null,
          map_url: mapUrl.trim() || null,
          images: finalImages,
          is_featured: isFeatured,
        });

        if (!res.success) throw new Error(res.message);
      }

      setUploadedImageUrls([]);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error submitting place form:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ المكان، يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
      setProcessingMsg('');
    }
  };

  return (
    <Modal state={modalState}>
      <Modal.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
        <Modal.Container placement="center" size="lg" scroll="inside" className="p-3">
          <Modal.Dialog aria-label={mode === 'create' ? 'إضافة مكان جديد' : 'تعديل بيانات المكان'} dir="rtl" className="max-h-[90vh] max-w-2xl border border-zinc-200 bg-white font-sans dark:border-zinc-800 dark:bg-zinc-900">
            <Modal.Header className="flex shrink-0 items-center gap-2 border-b border-zinc-100 pb-3 text-lg font-bold text-zinc-900 dark:border-zinc-800 dark:text-white">
              <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                {mode === 'create' ? <PlusCircle className="w-5 h-5" /> : <Edit className="w-5 h-5" />}
              </div>
              <div className="flex flex-col">
                <Modal.Heading>{mode === 'create' ? 'إضافة مكان جديد' : 'تعديل بيانات المكان'}</Modal.Heading>
                <span className="text-xs text-zinc-500 font-normal">النشر الفوري وإدارة صور المنيو</span>
              </div>
            </Modal.Header>

            <Modal.Body className="space-y-4 overflow-y-auto py-4">
              <form id="edit-place-modal-form" onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-semibold">
                    {errorMsg}
                  </div>
                )}
                {processingMsg && (
                  <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-800">
                    {processingMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PlaceInput
                    isRequired
                    label="اسم المكان / الخدمة"
                    value={title}
                    onValueChange={setTitle}
                    icon={<Building className="size-4 shrink-0" aria-hidden="true" />}
                  />

                  <Select
                    isRequired
                    selectedKey={category}
                    onSelectionChange={(key) => setCategory(String(key))}
                  >
                    <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">التصنيف</Label>
                    <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-start dark:border-zinc-700 dark:bg-zinc-900"><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox>{CATEGORY_OPTIONS.map((c) => <ListBox.Item key={c.id} id={c.id} textValue={c.label} className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100 data-[selected]:font-bold">{c.label}</ListBox.Item>)}</ListBox></Select.Popover>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PlaceInput
                    isRequired
                    label="رقم تشغيلي داخلي"
                    value={phone}
                    onValueChange={setPhone}
                    type="tel"
                  />
                </div>

                <PlaceTextarea
                  label={getListingDescriptionLabel(category)}
                  placeholder={category === 'stores'
                    ? 'أهم المنتجات والماركات، نطاق الأسعار، وخيارات الاستلام أو التوصيل…'
                    : undefined}
                  value={description}
                  onValueChange={setDescription}
                  rows={2}
                />

                <div className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                  <PlaceTextarea
                    name="address"
                    autoComplete="street-address"
                    label="العنوان"
                    value={address}
                    onValueChange={setAddress}
                  />
                  <PlaceInput
                    name="mapUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    label="رابط الخريطة"
                    placeholder="https://maps.app.goo.gl/…"
                    value={mapUrl}
                    onValueChange={setMapUrl}
                  />
                </div>

                {/* Featured Switch */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="font-extrabold text-xs text-amber-900 dark:text-amber-300">
                      تمييز المكان في أعلى قائمة الخدمات (Featured Place)
                    </span>
                  </div>
                  <Switch size="sm" isSelected={isFeatured} onChange={setIsFeatured} aria-label="تمييز المكان"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </div>

                {/* Professional Image Manager */}
                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <span>إدارة {getListingImageLabel(category)}</span>
                    <span className="text-zinc-400 font-normal">
                      إجمالي {existingImages.length + uploadedImageUrls.length + newImageFiles.length} صور
                    </span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept={LISTING_IMAGE_ACCEPT}
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
                  {(existingImages.length > 0 || uploadedImageUrls.length > 0 || newImagePreviews.length > 0) && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-2">
                      {/* Existing Images */}
                      {existingImages.map((imgUrl, idx) => (
                        <div key={`existing-${idx}`} className="relative group w-full h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl} alt={`صورة ${idx + 1}`} className="h-full w-full object-cover" />
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

                      {/* Images uploaded during this save attempt */}
                      {uploadedImageUrls.map((imgUrl, idx) => (
                        <div key={`uploaded-${imgUrl}`} className="relative group w-full h-20 rounded-xl overflow-hidden border-2 border-emerald-500 bg-emerald-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl} alt={`صورة تم رفعها ${idx + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setUploadedImageUrls((current) => current.filter((url) => url !== imgUrl))}
                            className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-md transition-transform hover:scale-105"
                            title="حذف الصورة المرفوعة"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* New Upload Previews */}
                      {newImagePreviews.map((previewUrl, idx) => (
                        <div key={`new-${idx}`} className="relative group w-full h-20 rounded-xl overflow-hidden border-2 border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                          <Image
                            src={previewUrl}
                            alt={`صورة جديدة ${idx + 1}`}
                            fill
                            sizes="160px"
                            unoptimized
                            className="object-cover"
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
            </Modal.Body>

            <Modal.Footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between border-t border-zinc-100 bg-white pt-3 dark:border-zinc-800 dark:bg-zinc-900">
              {mode === 'edit' && place ? (
                <Button
                  variant="danger-soft"
                  isPending={isSubmitting}
                  onClick={async () => {
                    if (confirm(`هل أنت متأكد من حذف مكان "${title || place.title}" نهائياً من ديرتك؟`)) {
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
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  حذف المكان نهائياً
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="secondary" onPress={modalState.close} isDisabled={isSubmitting} className="h-11 font-semibold">
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  form="edit-place-modal-form"
                  isPending={isSubmitting}
                  className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-6 h-11 shadow-sm rounded-xl"
                >
                  {!isSubmitting && <Check className="w-4 h-4" aria-hidden="true" />}
                  {mode === 'create' ? 'إضافة المكان ونشره في ديرتك' : 'حفظ التعديلات الحالية'}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
