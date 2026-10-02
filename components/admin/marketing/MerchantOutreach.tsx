'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Check, Copy, MessageCircle, Store } from 'lucide-react';
import type { MarketingCampaign, Place } from '@/types';
import { SITE_URL } from '@/lib/marketing/content';
import {
  outreachMessage,
  trackedUrl,
  type PlaceEngagement,
} from '@/lib/marketing/playbook';
import {
  prepareMarketingCampaign,
  recordMarketingPublication,
} from '@/lib/marketing/admin-actions';
import { formatCairoDate } from '@/lib/format-date';
import { formatWhatsAppUrl, isValidEgyptianPhone } from '@/lib/utils';

const DAILY_BATCH = 5;
const FOLLOW_UP_AFTER_MS = 3 * 86_400_000;

type CampaignEvents = { campaignKey: string; visits: number };

/** Stable per-place code so link opens are attributed without a stored row. */
function outreachRef(placeId: string): string {
  return `o-${placeId.replaceAll('-', '').slice(0, 16)}`;
}

export function MerchantOutreach({
  today,
  places,
  claimedPlaceIds,
  engagement,
  campaigns,
  campaignEvents,
  channelId,
  onMessage,
}: {
  today: string;
  places: Place[];
  /** Places already linked to a merchant store. */
  claimedPlaceIds: string[];
  engagement: Record<string, PlaceEngagement>;
  campaigns: MarketingCampaign[];
  campaignEvents: CampaignEvents[];
  channelId: string;
  onMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [contactedNow, setContactedNow] = useState<Set<string>>(new Set());
  const now = useMemo(() => new Date(`${today}T12:00:00Z`).getTime(), [today]);

  const rows = useMemo(() => {
    const claimed = new Set(claimedPlaceIds);
    const visits = new Map(campaignEvents.map((item) => [item.campaignKey, item.visits]));
    return places
      .filter((place) => !claimed.has(place.id))
      .map((place) => {
        const campaign = campaigns.find((item) =>
          item.channel_id === channelId
          && item.entity_type === 'place'
          && item.entity_id === place.id
          && item.template_key === 'merchant_invite');
        const ref = outreachRef(place.id);
        const contactedAt = campaign?.status === 'published' ? campaign.last_published_at : null;
        const stats = engagement[place.id];
        const number = [place.whatsapp, place.phone].find(
          (value) => value && isValidEgyptianPhone(value),
        ) || '';
        const stage = contactedAt ? 'follow_up' as const : 'first' as const;
        return {
          place,
          campaign,
          contactedAt,
          stats,
          number,
          linkVisits: visits.get(ref) ?? 0,
          followUpDue: Boolean(contactedAt)
            && now - Date.parse(contactedAt as string) > FOLLOW_UP_AFTER_MS
            && !(visits.get(ref) ?? 0),
          message: outreachMessage({
            placeTitle: place.title,
            stats,
            url: trackedUrl(SITE_URL, '/guide', ref),
            stage,
          }),
        };
      })
      .sort((left, right) =>
        Number(Boolean(left.contactedAt)) - Number(Boolean(right.contactedAt))
        || (right.stats?.opens ?? 0) + (right.stats?.actions ?? 0)
          - ((left.stats?.opens ?? 0) + (left.stats?.actions ?? 0)));
  }, [campaignEvents, campaigns, channelId, claimedPlaceIds, engagement, now, places]);

  const pending = rows.filter((row) => !row.contactedAt);
  const followUps = rows.filter((row) => row.followUpDue);
  const visible = showAll ? rows : [...pending.slice(0, DAILY_BATCH), ...followUps];

  const markContacted = async (row: (typeof rows)[number]) => {
    if (!channelId) {
      onMessage('اختر مسار محتوى نشطًا أولًا لتسجيل التواصل.');
      return;
    }
    setContactedNow((current) => new Set(current).add(row.place.id));
    const prepared = row.campaign
      ? { success: true as const, data: row.campaign }
      : await prepareMarketingCampaign({
          channelId,
          entityType: 'place',
          entityId: row.place.id,
          templateKey: 'merchant_invite',
        });
    if (!prepared.success) {
      onMessage(prepared.message);
      return;
    }
    const result = await recordMarketingPublication(prepared.data.id);
    onMessage(result.success ? `تم تسجيل التواصل مع ${row.place.title}.` : result.message);
    if (result.success) router.refresh();
  };

  const copy = async (row: (typeof rows)[number]) => {
    try {
      await navigator.clipboard.writeText(row.message);
      setCopied(row.place.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      onMessage('تعذر النسخ تلقائيًا. حدّد النص وانسخه يدويًا.');
    }
  };

  return (
    <Card className="border border-zinc-200">
      <Card.Header className="flex flex-col items-stretch gap-3 border-b border-zinc-100 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-black">
            <Store className="size-5" aria-hidden="true" />
            دعوة التجار مباشرة
          </h2>
          <p className="mt-1 text-xs leading-6 text-zinc-500">
            أماكن موجودة في الدليل ولم تفتح متجرًا بعد. {DAILY_BATCH} رسائل يوميًا تكفي وتحافظ على رقمك من الحظر.
          </p>
        </div>
        <div className="flex gap-2 text-center text-xs">
          <div className="rounded-xl bg-zinc-50 px-3 py-2"><b className="block text-lg">{pending.length}</b>لم يُراسل</div>
          <div className="rounded-xl bg-zinc-50 px-3 py-2"><b className="block text-lg">{rows.length - pending.length}</b>تمت دعوته</div>
          <div className="rounded-xl bg-zinc-950 px-3 py-2 text-white"><b className="block text-lg">{followUps.length}</b>متابعة</div>
        </div>
      </Card.Header>
      <Card.Content className="space-y-3">
        {visible.map((row) => {
          const contacted = Boolean(row.contactedAt) || contactedNow.has(row.place.id);
          return (
            <article key={row.place.id} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-black">{row.place.title}</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.stats
                      ? `${row.stats.opens} فتح و${row.stats.actions} تواصل آخر 30 يوم`
                      : 'لا يوجد تفاعل مسجل بعد'}
                    {row.contactedAt ? ` · آخر تواصل ${formatCairoDate(row.contactedAt)}` : ''}
                    {row.linkVisits ? ` · فتح الرابط ${row.linkVisits} مرة` : ''}
                  </p>
                </div>
                <Chip className={contacted
                  ? row.followUpDue ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                  : 'bg-zinc-100 text-zinc-700'}
                >
                  {contacted ? (row.followUpDue ? 'يحتاج متابعة' : 'تمت الدعوة') : 'جديد'}
                </Chip>
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-3 font-sans text-xs leading-6 text-zinc-700">
                {row.message}
              </pre>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {row.number ? (
                  <a
                    href={formatWhatsAppUrl(row.number, row.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { void markContacted(row); }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    {row.contactedAt ? 'أرسل رسالة المتابعة' : 'أرسل الدعوة'}
                  </a>
                ) : (
                  <Button onPress={() => { void markContacted(row); }} className="min-h-11 bg-zinc-950 font-bold text-white">
                    <Check className="size-4" aria-hidden="true" />
                    سجّل أنك تواصلت معه
                  </Button>
                )}
                <Button onPress={() => { void copy(row); }} className="min-h-11 bg-zinc-100 font-bold text-zinc-900">
                  {copied === row.place.id
                    ? <Check className="size-4" aria-hidden="true" />
                    : <Copy className="size-4" aria-hidden="true" />}
                  {copied === row.place.id ? 'تم النسخ' : 'نسخ الرسالة'}
                </Button>
              </div>
              {!row.number && (
                <p className="mt-2 text-xs text-zinc-500">
                  لا يوجد رقم موبايل صالح لهذا المكان؛ انسخ الرسالة وأرسلها بالطريقة المتاحة.
                </p>
              )}
            </article>
          );
        })}
        {!visible.length && (
          <p className="rounded-2xl bg-zinc-50 p-5 text-sm font-semibold text-zinc-500">
            {rows.length
              ? 'تمت دعوة كل الأماكن غير المرتبطة بمتجر. المتابعات تظهر هنا بعد ٣ أيام من الدعوة.'
              : 'كل الأماكن في الدليل مرتبطة بمتاجر. أضف أماكن جديدة للدليل لتظهر هنا.'}
          </p>
        )}
        {rows.length > visible.length || showAll ? (
          <Button onPress={() => setShowAll((value) => !value)} className="w-full bg-zinc-100 font-bold text-zinc-900">
            {showAll ? 'عرض دفعة اليوم فقط' : `عرض الكل (${rows.length})`}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}
