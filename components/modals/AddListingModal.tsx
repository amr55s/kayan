'use client';

import { FormEvent, useRef, useState, useId } from 'react';
import Link from 'next/link';
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
} from '@/components/ui/heroui-compat';
import {
  Building2,
  CheckCircle2,
  Home,
  Image as ImageIcon,
  Link2,
  Send,
  Sparkles,
  Star,
  Store as StoreIcon,
  Upload,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';
import { submitAccountRequest } from '@/lib/operations/actions';
import {
  imageFileKey,
  uploadOptimizedImages,
} from '@/lib/images/client';
import {
  CATEGORY_OPTIONS,
} from '@/lib/categories';
import {
  getListingProfile,
  isRoomsFieldRequired,
  type RealEstateDetailsDraft,
} from '@/lib/listings/config';
import { isValidEgyptianPhone } from '@/lib/utils';
import type { Place } from '@/types';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useGoogleApplicant } from '@/hooks/useGoogleApplicant';
import { RealEstateListingFields } from './RealEstateListingFields';

interface AddListingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placesList: Place[];
}

const INITIAL_REAL_ESTATE_DRAFT: RealEstateDetailsDraft = {
  offerType: 'rent',
  propertyType: 'apartment',
  priceEgp: '',
  rooms: '',
  bathrooms: '',
  areaSqm: '',
  floor: '',
  furnishing: '',
};

