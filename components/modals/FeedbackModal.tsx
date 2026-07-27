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
  Image as HeroImage,
} from '@heroui/react';
import { MessageSquarePlus, Send, CheckCircle2, Upload, X, Building, Phone, Star } from 'lucide-react';
import { submitFeedbackSubmission } from '@/lib/supabase/actions';
import { uploadOptimizedImages } from '@/lib/images/client';
import { isValidEgyptianPhone } from '@/lib/utils';
import { FeedbackType, Place } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface FeedbackModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placesList?: Place[];
}

const FEEDBACK_TYPES: { id: FeedbackType; label: string; description: string }[] = [
  { id: 'menu_update', label: 'منيو جديد / تحديث صور المكان', description: 'إضافة أو استبدال صور المنيو' },
  { id: 'phone_change', label: 'تغيير رقم الهاتف أو الواتساب', description: 'تحديث أرقام التواصل' },
  { id: 'report_issue', label: 'الإبلاغ عن بيانات غير صحيحة أو مكان مغلق', description: 'التنبيه لمشكلة بالبيانات' },
  { id: 'general_suggestion', label: 'اقتراح أو ملاحظة عامة', description: 'ملاحظات لتطوير كيان سيتي سبوت' },
  { id: 'rating', label: 'تقييم تجربتك مع كيان سيتي سبوت', description: 'شاركنا تقييمك من نجمة إلى خمس نجوم' },
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onOpenChange, placesList = [] }) => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('menu_update');
  const [targetPlaceId, setTargetPlaceId] = useState<string>('unlisted');
  const [placeNameOrPhone, setPlaceNameOrPhone] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [proposedPhone, setProposedPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(5);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [fetchedPlaces, setFetchedPlaces] = useState<Place[]>(placesList);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successWarning, setSuccessWarning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processingMsg, setProcessingMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && fetchedPlaces.length === 0) {
      const fetchPlaces = async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase.from('places').select('*').order('title');
          if (data) setFetchedPlaces(data as Place[]);
        } catch (e) {
          console.warn('Could not fetch places list for feedback modal:', e);
        }
      };
      fetchPlaces();
    }
  }, [isOpen, fetchedPlaces.length]);

  const resetForm = () => {
    filePreviews.forEach((url) => URL.revokeObjectURL(url));

    setFeedbackType('menu_update');
    setTargetPlaceId('unlisted');
    setPlaceNameOrPhone('');
    setContactPhone('');
    setProposedPhone('');
    setNotes('');
    setRating(5);
    setSelectedFiles([]);
    setFilePreviews([]);
    setIsSuccess(false);
    setSuccessWarning('');
    setErrorMsg('');
    setProcessingMsg('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    if (selectedFiles.length + filesArray.length > 3) {
      setErrorMsg('يمكنك رفع حتى 3 صور فقط.');
      return;
    }

    setErrorMsg('');
    const newFiles = [...selectedFiles, ...filesArray].slice(0, 3);
    filePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedFiles(newFiles);
    setFilePreviews(newFiles.map((file) => URL.createObjectURL(file)));
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

    const isOpinion = feedbackType === 'general_suggestion' || feedbackType === 'rating';
    if (!notes.trim() || (!isOpinion && !contactPhone.trim())) {
      setErrorMsg(
        isOpinion
          ? 'اكتب اقتراحك أو رأيك قبل الإرسال.'
          : 'يرجى إدخال رقم هاتفك وتوضيح طلب التعديل أو الملاحظة.',
      );
      return;
    }

    if (contactPhone.trim() && !isValidEgyptianPhone(contactPhone.trim())) {
      setErrorMsg('يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const uploadResult = await uploadOptimizedImages(
        selectedFiles,
        'feedback',
        ({ current, total, stage }) => setProcessingMsg(
          stage === 'optimizing'
            ? `جاري تحسين الصورة ${current} من ${total} مع الحفاظ على وضوح المنيو...`
            : `جاري رفع الصورة ${current} من ${total}...`,
        ),
      );
      if (selectedFiles.length) setProcessingMsg('جاري إرسال الطلب...');
      const selectedPlace = fetchedPlaces.find((p) => p.id === targetPlaceId);
      const placeDisplayName = isOpinion
        ? 'رأي عام في كيان سيتي سبوت'
        : selectedPlace
          ? selectedPlace.title
          : placeNameOrPhone.trim() || 'مكان غير مدرج';

      const res = await submitFeedbackSubmission(
        placeDisplayName,
        feedbackType,
        contactPhone,
        notes,
        uploadResult.urls,
        !isOpinion && targetPlaceId !== 'unlisted' ? targetPlaceId : null,
        !isOpinion ? proposedPhone.trim() || null : null,
        feedbackType === 'rating' ? rating : null,
      );

      if (!res.success) {
        throw new Error(res.message);
      }

      setSuccessWarning(
        uploadResult.failedFiles.length
          ? `تم استلام طلبك، لكن تعذر إرفاق ${uploadResult.failedFiles.length} من الصور. الطلب النصي لم يُفقد ويمكنك إرسال الصور لاحقاً.`
          : '',
      );
      setIsSuccess(true);
    } catch (err: any) {
      console.error('Feedback submission exception:', err);
      setErrorMsg(err?.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
      setProcessingMsg('');
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
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span>التعديلات والاقتراحات والتقييم</span>
                <span className="text-xs text-zinc-500 font-normal">رأيك يصل مباشرة إلى إدارة كيان سيتي سبوت</span>
              </div>
            </ModalHeader>

            <ModalBody className="py-4 space-y-4">
              {isSuccess ? (
                <div className="py-6 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h4 className="font-extrabold text-lg text-zinc-900 dark:text-white">
                    تم استلام طلبك
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xs leading-relaxed font-semibold">
                    {feedbackType === 'rating' || feedbackType === 'general_suggestion'
                      ? 'شكرًا لمشاركتنا رأيك. وصل مباشرة إلى الإدارة وسيتم مراجعته ضمن تطوير كيان سيتي سبوت.'
                      : 'شكرًا لتواصلك مع كيان سيتي سبوت. سيتم مراجعة طلبك وتحديث البيانات قريبًا إن شاء الله.'}
                  </p>
                  {successWarning && (
                    <p className="max-w-xs rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                      {successWarning}
                    </p>
                  )}
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
                <form id="feedback-form" onSubmit={handleSubmit} className="space-y-4">
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

                  <Select
                    isRequired
                    labelPlacement="outside"
                    label="نوع الطلب أو الملاحظة"
                    selectedKeys={[feedbackType]}
                    onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
                    variant="bordered"
                    size="md"
                    classNames={{
                      label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                      trigger: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                    }}
                  >
                    {FEEDBACK_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id} description={t.description}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </Select>

                  {feedbackType === 'rating' && (
                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                      <p className="text-sm font-black text-amber-950">تقييمك للتجربة</p>
                      <div className="flex justify-center gap-1" dir="ltr">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-label={`${value} نجوم`}
                            onClick={() => setRating(value)}
                            className="flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-amber-100"
                          >
                            <Star
                              className={`size-7 ${
                                value <= rating
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-zinc-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <p className="text-xs font-bold text-amber-800">{rating} من 5</p>
                    </div>
                  )}

                  {!['general_suggestion', 'rating'].includes(feedbackType) && (
                  <div className="space-y-3">
                    <Select
                      labelPlacement="outside"
                      label="اختر المكان المراد تعديله (من كيان سيتي سبوت)"
                      selectedKeys={[targetPlaceId]}
                      onChange={(e) => setTargetPlaceId(e.target.value)}
                      variant="bordered"
                      size="md"
                      startContent={<Building className="w-4 h-4 text-zinc-400 shrink-0" />}
                      classNames={{
                        label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                        trigger: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      }}
                    >
                      {[
                        { id: 'unlisted', title: '-- غير مدرج بالقائمة (كتابة الاسم يدويًا) --', phone: '' },
                        ...fetchedPlaces,
                      ].map((p) => (
                        <SelectItem key={p.id} value={p.id} description={p.phone || undefined}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </Select>

                    {targetPlaceId === 'unlisted' && (
                      <Input
                        labelPlacement="outside"
                        label="اسم المكان أو الخدمة المراد تعديلها"
                        value={placeNameOrPhone}
                        onValueChange={setPlaceNameOrPhone}
                        variant="bordered"
                        size="md"
                        classNames={{
                          label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                          inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                        }}
                      />
                    )}
                  </div>
                  )}

                  <div className={`grid grid-cols-1 gap-4 ${
                    !['general_suggestion', 'rating'].includes(feedbackType)
                      ? 'sm:grid-cols-2'
                      : ''
                  }`}>
                    <Input
                      isRequired={!['general_suggestion', 'rating'].includes(feedbackType)}
                      labelPlacement="outside"
                      label={
                        ['general_suggestion', 'rating'].includes(feedbackType)
                          ? 'رقم هاتفك (اختياري)'
                          : 'رقم هاتفك للتواصل والتأكيد'
                      }
                      value={contactPhone}
                      onValueChange={setContactPhone}
                      variant="bordered"
                      type="tel"
                      size="md"
                      classNames={{
                        label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                        inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      }}
                    />

                    {!['general_suggestion', 'rating'].includes(feedbackType) && (
                      <Input
                      labelPlacement="outside"
                      label="رقم الهاتف الجديد المقترح (اختياري)"
                      value={proposedPhone}
                      onValueChange={setProposedPhone}
                      variant="bordered"
                      type="tel"
                      size="md"
                      startContent={<Phone className="w-4 h-4 text-emerald-600 shrink-0" />}
                      classNames={{
                        label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                        inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                      }}
                      />
                    )}
                  </div>

                  <Textarea
                    isRequired
                    labelPlacement="outside"
                    label="تفاصيل الطلب أو التعديل أو الملاحظة"
                    value={notes}
                    onValueChange={setNotes}
                    variant="bordered"
                    minRows={2}
                    classNames={{
                      label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                      inputWrapper: "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                    }}
                  />

                  {!['general_suggestion', 'rating'].includes(feedbackType) && (
                  /* Optional File Upload */
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                      <span>إرفاق صور جديدة للمنيو أو المكان (اختياري - حتى 3 صور)</span>
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
                        <Upload className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          اضغط هنا لإرفاق صور منيو أو إثبات تعديل
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
                  )}
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
                  form="feedback-form"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <Send className="w-4 h-4" />}
                  className="font-bold text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-6 h-11 shadow-sm rounded-xl"
                >
                  إرسال الطلب للإدارة
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
