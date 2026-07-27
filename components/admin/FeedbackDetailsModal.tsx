'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
  Image as HeroImage,
} from '@heroui/react';
import { MessageSquare, CheckCircle, Phone, ArrowRight, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { FeedbackImageMode, FeedbackRequest, Place } from '@/types';
import {
  applyFeedbackToPlace,
  resolveFeedbackWithoutChanges,
} from '@/lib/operations/approval-actions';

interface FeedbackDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  feedback: FeedbackRequest;
  targetPlace: Place | null;
  onSuccess: () => void;
}

export const FeedbackDetailsModal: React.FC<FeedbackDetailsModalProps> = ({
  isOpen,
  onOpenChange,
  feedback,
  targetPlace,
  onSuccess,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [imageMode, setImageMode] = useState<FeedbackImageMode>(
    feedback.feedback_type === 'merchant_update' ? 'replace' : 'append',
  );

  const imagesToPreview = feedback.proposed_images?.length
    ? feedback.proposed_images
    : feedback.images || [];
  const canApply = Boolean(
    targetPlace
      && (
        feedback.feedback_type === 'merchant_update'
        || feedback.proposed_phone
        || imagesToPreview.length
      ),
  );

  const handleApply = async () => {
    setIsApplying(true);
    const res = await applyFeedbackToPlace(feedback.id, imageMode);
    setIsApplying(false);

    if (res.success) {
      alert(res.message || 'تم تطبيق التعديلات وإكمال الطلب.');
      onSuccess();
      onOpenChange(false);
    } else {
      alert(res.message || 'حدث خطأ أثناء تطبيق التعديلات.');
    }
  };

  const handleResolveOnly = async () => {
    setIsResolving(true);
    const res = await resolveFeedbackWithoutChanges(feedback.id);
    setIsResolving(false);

    if (res.success) {
      onSuccess();
      onOpenChange(false);
    } else {
      alert('حدث خطأ أثناء تحديث حالة الطلب.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      placement="center"
      scrollBehavior="inside"
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
            <ModalHeader className="flex items-center justify-between text-zinc-900 dark:text-white font-bold text-lg">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span>
                    {feedback.feedback_type === 'merchant_update'
                      ? 'تعديل مقدم من المحل'
                      : 'تفاصيل طلب التعديل'}
                  </span>
                  <span className="text-xs text-zinc-500 font-normal">
                    معاينة البيانات الحالية مقابل التعديل المقترح قبل النشر
                  </span>
                </div>
              </div>
              <Chip
                size="sm"
                variant="flat"
                color={feedback.status === 'resolved' ? 'success' : 'warning'}
                className="font-bold text-xs"
              >
                {feedback.status === 'resolved' ? 'تمت المعالجة' : 'قيد الانتظار'}
              </Chip>
            </ModalHeader>

            <ModalBody className="py-4 space-y-4">
              {/* Contact Info & Notes */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-extrabold text-zinc-900 dark:text-white">
                    <span>الجهة / الرقم المحدد بالطلب:</span>
                    <span className="text-zinc-900 dark:text-white font-mono text-sm">{feedback.place_name_or_phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-zinc-600 dark:text-zinc-400">
                    <span>هاتف مقدم الطلب:</span>
                    <a href={`tel:${feedback.contact_phone}`} className="font-mono text-emerald-600 dark:text-emerald-400 underline dir-ltr">
                      {feedback.contact_phone}
                    </a>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-700">
                  <span className="font-extrabold text-zinc-700 dark:text-zinc-300 block mb-1">تفاصيل وملاحظات الطلب:</span>
                  <p className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 leading-relaxed font-semibold">
                    {feedback.notes}
                  </p>
                </div>
              </div>

              {/* Side-by-Side Comparison (If Target Place Exists or Proposed Phone) */}
              {(targetPlace || feedback.proposed_phone) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700">
                  {/* Current Data */}
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                    <span className="font-extrabold text-zinc-500 dark:text-zinc-400 block border-b pb-1">البيانات الحالية في خدمات الكيان</span>
                    <div className="font-bold text-zinc-900 dark:text-white">{targetPlace?.title || feedback.place_name_or_phone}</div>
                    <div className="text-zinc-600 dark:text-zinc-400">{targetPlace?.category}</div>
                    <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-mono">{targetPlace?.phone || 'غير محدد'}</span>
                    </div>
                  </div>

                  {/* Proposed Data */}
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2 text-xs">
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400 block border-b border-emerald-200 pb-1">التعديل المقترح</span>
                    <div className="font-bold text-emerald-950 dark:text-emerald-200">
                      {feedback.feedback_type === 'merchant_update' ? (
                        <div className="space-y-1.5">
                          <p>{feedback.proposed_title || targetPlace?.title}</p>
                          <p className="font-normal">
                            التصنيف: {feedback.proposed_category || targetPlace?.category}
                          </p>
                          <p className="font-mono">
                            {feedback.proposed_phone || targetPlace?.phone}
                          </p>
                          <p className="font-normal">
                            واتساب: {feedback.proposed_whatsapp || 'سيتم حذفه'}
                          </p>
                          <p className="font-normal">
                            الدفع: {feedback.proposed_instapay_vfcash || 'سيتم حذفه'}
                          </p>
                          <p className="whitespace-pre-wrap font-normal">
                            {feedback.proposed_description || 'بدون وصف'}
                          </p>
                        </div>
                      ) : feedback.proposed_phone ? (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-zinc-400">{targetPlace?.phone}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm">{feedback.proposed_phone}</span>
                        </div>
                      ) : (
                        <span>إضافة / تحديث صور المنيو</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Proposed Menu / Photo Gallery */}
              {imagesToPreview.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-extrabold text-zinc-900 dark:text-white block">
                    صور المنيو / المكان المرفقة بالطلب ({imagesToPreview.length} صور)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {imagesToPreview.map((imgUrl, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 h-32">
                        <HeroImage
                          src={imgUrl}
                          alt={`صورة ${idx + 1}`}
                          classNames={{
                            wrapper: "w-full h-full",
                            img: "w-full h-full object-cover",
                          }}
                          radius="none"
                        />
                        <div className="absolute inset-0 bg-zinc-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                          <a
                            href={imgUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="فتح بحجم كامل"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <a
                            href={imgUrl}
                            download={`menu-photo-${idx + 1}.jpg`}
                            className="rounded-lg bg-zinc-900 p-1.5 text-white transition-colors hover:bg-zinc-800"
                            title="تحميل الصورة"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  {feedback.status !== 'resolved' && imagesToPreview.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <span className="text-xs font-bold text-zinc-700">طريقة تطبيق الصور:</span>
                      <Button
                        variant="flat"
                        onPress={() => setImageMode('append')}
                        className={imageMode === 'append' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900 border border-zinc-200'}
                      >
                        إضافة إلى الصور الحالية
                      </Button>
                      <Button
                        variant="flat"
                        onPress={() => setImageMode('replace')}
                        className={imageMode === 'replace' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900 border border-zinc-200'}
                      >
                        استبدال كل الصور
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>

            <ModalFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="flat"
                color="default"
                onClick={onClose}
                className="font-semibold h-11"
              >
                إغلاق
              </Button>

              {feedback.status !== 'resolved' && (
                <>
                  <Button
                    variant="flat"
                    color="warning"
                    onClick={handleResolveOnly}
                    isLoading={isResolving}
                    startContent={!isResolving && <CheckCircle className="w-4 h-4" />}
                    className="min-h-[44px] border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-800"
                  >
                    تم المعالجة بدون تعديل
                  </Button>

                  {canApply && (
                    <Button
                      color="success"
                      variant="solid"
                      onClick={handleApply}
                      isLoading={isApplying}
                      startContent={!isApplying && <RefreshCw className="w-4 h-4" />}
                      className="min-h-[44px] bg-zinc-900 px-6 text-xs font-bold text-white shadow-md hover:bg-zinc-800"
                    >
                      تأكيد وتطبيق التعديل فوراً
                    </Button>
                  )}
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
