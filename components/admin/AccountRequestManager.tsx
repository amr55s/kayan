'use client';

import { useState, useTransition } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { Bike, Building2, Check, Link2, X } from 'lucide-react';
import {
  approveAccountRequest,
  rejectAccountRequest,
} from '@/lib/operations/actions';
import { formatCairoDateTime } from '@/lib/format-date';
import type { AccountRequest, Place } from '@/types';

export function AccountRequestManager({
  requests,
  places,
  onRefresh,
  onMessage,
}: {
  requests: AccountRequest[];
  places: Place[];
  onRefresh: () => void;
  onMessage: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  function approve(request: AccountRequest) {
    startTransition(async () => {
      try {
        const result = await approveAccountRequest(request.id);
        if (!result.success) {
          onMessage(result.message);
          return;
        }
        onMessage(
          request.kind === 'driver'
            ? 'تم اعتماد حساب الكابتن وربطه ببطاقته.'
            : 'تم اعتماد حساب النشاط وربطه بالمكان.',
        );
        setApprovingId(null);
        onRefresh();
      } catch (error) {
        console.error('Approve account request failed:', error);
        onMessage('انقطع الاتصال بعد تنفيذ الطلب. جاري تحديث البيانات للتحقق من النتيجة.');
        onRefresh();
      }
    });
  }

  function reject(request: AccountRequest) {
    startTransition(async () => {
      try {
        const result = await rejectAccountRequest(request.id, reason);
        if (!result.success) {
          onMessage(result.message);
          return;
        }
        setRejectingId(null);
        setReason('');
        onMessage('تم رفض الطلب وحذف بيانات الدخول المعلقة.');
        onRefresh();
      } catch (error) {
        console.error('Reject account request failed:', error);
        onMessage('انقطع الاتصال بعد تنفيذ الطلب. جاري تحديث البيانات للتحقق من النتيجة.');
        onRefresh();
      }
    });
  }

  return (
    <Card className="border border-zinc-200">
      <Card.Header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black">طلبات حسابات الكباتن والأنشطة</h2>
          <p className="mt-1 text-xs font-normal text-zinc-500">
            الموافقة تنشئ الملف التشغيلي وتربطه بالبطاقة القديمة عند وجودها.
          </p>
        </div>
        <Chip className="bg-zinc-950 text-white">{pendingRequests.length} معلق</Chip>
      </Card.Header>
      <Card.Content className="gap-3">
        {pendingRequests.length ? (
          pendingRequests.map((request) => {
            const place = request.existing_place_id
              ? places.find((item) => item.id === request.existing_place_id)
              : null;
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {request.kind === 'driver' ? (
                        <Bike className="size-5" />
                      ) : (
                        <Building2 className="size-5" />
                      )}
                      <h3 className="font-black">{request.display_name}</h3>
                      <Chip size="sm" variant="secondary">
                        {request.kind === 'driver' ? 'كابتن' : 'نشاط'}
                      </Chip>
                      {request.legacy_driver_id && (
                        <Chip size="sm" className="bg-emerald-100 text-emerald-800">
                          <Link2 className="me-1 size-3" />
                          بطاقة كابتن قديمة
                        </Chip>
                      )}
                    </div>
                    <p className="dir-ltr mt-2 text-right font-mono text-sm text-zinc-600">
                      {request.phone}
                    </p>
                    {request.kind === 'merchant' && (
                      <p className="mt-1 text-sm text-zinc-600">
                        {request.place_mode === 'existing'
                          ? `ربط: ${place?.title ?? 'مكان موجود'}`
                          : `خدمة جديدة: ${request.place_title ?? ''}`}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatCairoDateTime(request.created_at)}
                    </p>
                  </div>

                  {approvingId === request.id ? (
                    <div className="flex flex-col items-start gap-2">
                      <p className="text-sm font-bold">
                        تأكيد تفعيل حساب {request.display_name}؟
                      </p>
                      <div className="flex gap-2">
                        <Button
                          isPending={pending}
                          onPress={() => approve(request)}
                          className="bg-zinc-950 font-bold text-white"
                        >
                          نعم، تفعيل الحساب
                        </Button>
                        <Button
                          variant="secondary"
                          onPress={() => setApprovingId(null)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  ) : rejectingId === request.id ? (
                    <div className="flex w-full flex-col gap-2 lg:max-w-md">
                      <TextField fullWidth className="space-y-1.5">
                        <Label className="text-sm font-bold text-zinc-800">سبب الرفض (اختياري)</Label>
                        <Input value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10" />
                      </TextField>
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          isPending={pending}
                          onPress={() => reject(request)}
                        >
                          تأكيد الرفض
                        </Button>
                        <Button
                          variant="secondary"
                          onPress={() => {
                            setRejectingId(null);
                            setReason('');
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        isPending={pending}
                        onPress={() => {
                          setRejectingId(null);
                          setApprovingId(request.id);
                        }}
                        className="bg-zinc-950 font-bold text-white"
                      >
                        {!pending && <Check className="size-4" aria-hidden="true" />}
                        موافقة وتفعيل
                      </Button>
                      <Button
                        variant="danger-soft"
                        onPress={() => setRejectingId(request.id)}
                      >
                        <X className="size-4" aria-hidden="true" />
                        رفض
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-xl bg-zinc-50 p-8 text-center text-sm text-zinc-500">
            لا توجد طلبات حسابات معلقة.
          </p>
        )}
      </Card.Content>
    </Card>
  );
}