export function AddListingModal({
  isOpen,
  onOpenChange,
  placesList,
}: AddListingModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryId = useId();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [existingPlaceId, setExistingPlaceId] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('restaurants');
  const [payment, setPayment] = useState('');
  const [description, setDescription] = useState('');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');

  const [realEstateDraft, setRealEstateDraft] = useState<RealEstateDetailsDraft>(INITIAL_REAL_ESTATE_DRAFT);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successWarning, setSuccessWarning] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processingMsg, setProcessingMsg] = useState('');
  const { identity, isLoading: isIdentityLoading } = useGoogleApplicant(isOpen);

  const effectiveDisplayName = displayName || identity?.displayName || '';
  const profile = getListingProfile(category);
  const isRealEstate = profile.features.isRealEstate;
  const minImages = profile.imagePolicy.min;
  const maxImages = profile.imagePolicy.max;
  const currentTotalImages = selectedFiles.length + uploadedImageUrls.length;

  const hasUnsavedChanges = Boolean(
    displayName
    || phone
    || (!whatsappSameAsPhone && whatsapp)
    || title
    || payment
    || description
    || whatsappGroupUrl
    || telegramUrl
    || address
    || mapUrl
    || realEstateDraft.priceEgp
    || realEstateDraft.rooms
    || realEstateDraft.areaSqm
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
    setWhatsappSameAsPhone(true);
    setWhatsapp('');
    setExistingPlaceId('');
    setTitle('');
    setCategory('restaurants');
    setPayment('');
    setDescription('');
    setWhatsappGroupUrl('');
    setTelegramUrl('');
    setAddress('');
    setMapUrl('');
    setRealEstateDraft(INITIAL_REAL_ESTATE_DRAFT);
    setSelectedFiles([]);
    setUploadedImageUrls([]);
    setIsSubmitting(false);
    setIsSuccess(false);
    setSuccessWarning('');
    setErrorMsg('');
    setProcessingMsg('');
  }

  function handleCategoryChange(newCategory: string) {
    setCategory(newCategory);
    setErrorMsg('');
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    if (selectedFiles.length + uploadedImageUrls.length + next.length > maxImages) {
      setErrorMsg(
        isRealEstate
          ? `يمكن رفع ${maxImages} صور كحد أقصى للعقارات.`
          : `يمكن رفع ${maxImages} صور كحد أقصى.`,
      );
      return;
    }
    setErrorMsg('');
    setSelectedFiles((current) => [...current, ...next]);
  }

  function makeCoverImage(index: number) {
    if (index === 0) return;
    setSelectedFiles((current) => {
      const updated = [...current];
      const [target] = updated.splice(index, 1);
      if (target) updated.unshift(target);
      return updated;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMsg('');

    if (!isValidEgyptianPhone(phone)) {
      setErrorMsg('أدخل رقم هاتف مصري صحيحاً، مثال: 01012345678.');
      return;
    }
    const effectiveWhatsapp = whatsappSameAsPhone ? phone : whatsapp;
    if (effectiveWhatsapp && !isValidEgyptianPhone(effectiveWhatsapp)) {
      setErrorMsg('رقم واتساب غير صحيح، أدخل رقم مصري سليم أو استخدم رقم التواصل نفسه.');
      return;
    }
    if (!identity) {
      setErrorMsg('سجّل الدخول باستخدام Google قبل إرسال الطلب.');
      return;
    }

    if (mode === 'new') {
      if (title.trim().length < 2 || title.trim().length > 150) {
        setErrorMsg('اسم النشاط أو الإعلان يجب أن يكون بين حرفين و 150 حرفاً.');
        return;
      }

      if (isRealEstate) {
        if (!realEstateDraft.priceEgp || Number(realEstateDraft.priceEgp) <= 0) {
          setErrorMsg('أدخل سعراً صحيحاً وموجباً بالجنيه المصري.');
          return;
        }
        if (isRoomsFieldRequired(realEstateDraft.propertyType)) {
          const roomNum = Number(realEstateDraft.rooms);
          if (!realEstateDraft.rooms || Number.isNaN(roomNum) || roomNum < 0 || roomNum > 99) {
            setErrorMsg('أدخل عدد غرف منطقياً (بين 0 و 99).');
            return;
          }
        }
        if (!address.trim()) {
          setErrorMsg('العنوان وموقع العقار مطلوب بالتفصيل.');
          return;
        }
        if (!description.trim()) {
          setErrorMsg('وصف العقار ومواصفات التشطيب والمرافق مطلوبة.');
          return;
        }
      }

      if (currentTotalImages < minImages) {
        if (isRealEstate) {
          setErrorMsg(
            `يجب رفع من 5 إلى 7 صور للعقار قبل إرسال الطلب (أضف ${minImages - currentTotalImages} صور إضافية على الأقل).`,
          );
        } else {
          setErrorMsg('أضف صورة واحدة على الأقل للمكان أو المنيو قبل إرسال الطلب.');
        }
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const uploadResult = mode === 'new'
        ? await uploadOptimizedImages(
            selectedFiles,
            'requests',
            ({ current, total, stage }) => setProcessingMsg(
              stage === 'optimizing'
                ? `جاري تحسين الصورة ${current} من ${total} ${profile.labels.imageOptimizationHint}...`
                : `جاري رفع الصورة ${current} من ${total}...`,
            ),
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

      const realEstatePayload = isRealEstate
        ? {
            offerType: realEstateDraft.offerType,
            propertyType: realEstateDraft.propertyType,
            priceEgp: realEstateDraft.priceEgp,
            rooms: isRoomsFieldRequired(realEstateDraft.propertyType) ? (realEstateDraft.rooms || null) : null,
            bathrooms: realEstateDraft.bathrooms || null,
            areaSqm: realEstateDraft.areaSqm || null,
            floor: realEstateDraft.floor || null,
            furnishing: realEstateDraft.furnishing || null,
          }
        : null;

      const result = await submitAccountRequest(
        {
          kind: 'merchant',
          displayName: effectiveDisplayName,
          phone,
          whatsapp: effectiveWhatsapp,
          placeMode: mode,
          existingPlaceId: mode === 'existing'
            ? placesList.find(
                (place) =>
                  place.id === existingPlaceId
                  || `${place.title} — ${place.phone}` === existingPlaceId,
              )?.id || existingPlaceId
            : null,
          placeTitle: mode === 'new' ? title.trim() : null,
          placeCategory: mode === 'new' ? category : null,
          placeWhatsapp: mode === 'new' ? effectiveWhatsapp : null,
          placePayment: mode === 'new' && profile.features.hasPayment ? (payment || null) : null,
          placeDescription: mode === 'new' ? description.trim() : null,
          placeWhatsappGroupUrl: mode === 'new' && profile.features.hasCommunityLinks ? (whatsappGroupUrl || null) : null,
          placeTelegramUrl: mode === 'new' && profile.features.hasCommunityLinks ? (telegramUrl || null) : null,
          placeAddress: mode === 'new' ? address.trim() : null,
          placeMapUrl: mode === 'new' ? (mapUrl || null) : null,
          realEstateDetails: realEstatePayload,
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
                {isRealEstate ? (
                  <Home className="size-5" />
                ) : category === 'stores' ? (
                  <StoreIcon className="size-5" />
                ) : category === 'services' ? (
                  <Wrench className="size-5" />
                ) : (
                  <Building2 className="size-5" />
                )}
              </span>
              <div>
                <h2 className="text-lg font-black text-zinc-950">
                  {mode === 'new' && isRealEstate
                    ? 'إضافة إعلان عقار جديد'
                    : 'طلب حساب نشاط أو خدمة'}
                </h2>
                <p className="mt-0.5 text-xs font-normal text-zinc-500">
                  {mode === 'new' && isRealEstate
                    ? 'أضف مواصفات وتفاصيل العقار وصوره للتواصل المباشر.'
                    : 'اربط حسابك ببطاقة موجودة أو أضف نشاطك لأول مرة.'}
                </p>
              </div>
            </ModalHeader>

            <ModalBody>
              {isSuccess ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="size-14 text-emerald-600" />
                  <h3 className="text-xl font-black">تم إرسال الطلب بنجاح</h3>
                  <p className="max-w-md text-sm leading-7 text-zinc-600">
                    ستراجع الإدارة بيانات النشاط والتواصل. بعد الاعتماد ستظهر بطاقتك مباشرة
                    في الدليل ويمكنك تعديل بياناتها من لوحة التحكم.
                  </p>
                  {successWarning && (
                    <p className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      {successWarning}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button as="a" href="/share" variant="flat" className="font-bold">
                      ساعدنا في نشر ديرتك
                    </Button>
                    <Button onPress={onClose} className="bg-zinc-950 font-bold text-white">
                      تم
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  ref={formRef}
                  id="merchant-account-form"
                  onSubmit={handleSubmit}
                  className="space-y-5"
                  aria-describedby={errorMsg ? errorSummaryId : undefined}
                >
                  {errorMsg && (
                    <div
                      id={errorSummaryId}
                      role="alert"
                      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
                    >
                      {errorMsg}
                    </div>
                  )}
                  {processingMsg && (
                    <div
                      role="status"
                      className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800"
                    >
                      {processingMsg}
                    </div>
                  )}

                  {!isIdentityLoading && !identity ? (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-7 text-zinc-800">
                      <p className="font-black">اربط الطلب بحساب Google أولًا، ثم سنملأ اسمك تلقائيًا.</p>
                      <Link
                        href="/signin?next=%2Fonboarding"
                        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-zinc-950 px-4 font-black text-white"
                      >
                        المتابعة باستخدام Google
                      </Link>
                    </div>
                  ) : null}

                  {identity ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                      <p className="font-black text-emerald-900">حساب Google متصل</p>
                      <p className="truncate text-xs text-emerald-800">{identity.email}</p>
                    </div>
                  ) : null}

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
                      <div className="sm:col-span-2">
                        <Select
                          isRequired
                          label="تصنيف النشاط"
                          selectedKeys={[category]}
                          onSelectionChange={(keys) => handleCategoryChange(String(Array.from(keys)[0] ?? 'restaurants'))}
                        >
                          {CATEGORY_OPTIONS.filter((item) => item.id !== 'all').map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </Select>

                        {isRealEstate && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs font-semibold leading-5 text-blue-900">
                            <Sparkles className="mt-0.5 size-4 shrink-0 text-blue-600" />
                            <p>
                              <strong>نموذج العقارات:</strong> حدد نوع العرض (إيجار أو تمليك)، السعر، ومواصفات العقار. مطلوب رفع من <strong>5 إلى 7 صور</strong> واضحة.
                            </p>
                          </div>
                        )}
                        {profile.features.isStore && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs font-semibold leading-5 text-amber-900">
                            <StoreIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <p>
                              <strong>متجر ومنتجات:</strong> أضف صورًا حقيقية للمنتجات، أشهر الماركات، نطاق الأسعار، وطريقة الاستلام أو التوصيل.
                            </p>
                          </div>
                        )}
                        {profile.features.isRestaurantOrCafe && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs font-semibold leading-5 text-zinc-700">
                            <Utensils className="mt-0.5 size-4 shrink-0 text-orange-600" />
                            <p>
                              <strong>مطاعم ومأكولات:</strong> أضف صور المنيو وأبرز الأطباق ومواعيد العمل لسهولة الطلب.
                            </p>
                          </div>
                        )}
                        {profile.features.isLibraryOrService && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs font-semibold leading-5 text-zinc-700">
                            <Wrench className="mt-0.5 size-4 shrink-0 text-teal-600" />
                            <p>
                              <strong>خدمات ومكاتب:</strong> وضّح نوع الخدمات المقدمة ونماذج الأعمال ومواعيد استقبال العملاء.
                            </p>
                          </div>
                        )}
                      </div>

                      <Input
                        isRequired
                        name="placeTitle"
                        autoComplete="off"
                        label={isRealEstate ? 'عنوان الإعلان أو اسم العقار' : 'اسم المكان أو النشاط'}
                        placeholder={isRealEstate ? 'مثال: شقة للبيع 140م تشطيب سوبر لوكس حي الأشجار' : 'مثال: مطعم الأصيل'}
                        value={title}
                        onValueChange={setTitle}
                        className="sm:col-span-2"
                      />

                      {isRealEstate && (
                        <RealEstateListingFields
                          draft={realEstateDraft}
                          onChange={setRealEstateDraft}
                          disabled={isSubmitting}
                        />
                      )}

                      {profile.features.hasPayment && (
                        <Input
                          name="payment"
                          autoComplete="off"
                          label="Vodafone Cash / InstaPay (اختياري)"
                          placeholder="رقم فودافون كاش أو عنوان InstaPay"
                          value={payment}
                          onValueChange={setPayment}
                        />
                      )}

                      <div className="sm:col-span-2">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-sm font-bold text-zinc-800">
                            {profile.labels.description} {isRealEstate && <span className="text-rose-600">*</span>}
                          </label>
                          <span className="text-[11px] font-semibold text-zinc-400">
                            {description.length} / 2000
                          </span>
                        </div>
                        <Textarea
                          isRequired={isRealEstate}
                          name="description"
                          placeholder={profile.labels.descriptionPlaceholder}
                          value={description}
                          maxLength={2000}
                          onValueChange={setDescription}
                        />
                        {profile.labels.descriptionHelpText && (
                          <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                            {profile.labels.descriptionHelpText}
                          </p>
                        )}
                      </div>

                      <Textarea
                        isRequired={isRealEstate}
                        name="address"
                        autoComplete="street-address"
                        label={isRealEstate ? 'العنوان بالتفصيل' : 'العنوان (اختياري)'}
                        placeholder={isRealEstate ? 'المدينة، المنطقة، المجاورة، الشارع أو أقرب معلم...' : 'اكتب العنوان بالتفصيل...'}
                        value={address}
                        onValueChange={setAddress}
                        className={isRealEstate ? 'sm:col-span-2' : ''}
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
                        className={isRealEstate ? 'sm:col-span-2' : ''}
                      />

                      {profile.features.hasCommunityLinks && (
                        <>
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
                        </>
                      )}

                      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                          <div>
                            <h4 className="text-sm font-black text-zinc-950">
                              {profile.labels.images}
                            </h4>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {isRealEstate
                                ? 'مطلوب رفع 5 إلى 7 صور واضحة تشمل الغرف والتشطيب والمبنى.'
                                : 'أضف حتى 3 صور تعبر عن المكان والخدمة.'}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${
                            currentTotalImages < minImages
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {currentTotalImages} / {maxImages}
                          </span>
                        </div>

                        {currentTotalImages < minImages && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
                            أضف {minImages - currentTotalImages} {minImages - currentTotalImages === 1 ? 'صورة إضافية' : 'صور إضافية'} على الأقل للوصول للحد الأدنى ({minImages} صور).
                          </div>
                        )}

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={profile.imagePolicy.accept}
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
                          isDisabled={currentTotalImages >= maxImages}
                          className="w-full font-bold"
                        >
                          اختيار {profile.labels.images} ({currentTotalImages}/{maxImages})
                        </Button>

                        {uploadedImageUrls.length > 0 && (
                          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            تم رفع {uploadedImageUrls.length} صورة بنجاح وستُرفق بالطلب.
                          </p>
                        )}

                        {selectedFiles.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-zinc-600">
                              الصور المختارة (الصورة الأولى هي الغلاف الرئيسي):
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {selectedFiles.map((file, index) => {
                                const isCover = index === 0;
                                return (
                                  <div
                                    key={`${file.name}-${file.lastModified}-${index}`}
                                    className={`relative flex items-center justify-between rounded-xl border p-2.5 text-xs transition-all ${
                                      isCover
                                        ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500'
                                        : 'border-zinc-200 bg-zinc-50'
                                    }`}
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-500 shadow-xs">
                                        <ImageIcon className="size-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate font-bold text-zinc-800">{file.name}</p>
                                        {isCover ? (
                                          <span className="inline-flex items-center gap-1 font-black text-blue-700">
                                            <Star className="size-3 fill-blue-700 text-blue-700" />
                                            صورة الغلاف
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => makeCoverImage(index)}
                                            className="text-[11px] font-semibold text-zinc-500 hover:text-blue-600"
                                          >
                                            اجعلها الغلاف
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                                      aria-label={`حذف صورة ${file.name}`}
                                      onPress={() => setSelectedFiles((files) => files.filter((_, i) => i !== index))}
                                    >
                                      <X className="size-4 text-zinc-500 hover:text-rose-600" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                    <Input
                      isRequired
                      name="displayName"
                      autoComplete="name"
                      label="اسم صاحب أو مسؤول النشاط"
                      placeholder="الاسم الثلاثي أو الثنائي"
                      value={effectiveDisplayName}
                      onValueChange={setDisplayName}
                    />

                    <Input
                      isRequired
                      name="phone"
                      autoComplete="tel"
                      type="tel"
                      inputMode="tel"
                      label="رقم الهاتف الأساسي والتواصل"
                      placeholder="01012345678"
                      value={phone}
                      onValueChange={setPhone}
                    />

                    {/* WhatsApp Checkbox Toggle */}
                    <div className="sm:col-span-2 space-y-2">
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-zinc-800">
                        <input
                          type="checkbox"
                          checked={whatsappSameAsPhone}
                          onChange={(e) => setWhatsappSameAsPhone(e.target.checked)}
                          className="size-4 rounded-md border-zinc-300 text-zinc-950 focus:ring-zinc-950"
                        />
                        <span>رقم واتساب هو نفس رقم التواصل الأساسي</span>
                      </label>

                      {!whatsappSameAsPhone && (
                        <Input
                          name="whatsapp"
                          autoComplete="tel"
                          type="tel"
                          inputMode="tel"
                          label="رقم واتساب مخصص"
                          placeholder="مثال: 01112345678"
                          value={whatsapp}
                          onValueChange={setWhatsapp}
                        />
                      )}
                    </div>

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
                  isDisabled={isSubmitting || isIdentityLoading || !identity}
                  startContent={!isSubmitting && <Send className="size-4" />}
                  className="bg-zinc-950 font-black text-white hover:bg-zinc-800"
                >
                  {isSubmitting ? 'جاري الإرسال...' : isRealEstate ? 'إرسال إعلان العقار' : 'إرسال طلب الحساب'}
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
