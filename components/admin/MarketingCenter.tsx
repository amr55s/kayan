'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Users,
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
  saveMarketingChannel,
  setMarketingChannelActive,
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
      onMessage('تعذر النسخ تلقائيًا؛ استخدم زر مشاركة WhatsApp.');
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
      <CardHeader className="flex flex-col items-stretch gap-2 border-b border-zinc-200 bg-zinc-950 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black">الحملة جاهزة لـ {channel.name}</p>
          <p className="mt-1 text-xs text-zinc-300">انسخ النص والصورة ثم افتح الجروب للنشر اليدوي.</p>
        </div>
        <Chip className={published
          ? 'bg-emerald-500/20 text-emerald-200'
          : 'bg-amber-500/20 text-amber-200'}
        >
          {published ? 'تم النشر' : 'لم تُنشر'}
        </Chip>
      </CardHeader>
      <CardBody className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
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
            <Button onPress={copy} startContent={copied ? <Check className="size-4" /> : <Copy className="size-4" />} className="font-bold">
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
              as="a"
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              startContent={<Send className="size-4" />}
              className="bg-emerald-600 font-bold text-white"
            >
              مشاركة WhatsApp
            </Button>
            <Button
              as="a"
              href={channel.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              startContent={<ExternalLink className="size-4" />}
              className="border border-zinc-200 bg-white font-bold"
            >
              فتح الجروب
            </Button>
            <Button
              onPress={markPublished}
              isLoading={pending}
              startContent={!pending && <Check className="size-4" />}
              className="bg-zinc-950 font-bold text-white sm:col-span-2"
            >
              سجّل أن المحتوى تم نشره
            </Button>
          </div>
        </div>
      </CardBody>
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
  const [channelForm, setChannelForm] = useState({
    id: '',
    name: '',
    whatsappUrl: '',
    notes: '',
    isActive: true,
  });

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
      setMessage('أضف جروبًا أو اختر جروبًا نشطًا أولًا.');
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

  const submitChannel = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveMarketingChannel({
        ...channelForm,
        id: channelForm.id || undefined,
      });
      setMessage(result.message);
      if (result.success) {
        setChannelForm({ id: '', name: '', whatsappUrl: '', notes: '', isActive: true });
        setSelectedChannelId(result.data.id);
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
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <MessageCircle className="size-5" />
              الجروب المستهدف
            </h2>
            <p className="mt-1 text-xs text-zinc-500">اسم ورابط الجروب لا يظهران للعامة.</p>
          </div>
          <Select
            label="اختر الجروب"
            selectedKeys={selectedChannelId ? [selectedChannelId] : []}
            onSelectionChange={(keys) => {
              setSelectedChannelId(String(Array.from(keys)[0] || ''));
              setPrepared(null);
            }}
            className="sm:max-w-sm"
          >
            {channels.filter((channel) => channel.is_active).map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>
            ))}
          </Select>
        </CardHeader>
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
        <CardHeader className="flex flex-col items-stretch gap-3 border-b border-zinc-100 sm:flex-row sm:items-center sm:justify-between">
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
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  isLoading={pending}
                  className="mt-4 bg-zinc-950 font-bold text-white"
                >
                  {itemCampaign ? 'فتح الحملة' : 'جهّز للنشر'}
                </Button>
              </article>
            );
          })}
          {!filteredQueue.length && (
            <p className="rounded-2xl bg-zinc-50 p-5 text-sm font-semibold text-zinc-500 sm:col-span-2 lg:col-span-3">
              لا توجد عناصر في هذا القسم للجروب المختار.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="border border-zinc-200">
        <CardHeader className="border-b border-zinc-100">
          <div>
            <h2 className="font-black">مكتبة أفكار النشر المحلي</h2>
            <p className="mt-1 text-xs text-zinc-500">محتوى جاهز للجروبات، المداخل، المحلات، والأكياس والفواتير.</p>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        </CardBody>
      </Card>

      <Card className="border border-zinc-200">
        <CardHeader className="gap-2 border-b border-zinc-100 font-black">
          <BarChart3 className="size-5" />
          نتائج الجروبات
        </CardHeader>
        <CardBody className="grid gap-3 lg:grid-cols-2">
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
        </CardBody>
      </Card>

      <Card className="border border-zinc-200">
        <CardHeader className="gap-2 border-b border-zinc-100 font-black">
          <Users className="size-5" />
          إدارة جروبات النشر
        </CardHeader>
        <CardBody className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <form onSubmit={submitChannel} className="space-y-3 rounded-2xl bg-zinc-50 p-4">
            <Input isRequired label="اسم الجروب" value={channelForm.name} onValueChange={(name) => setChannelForm({ ...channelForm, name })} />
            <Input isRequired type="url" label="رابط جروب WhatsApp" value={channelForm.whatsappUrl} onValueChange={(whatsappUrl) => setChannelForm({ ...channelForm, whatsappUrl })} />
            <Textarea label="ملاحظات خاصة بالإدارة" value={channelForm.notes} onValueChange={(notes) => setChannelForm({ ...channelForm, notes })} />
            <Button type="submit" isLoading={pending} startContent={!pending && (channelForm.id ? <Pencil className="size-4" /> : <Plus className="size-4" />)} className="w-full bg-zinc-950 font-bold text-white">
              {channelForm.id ? 'حفظ التعديل' : 'إضافة الجروب'}
            </Button>
          </form>
          <div className="space-y-2">
            {channels.map((channel) => (
              <article key={channel.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-black">{channel.name}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{channel.notes || 'بدون ملاحظات'}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    isIconOnly
                    variant="flat"
                    aria-label={`تعديل ${channel.name}`}
                    onPress={() => setChannelForm({
                      id: channel.id,
                      name: channel.name,
                      whatsappUrl: channel.whatsapp_url,
                      notes: channel.notes,
                      isActive: channel.is_active,
                    })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    onPress={() => startTransition(async () => {
                      const result = await setMarketingChannelActive(channel.id, !channel.is_active);
                      setMessage(result.message);
                      if (result.success) router.refresh();
                    })}
                    className={channel.is_active
                      ? 'bg-zinc-100 font-bold text-zinc-700'
                      : 'bg-emerald-600 font-bold text-white'}
                  >
                    {channel.is_active ? 'إيقاف' : 'تفعيل'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
