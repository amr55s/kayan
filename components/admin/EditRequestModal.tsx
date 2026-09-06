'use client';

import React, { useState, useEffect } from 'react';
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
  const [errorMsg, setErrorMsg] = useState('');
  const modalState = useOverlayState({ isOpen, onOpenChange });

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
      setErrorMsg('');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [request]);

  if (!request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

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

    try {
      const res = await serverEditAndApproveRequest(request.id, updatedData);
      if (!res.success) {
        setErrorMsg(res.message || 'حدث خطأ أثناء تعديل وتفعيل الطلب.');
        return;
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Edit and approve request failed:', error);
      setErrorMsg('انقطع الاتصال أثناء تحديث الشاشة. جاري التحقق من نتيجة العملية.');
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal state={modalState}>
      <Modal.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
        <Modal.Container placement="center" size="lg" scroll="inside" className="p-3">
          <Modal.Dialog aria-label="تعديل بيانات الطلب ونشره" dir="rtl" className="border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <Modal.Header className="flex items-center gap-2 border-b border-zinc-100 pb-3 text-lg font-bold text-zinc-900 dark:border-zinc-800 dark:text-white">
              <Edit className="w-5 h-5 text-zinc-900 dark:text-white" />
              <Modal.Heading>تعديل بيانات الطلب ونشره في ديرتك</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="space-y-4 py-4">
              {errorMsg && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                  {errorMsg}
                </p>
              )}
              <form id="edit-request-form" onSubmit={handleSubmit} className="space-y-4">
                <TextField fullWidth isRequired className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">اسم المكان / الخدمة</Label>
                  <Input required value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900" />
                </TextField>

                <Select
                  isRequired
                  selectedKey={category}
                  onSelectionChange={(key) => setCategory(String(key))}
                >
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">التصنيف</Label>
                  <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900"><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl"><ListBox>{CATEGORY_OPTIONS.map((c) => <ListBox.Item key={c.id} id={c.id} textValue={c.label} className="rounded-lg px-3 py-2 data-[focused]:bg-zinc-100 data-[selected]:font-bold">{c.label}</ListBox.Item>)}</ListBox></Select.Popover>
                </Select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField fullWidth isRequired className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">رقم تشغيلي داخلي</Label>
                    <Input required value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900" />
                  </TextField>
                </div>

                <TextField fullWidth className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">الوصف</Label>
                  <TextArea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="min-h-24 w-full rounded-xl border border-zinc-300 bg-white p-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900" />
                </TextField>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200">
                    تمييز المكان في أعلى النتائج (Featured)
                  </span>
                  <Switch size="sm" isSelected={isFeatured} onChange={setIsFeatured} aria-label="تمييز المكان">
                    <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
                  </Switch>
                </div>
              </form>
            </Modal.Body>

            <Modal.Footer className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <Button variant="secondary" onPress={modalState.close} isDisabled={isSubmitting} className="h-11 font-semibold">
                إلغاء
              </Button>
              <Button
                type="submit"
                form="edit-request-form"
                variant="primary"
                isPending={isSubmitting}
                className="min-h-[44px] bg-zinc-900 px-6 text-xs font-bold text-white hover:bg-zinc-800"
              >
                {!isSubmitting && <Check className="w-4 h-4" aria-hidden="true" />}
                تعديل وتفعيل الآن
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
