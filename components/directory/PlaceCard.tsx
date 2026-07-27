'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Chip,
  Button,
  Image as HeroImage,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  useDisclosure,
} from '@heroui/react';
import { Phone, MessageCircle, Copy, Check, Star, CreditCard, Eye, Images, Heart, ExternalLink, X } from 'lucide-react';
import { Place } from '@/types';
import { formatWhatsAppUrl, formatPhoneForTel, getCategoryLabel } from '@/lib/utils';
import { ShareButton } from './ShareButton';
import { UpvoteButton } from './UpvoteButton';
import { useFavorites } from '@/hooks/useFavorites';

interface PlaceCardProps {
  place: Place;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({ place }) => {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCash, setCopiedCash] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const { isOpen: isImageOpen, onOpen: onOpenImage, onOpenChange: onImageOpenChange } = useDisclosure();
  const { isFavorite, toggleFavorite } = useFavorites();

  const hasImages = place.images && place.images.length > 0;

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(place.phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch (err) {
      console.error('Failed to copy phone number: ', err);
    }
  };

  const handleCopyCash = async () => {
    if (!place.instapay_vfcash) return;
    try {
      await navigator.clipboard.writeText(place.instapay_vfcash);
      setCopiedCash(true);
      setTimeout(() => setCopiedCash(false), 2000);
    } catch (err) {
      console.error('Failed to copy cash number: ', err);
    }
  };

  const handleOpenImage = (index: number) => {
    setSelectedImageIndex(index);
    onOpenImage();
  };

