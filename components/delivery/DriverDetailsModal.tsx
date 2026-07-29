'use client';

import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Bike, MessageCircle, Phone, Share2, X } from 'lucide-react';
import type { Driver } from '@/types';
import { formatPhoneForTel, formatWhatsAppUrl } from '@/lib/utils';
import { shareDirectoryItem } from '@/lib/share';
import { trackSiteEvent } from '@/lib/analytics/client';

export function DriverDetailsModal({
  driver,
  isOpen,
  onOpenChange,
}: {
  driver: Driver | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!driver) return null;
  const name = driver.name?.trim() || 'كابتن توصيل';
  const pageUrl = typeof window === 'undefined'
    ? `/?driver=${driver.id}`
    : new URL(`/?driver=${driver.id}`, window.location.origin).toString();

  const share = async () => {
    const completed = await shareDirectoryItem(name, pageUrl, 'كابتن توصيل داخل المنطقة — تواصل مباشر بدون وسيط');
    if (completed) {
      trackSiteEvent('share_click', { targetType: 'driver', targetKey: driver.id });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="lg"
      scrollBehavior="inside"
      classNames={{
        base: 'mx-3 overflow-hidden rounded-[28px] border border-zinc-200 bg-white sm:mx-0',
        backdrop: 'bg-zinc-950/60 backdrop-blur-sm',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center justify-between gap-3 border-b border-zinc-100 p-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{name}</p>
                <p className="mt-1 text-xs font-semibold text-zinc-500">بطاقة كابتن التوصيل</p>
              </div>
              <div className="flex gap-1">
                <Button isIconOnly variant="light" aria-label="مشاركة الكابتن" onPress={share}>
                  <Share2 className="size-5" />
                </Button>
                <Button isIconOnly variant="light" aria-label="إغلاق تفاصيل الكابتن" onPress={onClose}>
                  <X className="size-5" />
                </Button>
              </div>
            </ModalHeader>
            <ModalBody className="gap-5 p-5">
              <div className="rounded-3xl bg-zinc-950 p-6 text-white">
                <div className="flex size-16 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900">
                  <Bike className="size-8" />
                </div>
                <h1 className="mt-5 text-2xl font-black">{name}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip className="border border-zinc-700 bg-zinc-900 text-white">
                    {driver.vehicle_type || 'نوع المركبة غير محدد'}
                  </Chip>
                  <Chip className={driver.is_available
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-300'}
                  >
                    {driver.is_available ? 'متاح الآن' : 'غير متاح حاليًا'}
                  </Chip>
                </div>
                <p className="dir-ltr mt-5 text-right font-mono text-lg text-zinc-200">{driver.phone}</p>
              </div>
              <p className="text-sm leading-7 text-zinc-600">
                التواصل مباشر مع الكابتن. اتفقوا على تفاصيل الطلب والتكلفة قبل بدء التوصيل.
              </p>
            </ModalBody>
            <ModalFooter className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-4">
              <Button
                as="a"
                href={formatWhatsAppUrl(
                  driver.whatsapp || driver.phone,
                  'السلام عليكم، محتاج توصيل طلب دليفري عبر كيان سيتي سبوت',
                )}
                target="_blank"
                rel="noopener noreferrer"
                startContent={<MessageCircle className="size-5" />}
                onPress={() => trackSiteEvent('whatsapp_click', {
                  targetType: 'driver',
                  targetKey: driver.id,
                })}
                className="min-h-12 bg-emerald-600 font-black text-white"
              >
                WhatsApp
              </Button>
              <Button
                as="a"
                href={`tel:${formatPhoneForTel(driver.phone)}`}
                startContent={<Phone className="size-5" />}
                onPress={() => trackSiteEvent('phone_click', {
                  targetType: 'driver',
                  targetKey: driver.id,
                })}
                className="min-h-12 bg-zinc-950 font-black text-white"
              >
                اتصال
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
