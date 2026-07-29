'use client';

import { FormEvent, useRef, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
} from '@heroui/react';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Link2,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { submitAccountRequest } from '@/lib/operations/actions';
import {
  imageFileKey,
  LISTING_IMAGE_ACCEPT,
  uploadOptimizedImages,
} from '@/lib/images/client';
import { CATEGORY_OPTIONS } from '@/lib/categories';
import { isValidEgyptianPhone } from '@/lib/utils';
import type { Place } from '@/types';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

interface AddListingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placesList: Place[];
}

export function AddListingModal({
  isOpen,
  onOpenChange,
  placesList,
}: AddListingModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [existingPlaceId, setExistingPlaceId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('restaurants');
  const [payment, setPayment] = useState('');
  const [description, setDescription] = useState('');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successWarning, setSuccessWarning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processingMsg, setProcessingMsg] = useState('');
  const hasUnsavedChanges = Boolean(
    displayName
    || phone
    || whatsapp
    || password
    || title
    || payment
    || description
    || whatsappGroupUrl
    || telegramUrl
    || address
    || mapUrl
    || selectedFiles.length
    || uploadedImageUrls.length,
  );
  const confirmDiscard = useUnsavedChanges(
    isOpen && hasUnsavedChanges && !isSubmitting && !isSuccess,
  );

  function resetForm() {
    setMode('existing');
    setDisplayName('');
    setPhone('');
    setWhatsapp('');
    setPassword('');
    setConfirmPassword('');
    setExistingPlaceId('');
    setTitle('');
    setCategory('restaurants');
    setPayment('');
    setDescription('');
    setWhatsappGroupUrl('');
    setTelegramUrl('');
    setAddress('');
    setMapUrl('');
    setSelectedFiles([]);
    setUploadedImageUrls([]);
    setIsSubmitting(false);
    setIsSuccess(false);
    setSuccessWarning('');
    setErrorMsg('');
    setProcessingMsg('');
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    if (selectedFiles.length + uploadedImageUrls.length + next.length > 3) {
      setErrorMsg('يمكن رفع 3 صور كحد أقصى.');
      return;
    }
    setErrorMsg('');
    setSelectedFiles((current) => [...current, ...next]);
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
    if (mode === 'new' && selectedFiles.length + uploadedImageUrls.length === 0) {
      setErrorMsg('أضف صورة واحدة على الأقل للمكان أو المنيو قبل إرسال الطلب.');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadResult = mode === 'new'
        ? await uploadOptimizedImages(
            selectedFiles,
            'requests',
            ({ current, total, stage }) => setProcessingMsg(
              stage === 'optimizing'
                ? `جاري تحسين الصورة ${current} من ${total} مع الحفاظ على وضوح المنيو...`
                : `جاري رفع الصورة ${current} من ${total}...`,
            )
          )
        : { urls: [], failedFiles: [], failures: [] };
      const nextUploadedUrls = Array.from(new Set([
        ...uploadedImageUrls,
        ...uploadResult.urls,
      ]));
      setUploadedImageUrls(nextUploadedUrls);

      if (uploadResult.failedFiles.length) {
        const failedKeys = new Set(uploadResult.failures.map((failure) => failure.fileKey));
        setSelectedFiles((current) =>
          current.filter((file) => failedKeys.has(imageFileKey(file))),
        );
        const firstFailure = uploadResult.failures[0]?.message;
        setErrorMsg(
          `تعذر رفع ${uploadResult.failedFiles.length} من الصور${firstFailure ? `: ${firstFailure}` : '.'} بياناتك محفوظة؛ اضغط إرسال مرة أخرى لإعادة محاولة الصور الفاشلة فقط.`,
        );
        return;
      }
      setSelectedFiles([]);
      setProcessingMsg('جاري إرسال الطلب...');
      const result = await submitAccountRequest(
        {
          kind: 'merchant',
          displayName,
          phone,
          whatsapp: whatsapp || phone,
          password,
          placeMode: mode,
          existingPlaceId: mode === 'existing'
            ? placesList.find(
                (place) =>
                  place.id === existingPlaceId
                  || `${place.title} — ${place.phone}` === existingPlaceId,
              )?.id || existingPlaceId
            : null,
          placeTitle: mode === 'new' ? title : null,
          placeCategory: mode === 'new' ? category : null,
          placeWhatsapp: mode === 'new' ? whatsapp || phone : null,
          placePayment: mode === 'new' ? payment : null,
          placeDescription: mode === 'new' ? description : null,
          placeWhatsappGroupUrl: mode === 'new' ? whatsappGroupUrl : null,
          placeTelegramUrl: mode === 'new' ? telegramUrl : null,
          placeAddress: mode === 'new' ? address : null,
          placeMapUrl: mode === 'new' ? mapUrl : null,
        },
        nextUploadedUrls,
      );

      if (!result.success) {
        setErrorMsg(result.message);
        return;
      }
      setSuccessWarning('');
      setIsSuccess(true);
    } catch (error) {
      console.error('Account request submission failed:', error);
      setErrorMsg(error instanceof Error ? error.message : 'تعذر إرسال الطلب. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
      setProcessingMsg('');
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !confirmDiscard()) return;
        if (!open) resetForm();
        onOpenChange(open);
      }}
      size="2xl"
      placement="center"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: 'dir-rtl max-h-[90vh] max-w-[95vw] border border-zinc-200 bg-white font-sans sm:max-w-2xl',
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
                <Building2 className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-zinc-950">طلب حساب محل أو خدمة</h2>
                <p className="mt-0.5 text-xs font-normal text-zinc-500">
                  اربط حسابك ببطاقة موجودة أو أضف خدمتك لأول مرة.
                </p>
              </div>
            </ModalHeader>

            <ModalBody>
              {isSuccess ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="size-14 text-emerald-600" />
                  <h3 className="text-xl font-black">تم إرسال الطلب</h3>
                  <p className="max-w-md text-sm leading-7 text-zinc-600">
                    ستراجع الإدارة ملكية المكان والبيانات. بعد الموافقة يمكنك الدخول
                    برقم الهاتف وكلمة المرور وتعديل بطاقة خدمتك من لوحة النشاط.
                  </p>
                  {successWarning && (
                    <p className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      {successWarning}
                    </p>
                  )}
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
                <form id="merchant-account-form" onSubmit={handleSubmit} className="space-y-5">
                  {errorMsg && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                      {errorMsg}
                    </p>
                  )}
                  {processingMsg && (
                    <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800">
                      {processingMsg}
                    </p>
                  )}

                  <Tabs
                    fullWidth
                    selectedKey={mode}
                    onSelectionChange={(key) => setMode(key as 'existing' | 'new')}
                    classNames={{
                      tabList: 'rounded-xl bg-zinc-100 p-1',
                      cursor: 'bg-zinc-950',
                      tab: 'kayan-account-mode-tab h-11 font-bold',
                      tabContent: 'text-zinc-600 group-data-[selected=true]:text-white',
                    }}
                    aria-label="طريقة تسجيل النشاط"
                  >
                    <Tab
                      key="existing"
                      title={
                        <span className="flex items-center gap-2">
                          <Link2 className="size-4" />
                          ربط مكان موجود
                        </span>
                      }
                    />
                    <Tab
                      key="new"
                      title={
                        <span className="flex items-center gap-2">
                          <Building2 className="size-4" />
                          إضافة خدمة جديدة
                        </span>
                      }
                    />
                  </Tabs>

                  {mode === 'existing' ? (
                    <Select
                      isRequired
                      label="اختر بطاقة المكان أو الخدمة"
                      selectedKeys={existingPlaceId ? [existingPlaceId] : []}
                      onSelectionChange={(keys) => setExistingPlaceId(String(Array.from(keys)[0] ?? ''))}
                    >
                      {placesList.map((place) => (
                        <SelectItem key={place.id} value={place.id}>
                          {place.title} — {place.phone}
                        </SelectItem>
                      ))}
                    </Select>
                  ) : (
                    <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                      <Input
                        isRequired
                        name="placeTitle"
                        label="اسم المكان أو الخدمة"
                        value={title}
                        onValueChange={setTitle}
                      />
                      <Select
                        isRequired
                        label="التصنيف"
                        selectedKeys={[category]}
                        onSelectionChange={(keys) => setCategory(String(Array.from(keys)[0] ?? 'restaurants'))}
                      >
                        {CATEGORY_OPTIONS.filter((item) => item.id !== 'all').map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </Select>
                      <Input
                        name="payment"
                        label="Vodafone Cash / InstaPay"
                        value={payment}
                        onValueChange={setPayment}
                      />
                      <Textarea
                        name="description"
                        label="وصف مختصر أو مواعيد العمل"
                        value={description}
                        onValueChange={setDescription}
                      />
                      <Input
                        name="whatsappGroupUrl"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        label="رابط جروب أو قناة WhatsApp (اختياري)"
                        placeholder="https://chat.whatsapp.com/…"
                        value={whatsappGroupUrl}
                        onValueChange={setWhatsappGroupUrl}
                      />
                      <Input
                        name="telegramUrl"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        label="رابط Telegram (اختياري)"
                        placeholder="https://t.me/…"
                        value={telegramUrl}
                        onValueChange={setTelegramUrl}
                      />
                      <Textarea
                        name="address"
                        autoComplete="street-address"
                        label="العنوان (اختياري)"
                        value={address}
                        onValueChange={setAddress}
                      />
                      <Input
                        name="mapUrl"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        label="رابط الخريطة (اختياري)"
                        placeholder="https://maps.app.goo.gl/…"
                        value={mapUrl}
                        onValueChange={setMapUrl}
                      />
                      <div className="space-y-2 sm:col-span-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={LISTING_IMAGE_ACCEPT}
                          multiple
                          className="sr-only"
                          onChange={(event) => {
                            handleFiles(event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                        <Button
                          type="button"
                          variant="flat"
                          startContent={<Upload className="size-4" />}
                          onPress={() => fileInputRef.current?.click()}
                          isDisabled={selectedFiles.length + uploadedImageUrls.length >= 3}
                        >
                          رفع صور المكان أو المنيو ({selectedFiles.length + uploadedImageUrls.length}/3)
                        </Button>
                        {uploadedImageUrls.length > 0 && (
                          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            تم رفع {uploadedImageUrls.length} صورة بنجاح وستُرفق بالطلب.
                          </p>
                        )}
                        {selectedFiles.map((file, index) => (
                          <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                            <span className="truncate">{file.name}</span>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              aria-label={`حذف صورة ${file.name}`}
                              onPress={() => setSelectedFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      isRequired
                      name="displayName"
                      autoComplete="name"
                      label="اسم صاحب أو مسؤول النشاط"
                      value={displayName}
                      onValueChange={setDisplayName}
                    />
                    <Input
                      isRequired
                      name="phone"
                      autoComplete="tel"
                      type="tel"
                      inputMode="tel"
                      label="رقم دخول الحساب"
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
                      className="sm:col-span-2"
                    />
                  </div>
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
                  form="merchant-account-form"
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