  return (
    <>
      <Card
        shadow="none"
        className="soft-card group flex w-full max-w-full flex-col overflow-hidden p-0"
      >
        <div>
          <CardHeader className="flex flex-col items-start gap-1.5 p-3 pb-2 sm:p-3.5 sm:pb-2">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-1">
                <Chip
                  size="sm"
                  variant="flat"
                  radius="sm"
                  className="h-6 border border-zinc-200/60 bg-zinc-100 px-2 text-[11px] font-medium text-zinc-600 dark:border-zinc-700/60 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {getCategoryLabel(place.category)}
                </Chip>

                {place.is_featured && (
                  <Chip
                    size="sm"
                    variant="solid"
                    radius="sm"
                    startContent={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                    className="bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold text-[10px] h-6 border border-amber-300/30"
                  >
                    مميز
                  </Chip>
                )}
              </div>

              <div className="flex shrink-0 items-center">
                <UpvoteButton placeId={place.id} initialCount={place.recommend_count || 0} />
                <ShareButton title={place.title} phone={place.phone} />
                <Tooltip content={isFavorite(place.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'} placement="top">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onClick={() => toggleFavorite(place.id)}
                    aria-label="تبديل المفضلة"
                    className="size-11 min-w-11 bg-transparent p-0 transition-colors hover:bg-transparent"
                  >
                    <Heart
                      className={`size-4 transition-all ${
                        isFavorite(place.id)
                          ? 'scale-110 fill-rose-800 text-rose-800'
                          : 'text-zinc-400'
                      }`}
                    />
                  </Button>
                </Tooltip>
              </div>
            </div>

            <h3 className="text-base font-bold leading-snug text-zinc-900 transition-colors group-hover:text-zinc-700 dark:text-white dark:group-hover:text-zinc-200 sm:text-lg">
              {place.title}
            </h3>
          </CardHeader>

          {hasImages && (
            <div className="px-3 pb-1 sm:px-3.5">
              <button
                type="button"
                onClick={() => handleOpenImage(0)}
                aria-label={`تكبير صور ${place.title}`}
                className="group/image relative block aspect-[16/9] w-full overflow-hidden rounded-xl bg-zinc-100 text-white dark:bg-zinc-800"
              >
                <HeroImage
                  loading="lazy"
                  src={place.images[0]}
                  alt={`${place.title} صورة المنيو`}
                  draggable={false}
                  classNames={{
                    wrapper: "block h-full w-full",
                    img: "h-full w-full object-cover transition-transform duration-300 group-hover/image:scale-[1.02]",
                  }}
                  radius="none"
                />
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/0 transition-colors group-hover/image:bg-zinc-950/25">
                  <span className="flex items-center gap-1 rounded-full bg-zinc-950/70 px-2.5 py-1.5 text-[11px] font-bold opacity-0 backdrop-blur-sm transition-opacity group-hover/image:opacity-100">
                    <Eye className="size-3.5" />
                    تكبير
                  </span>
                </div>
                <span className="absolute bottom-2 start-2 z-20 flex items-center gap-1 rounded-full bg-zinc-950/75 px-2.5 py-1.5 text-[11px] font-bold backdrop-blur-sm">
                  <Images className="size-3.5" />
                  {place.images.length} {place.images.length === 1 ? 'صورة' : 'صور'}
                </span>
              </button>
            </div>
          )}

          <CardBody className="space-y-2 p-3 pt-2 sm:px-3.5">
            {place.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {place.description}
              </p>
            )}

            {place.instapay_vfcash && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/60 bg-zinc-50 p-2 text-xs dark:border-zinc-700/60 dark:bg-zinc-800/60">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                  <CreditCard className="size-3.5 shrink-0 text-zinc-600" />
                  <span className="shrink-0">كاش / InstaPay</span>
                  <span className="dir-ltr truncate font-mono">{place.instapay_vfcash}</span>
                </div>
                <Tooltip content={copiedCash ? 'تم النسخ' : 'نسخ الرقم'} placement="top">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    onClick={handleCopyCash}
                    aria-label="نسخ رقم الدفع"
                    className="size-11 min-w-11 shrink-0 rounded-lg bg-zinc-200/70 font-bold text-zinc-700 dark:bg-zinc-700/70 dark:text-zinc-200"
                  >
                    {copiedCash ? <Check className="size-3.5 text-zinc-900" /> : <Copy className="size-3.5" />}
                  </Button>
                </Tooltip>
              </div>
            )}
          </CardBody>
        </div>

        <CardFooter className="mt-auto flex gap-2 border-t border-zinc-100 bg-zinc-50/30 p-3 pt-2.5 dark:border-zinc-800/60 dark:bg-zinc-900/50">
          <Tooltip content={copiedPhone ? 'تم النسخ' : 'نسخ هاتف المكان'} placement="top">
            <Button
              isIconOnly
              size="md"
              variant="flat"
              onClick={handleCopyPhone}
              aria-label="نسخ الرقم"
              className={`size-11 min-w-11 rounded-xl font-bold ${
                copiedPhone
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-200/70 text-zinc-700 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {copiedPhone ? <Check className="size-4 text-zinc-900" /> : <Copy className="size-4" />}
            </Button>
          </Tooltip>

          <Button
            size="md"
            variant="flat"
            as="a"
            href={formatWhatsAppUrl(place.whatsapp || place.phone, `مرحباً، استفسار عبر خدمات الكيان عن: ${place.title}`)}
            target="_blank"
            rel="noopener noreferrer"
            startContent={<MessageCircle className="size-4" />}
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-900 hover:bg-zinc-200"
          >
            واتساب
          </Button>

          <Button
            size="md"
            as="a"
            href={`tel:${formatPhoneForTel(place.phone)}`}
            startContent={<Phone className="size-4 fill-current" />}
            className="flex-1 rounded-xl bg-zinc-900 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            اتصال
          </Button>
        </CardFooter>
      </Card>

      {hasImages && (
        <Modal
          isOpen={isImageOpen}
          onOpenChange={onImageOpenChange}
          size="3xl"
          placement="center"
          backdrop="blur"
          radius="lg"
          classNames={{
            base: "h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-white sm:h-auto sm:max-w-3xl",
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 sm:px-4">
                  <span className="min-w-0 truncate text-xs font-bold">
                    {place.title} ({selectedImageIndex + 1} من {place.images.length})
                  </span>
                  <div className="flex shrink-0 items-center">
                    <Button
                      isIconOnly
                      as="a"
                      href={place.images[selectedImageIndex]}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="فتح الصورة بالحجم الكامل"
                      className="size-11 min-w-11 bg-transparent p-0 text-zinc-300 hover:text-white"
                    >
                      <ExternalLink className="size-4" />
                    </Button>
                    <Button
                      isIconOnly
                      onClick={onClose}
                      aria-label="إغلاق الصور"
                      className="size-11 min-w-11 bg-transparent p-0 text-zinc-300 hover:text-white"
                    >
                      <X className="size-5" />
                    </Button>
                  </div>
                </ModalHeader>
                <ModalBody className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-2 sm:p-3">
                  {/* Approved directory images come from dynamic Supabase URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={place.images[selectedImageIndex]}
                    alt={`${place.title} المنيو`}
                    draggable={false}
                    className="max-h-[calc(100dvh-9rem)] max-w-full select-none rounded-xl object-contain shadow-2xl sm:max-h-[72vh]"
                    style={{ touchAction: 'pinch-zoom' }}
                  />
                  {place.images.length > 1 && (
                    <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto px-1 pt-3">
                      {place.images.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedImageIndex(i)}
                          aria-label={`عرض الصورة ${i + 1}`}
                          className={`size-12 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                            i === selectedImageIndex ? 'scale-105 border-white' : 'border-zinc-700 opacity-60'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </ModalBody>
              </>
            )}
          </ModalContent>
        </Modal>
      )}
    </>
  );
};
