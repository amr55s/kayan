'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import {
  BarChart3,
  Check,
  Copy,
  Download,
} from 'lucide-react';
import type {
  Driver,
  MarketingCampaign,
  MarketingChannel,
  MarketingEntityType,
  MarketingTemplateKey,
  Place,
} from '@/types';
import {
  marketingIdeas,
  marketingText,
  marketingTemplateLabels,
} from '@/lib/marketing/content';
import { formatCairoDate } from '@/lib/format-date';
import {
  prepareMarketingCampaign,
  recordMarketingPublication,
} from '@/lib/marketing/admin-actions';

type QueueItem = {
  key: string;
  entityType: 'place' | 'driver';
  entityId: string;
  templateKey: 'new_place' | 'new_driver';
  title: string;
  subtitle: string;
  createdAt: string;
  place?: Place;
  driver?: Driver;
};

function cardUrl(campaign: MarketingCampaign, preview = false): string {
  const params = new URLSearchParams({
    type: campaign.entity_type,
    template: campaign.template_key,
    ref: campaign.campaign_code,
  });
  if (campaign.entity_id) params.set('id', campaign.entity_id);
  if (preview) params.set('preview', '1');
  return `/api/marketing-card?${params.toString()}`;
}

function CampaignPreview({
  campaign,
  place,
  driver,
  channel,
  onMessage,
}: {
  campaign: MarketingCampaign;
  place?: Place;
  driver?: Driver;
  channel: MarketingChannel;
  onMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [published, setPublished] = useState(campaign.status === 'published');
  const [pending, startTransition] = useTransition();
  const text = marketingText({
    templateKey: campaign.template_key,
    campaignCode: campaign.campaign_code,
    place,
    driver,
  });
  const imageUrl = cardUrl(campaign);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onMessage('تعذر النسخ تلقائيًا. حدّد النص من المعاينة وانسخه يدويًا.');
    }
  };

  const markPublished = () => {
    startTransition(async () => {
      const result = await recordMarketingPublication(campaign.id);
      onMessage(result.message);
      if (result.success) {
        setPublished(true);
        router.refresh();
      }
    });
  };

  return (
    <Card className="overflow-hidden border-2 border-zinc-950">
      <Card.Header className="flex flex-col items-stretch gap-2 border-b border-zinc-200 bg-zinc-950 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black">الحملة جاهزة لـ {channel.name}</p>
          <p className="mt-1 text-xs text-zinc-300">انسخ النص أو نزّل البطاقة، ثم سجّل حالة المحتوى من داخل الموقع.</p>
        </div>
        <Chip className={published
          ? 'bg-emerald-500/20 text-emerald-200'
          : 'bg-amber-500/20 text-amber-200'}
        >
          {published ? 'تم النشر' : 'لم تُنشر'}
        </Chip>
      </Card.Header>
      <Card.Content className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
        <Image
          src={cardUrl(campaign, true)}
          alt="معاينة بطاقة الحملة"
          width={1080}
          height={1080}
          unoptimized
          className="aspect-square w-full rounded-3xl border border-zinc-200 object-cover"
        />
        <div className="flex min-w-0 flex-col gap-4">
          <pre className="min-h-32 whitespace-pre-wrap break-words rounded-2xl bg-zinc-100 p-4 font-sans text-sm leading-7 text-zinc-800">
            {text}
          </pre>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Button onPress={copy} className="font-bold">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? 'تم النسخ' : 'نسخ النص'}
            </Button>
            <a
              href={imageUrl}
              download={`dairtak-${campaign.campaign_code}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-bold text-zinc-900"
            >
              <Download className="size-4" />
              تنزيل البطاقة
            </a>
            <Button
              onPress={markPublished}
              isPending={pending}
              className="bg-zinc-950 font-bold text-white"
            >
              {!pending && <Check className="size-4" aria-hidden="true" />}
              سجّل أن المحتوى تم نشره
            </Button>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}

export function MarketingCenter({
  places,
  drivers,
  channels,
  campaigns,
}: {
  places: Place[];
  drivers: Driver[];
  channels: MarketingChannel[];
  campaigns: MarketingCampaign[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState(
    channels.find((channel) => channel.is_active)?.id || '',
  );
  const [queueFilter, setQueueFilter] = useState<'unpublished' | 'published' | 'all'>('unpublished');
  const [prepared, setPrepared] = useState<MarketingCampaign | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  const queue = useMemo<QueueItem[]>(() => [
    ...places.map((place) => ({
      key: `place:${place.id}`,
      entityType: 'place' as const,
      entityId: place.id,
      templateKey: 'new_place' as const,
      title: place.title,
      subtitle: 'مكان أو خدمة',
      createdAt: place.created_at,
      place,
    })),
    ...drivers.map((driver) => ({
      key: `driver:${driver.id}`,
      entityType: 'driver' as const,
      entityId: driver.id,
      templateKey: 'new_driver' as const,
      title: driver.name || 'كابتن توصيل',
      subtitle: driver.vehicle_type || 'كابتن توصيل',
      createdAt: driver.created_at,
      driver,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)), [drivers, places]);

  const campaignFor = (
    entityType: MarketingEntityType,
    entityId: string | null,
    templateKey: MarketingTemplateKey,
  ) => campaigns.find((campaign) =>
    campaign.channel_id === selectedChannelId
    && campaign.entity_type === entityType
    && campaign.entity_id === entityId
    && campaign.template_key === templateKey,
  );

  const filteredQueue = queue.filter((item) => {
    const itemCampaign = campaignFor(item.entityType, item.entityId, item.templateKey);
    if (queueFilter === 'all') return true;
    if (queueFilter === 'published') return itemCampaign?.status === 'published';
    return itemCampaign?.status !== 'published';
  });

  const prepare = (
    entityType: MarketingEntityType,
    entityId: string | null,
    templateKey: MarketingTemplateKey,
  ) => {
    if (!selectedChannelId) {
      setMessage('اختر مسار محتوى نشطًا أولًا.');
      return;
    }
    const existing = campaignFor(entityType, entityId, templateKey);
    if (existing) {
      setPrepared(existing);
      return;
    }
    startTransition(async () => {
      const result = await prepareMarketingCampaign({
        channelId: selectedChannelId,
        entityType,
        entityId,
        templateKey,
      });
      setMessage(result.message);
      if (result.success) {
        setPrepared(result.data);
        router.refresh();
      }
    });
  };

  const previewPlace = prepared?.entity_type === 'place'
    ? places.find((place) => place.id === prepared.entity_id)
    : undefined;
  const previewDriver = prepared?.entity_type === 'driver'
    ? drivers.find((driver) => driver.id === prepared.entity_id)
    : undefined;

  const channelReports = channels.map((channel) => {
    const channelCampaigns = campaigns.filter((campaign) => campaign.channel_id === channel.id);
    return {
      channel,
      campaigns: channelCampaigns.length,
      publications: channelCampaigns.reduce((sum, item) => sum + (item.publication_count || 0), 0),
      visits: channelCampaigns.reduce((sum, item) => sum + (item.visits || 0), 0),
      opens: channelCampaigns.reduce((sum, item) => sum + (item.opens || 0), 0),
      actions: channelCampaigns.reduce((sum, item) => sum + (item.actions || 0), 0),
      shares: channelCampaigns.reduce((sum, item) => sum + (item.shares || 0), 0),
    };
  });

  return (
    <div className="space-y-5">
      {message && <p role="status" className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-sm font-bold">{message}</p>}

      <Card className="border border-zinc-200">
        <Card.Header className="flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <BarChart3 className="size-5" />
              مسار المحتوى
            </h2>
            <p className="mt-1 text-xs text-zinc-500">اختر مسارًا داخليًا لتجهيز المحتوى وتتبع حالته.</p>
          </div>
          <Select
            selectedKey={selectedChannelId || null}
            onSelectionChange={(key) => {
              setSelectedChannelId(String(key || ''));
              setPrepared(null);
            }}
            className="sm:max-w-sm"
          >
            <Label className="text-sm font-bold text-zinc-800">اختر مسار المحتوى</Label>
            <Select.Trigger className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/10">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className="z-[110] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
              <ListBox>
                {channels.filter((channel) => channel.is_active).map((channel) => (
                  <ListBox.Item key={channel.id} id={channel.id} textValue={channel.name} className="cursor-default rounded-lg px-3 py-2 text-sm outline-none data-[focused]:bg-zinc-100 data-[selected]:font-bold">
                    {channel.name}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </Card.Header>
      </Card>

      {prepared && selectedChannel && (
        <CampaignPreview
          campaign={prepared}
          place={previewPlace}
          driver={previewDriver}
          channel={selectedChannel}
          onMessage={setMessage}
        />
      )}

      <Card className="border border-zinc-200">
        <Card.Header className="flex flex-col items-stretch gap-3 border-b border-zinc-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black">طابور الأماكن والكباتن</h2>
            <p className="mt-1 text-xs text-zinc-500">كل عنصر معتمد يظهر هنا تلقائيًا.</p>
          </div>
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
            {([
              ['unpublished', 'لم يُنشر'],
              ['published', 'تم النشر'],
              ['all', 'الكل'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setQueueFilter(key)}
                className={`min-h-10 rounded-lg px-3 text-xs font-bold ${
                  queueFilter === key ? 'bg-zinc-950 text-white' : 'text-zinc-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Card.Header>
        <Card.Content className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredQueue.slice(0, 60).map((item) => {
            const itemCampaign = campaignFor(item.entityType, item.entityId, item.templateKey);
            return (
              <article key={item.key} className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Chip className="mb-2 bg-zinc-100 text-[10px] font-bold">{item.subtitle}</Chip>
                    <h3 className="truncate font-black">{item.title}</h3>
                    <time className="mt-1 block text-xs text-zinc-500" dateTime={item.createdAt}>
                      {formatCairoDate(item.createdAt)}
                    </time>
                  </div>
                  <Chip className={itemCampaign?.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800'}
                  >
                    {itemCampaign?.status === 'published' ? 'منشور' : 'جديد'}
                  </Chip>
                </div>
                <Button
                  onPress={() => prepare(item.entityType, item.entityId, item.templateKey)}
                  isPending={pending}
                  className="mt-4 bg-zinc-950 font-bold text-white"
                >
                  {itemCampaign ? 'فتح الحملة' : 'جهّز للنشر'}
                </Button>
              </article>
            );
          })}
          {!filteredQueue.length && (
            <p className="rounded-2xl bg-zinc-50 p-5 text-sm font-semibold text-zinc-500 sm:col-span-2 lg:col-span-3">
              لا توجد عناصر في هذا القسم لمسار المحتوى المختار.
            </p>
          )}
        </Card.Content>
      </Card>

      <Card className="border border-zinc-200">
        <Card.Header className="border-b border-zinc-100">
          <div>
            <h2 className="font-black">مكتبة أفكار النشر المحلي</h2>
            <p className="mt-1 text-xs text-zinc-500">محتوى جاهز للنشر من داخل الموقع وللمطبوعات والمداخل والأكياس والفواتير.</p>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {marketingIdeas.map((idea) => {
            const existing = campaignFor('feature', null, idea.key);
            return (
              <article key={idea.key} className="rounded-2xl border border-zinc-200 p-4">
                <p className="font-black">{idea.title}</p>
                <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-600">{idea.description}</p>
                <Button
                  onPress={() => prepare('feature', null, idea.key)}
                  className="mt-3 w-full bg-zinc-100 font-bold text-zinc-950"
                >
                  {existing ? 'فتح المحتوى' : 'تجهيز المحتوى'}
                </Button>
              </article>
            );
          })}
        </Card.Content>
      </Card>

      <Card className="border border-zinc-200">
        <Card.Header className="gap-2 border-b border-zinc-100 font-black">
          <BarChart3 className="size-5" />
          نتائج مسارات المحتوى
        </Card.Header>
        <Card.Content className="grid gap-3 lg:grid-cols-2">
          {channelReports.map((report) => (
            <article key={report.channel.id} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-black">{report.channel.name}</p>
                <Chip className={report.channel.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}>
                  {report.channel.is_active ? 'نشط' : 'متوقف'}
                </Chip>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-zinc-50 p-2"><b className="block text-lg">{report.visits}</b>زيارة</div>
                <div className="rounded-xl bg-zinc-50 p-2"><b className="block text-lg">{report.opens}</b>فتح</div>
                <div className="rounded-xl bg-zinc-50 p-2"><b className="block text-lg">{report.actions}</b>تواصل</div>
                <div className="rounded-xl bg-zinc-50 p-2"><b className="block text-lg">{report.shares}</b>مشاركة</div>
                <div className="rounded-xl bg-zinc-50 p-2"><b className="block text-lg">{report.publications}</b>نشر</div>
                <div className="rounded-xl bg-zinc-950 p-2 text-white">
                  <b className="block text-lg">
                    {report.opens ? Math.round((report.actions / report.opens) * 100) : 0}%
                  </b>
                  تحويل
                </div>
              </div>
            </article>
          ))}
        </Card.Content>
      </Card>

    </div>
  );
}
