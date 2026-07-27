'use client';

import React, { useState, useEffect } from 'react';
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
} from '@heroui/react';
import { Edit, Check } from 'lucide-react';
import { PendingRequest } from '@/types';
import { serverEditAndApproveRequest } from '@/lib/supabase/admin-actions';
import { CATEGORY_OPTIONS } from '@/lib/categories';

interface EditRequestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  request: PendingRequest | null;
  onSuccess: () => void;
}

export const EditRequestModal: React.FC<EditRequestModalProps> = ({
  isOpen,
  onOpenChange,
  request,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('restaurants');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instapayVfcash, setInstapayVfcash] = useState('');
  const [description, setDescription] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!request) return;
      setTitle(request.title || '');
      setCategory((request.category as string) || 'restaurants');
      setPhone(request.phone || '');
      setWhatsapp(request.whatsapp || '');
      setInstapayVfcash(request.instapay_vfcash || '');
      setDescription(request.description || '');
      setIsFeatured(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [request]);

  if (!request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const updatedData = {
      title: title.trim(),
      category,
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || null,
      instapay_vfcash: instapayVfcash.trim() || null,
      description: description.trim() || null,
      images: request.images || [],
      is_featured: isFeatured,
    };

    const res = await serverEditAndApproveRequest(request.id, updatedData);
    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onOpenChange(false);
    } else {
      alert(res.message || 'حدث خطأ أثناء تعديل وتفعيل الطلب.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="xl"
      placement="center"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 dir-rtl",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-lg border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <Edit className="w-5 h-5 text-zinc-900 dark:text-white" />
              <span>تعديل بيانات الطلب ونشره في خدمات الكيان</span>
            </ModalHeader>

            <ModalBody className="py-4 space-y-4">
              <form id="edit-request-form" onSubmit={handleSubmit} className="space-y-4">
                <Input
                  isRequired
                  labelPlacement="outside"
                  label="اسم المكان / الخدمة"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    isRequired
                    labelPlacement="outside"
                    label="رقم الهاتف"
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
                    label="رقم الواتساب"
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

                <Input
                  labelPlacement="outside"
                  label="فودافون كاش / InstaPay"
                  value={instapayVfcash}
                  onValueChange={setInstapayVfcash}
                  variant="bordered"
                  type="tel"
                  size="md"
                  classNames={{
                    label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                    inputWrapper: "h-11 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                  }}
                />

                <Textarea
                  labelPlacement="outside"
                  label="الوصف"
                  value={description}
                  onValueChange={setDescription}
                  variant="bordered"
                  minRows={3}
                  classNames={{
                    label: "font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-1",
                    inputWrapper: "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900",
                  }}
                />

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200">
                    تمييز المكان في أعلى النتائج (Featured)
                  </span>
                  <Switch
                    size="sm"
                    color="primary"
                    isSelected={isFeatured}
                    onValueChange={setIsFeatured}
                  />
                </div>
              </form>
            </ModalBody>

            <ModalFooter className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <Button variant="flat" color="default" onClick={onClose} disabled={isSubmitting} className="h-11 font-semibold">
                إلغاء
              </Button>
              <Button
                type="submit"
                form="edit-request-form"
                color="success"
                variant="solid"
                isLoading={isSubmitting}
                startContent={!isSubmitting && <Check className="w-4 h-4" />}
                className="min-h-[44px] bg-zinc-900 px-6 text-xs font-bold text-white hover:bg-zinc-800"
              >
                تعديل وتفعيل الآن
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
