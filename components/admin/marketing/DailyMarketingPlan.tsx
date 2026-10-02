'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { CalendarDays, Check, Copy, Download, Send, Sparkles } from 'lucide-react';
import type { Place } from '@/types';
import { SITE_URL } from '@/lib/marketing/content';
import {
  BRAND_SLOGANS,
  buildDailyPlan,
  buildWeekPlans,
  cardQuery,
  type DailyPlan,
  type PlaceEngagement,
} from '@/lib/marketing/playbook';

type CampaignEvents = { campaignKey: string; visits: number; opens: number; actions: number };

const WEEKDAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DONE_KEY = 'dairtak_daily_post_done_v1';

function cardUrl(plan: DailyPlan, format: 'square' | 'story', preview = false): string {
  return `/api/marketing-card?${cardQuery(plan, format)}${preview ? '&preview=1' : ''}`;
}

const doneListeners = new Set<() => void>();

function subscribeDone(listener: () => void): () => void {
  doneListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    doneListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readDoneRef(): string {
  try {
    return window.localStorage.getItem(DONE_KEY) ?? '';
  } catch {
    // The checklist is a convenience; the plan works without storage.
    return '';
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function DailyMarketingPlan({
  today,
  places,
  engagement,
  campaignEvents,
  onMessage,
}: {
  /** Cairo calendar day (YYYY-MM-DD) resolved on the server. */
  today: string;
  places: Place[];
  engagement: Record<string, PlaceEngagement>;
  campaignEvents: CampaignEvents[];
  onMessage: (message: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const cardFiles = useRef<Partial<Record<'square' | 'story', File>>>({});

  const date = useMemo(() => new Date(`${today}T12:00:00Z`), [today]);
  const plan = useMemo(
    () => buildDailyPlan({ date, siteUrl: SITE_URL, places, engagement }),
    [date, engagement, places],
  );
  const upcoming = useMemo(
    () => buildWeekPlans({ date, siteUrl: SITE_URL, places, engagement }).slice(1),
    [date, engagement, places],
  );
  const lastWeek = useMemo(() => {
    const events = new Map(campaignEvents.map((item) => [item.campaignKey, item]));
    return Array.from({ length: 7 }, (_, index) => {
      const past = buildDailyPlan({
        date: new Date(date.getTime() - (index + 1) * 86_400_000),
        siteUrl: SITE_URL,
        places,
        engagement,
      });
      return { plan: past, events: events.get(past.ref) };
    });
  }, [campaignEvents, date, engagement, places]);
  const todayEvents = campaignEvents.find((item) => item.campaignKey === plan.ref);

  const done = useSyncExternalStore(subscribeDone, readDoneRef, () => '') === plan.ref;

  // Sharing a file needs a fresh tap, so the card is fetched ahead of time.
  useEffect(() => {
    let cancelled = false;
    cardFiles.current = {};
    for (const format of ['square', 'story'] as const) {
      fetch(cardUrl(plan, format))
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (!blob || cancelled) return;
          cardFiles.current[format] = new File(
            [blob],
            `dairtak-${plan.dateKey}-${format}.png`,
            { type: 'image/png' },
          );
        })
        .catch(() => {
          // Sharing falls back to text and a manual download.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const flashCopied = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) flashCopied(key);
    else onMessage('تعذر النسخ تلقائيًا. حدّد النص وانسخه يدويًا.');
  };

  const share = async (format: 'square' | 'story') => {
    const text = format === 'story' ? plan.statusText : plan.text;
    // Some share targets drop the caption when a file is attached, so the text
    // is always left on the clipboard as well.
    const onClipboard = await copyText(text);
    const file = cardFiles.current[format];
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else {
        onMessage(onClipboard
          ? 'تم نسخ النص. نزّل البطاقة ثم الصق النص في الجروب.'
          : 'المشاركة المباشرة غير متاحة على هذا الجهاز. انسخ النص ونزّل البطاقة.');
        return;
      }
      onMessage(onClipboard
        ? 'تم فتح المشاركة — النص منسوخ أيضًا لو احتجت تلصقه مع الصورة.'
        : 'تم فتح المشاركة.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onMessage('تعذرت المشاركة المباشرة. انسخ النص ونزّل البطاقة.');
    }
  };

  const toggleDone = () => {
    try {
      if (done) window.localStorage.removeItem(DONE_KEY);
      else window.localStorage.setItem(DONE_KEY, plan.ref);
    } catch {
      // Nothing to persist when storage is unavailable.
    }
    doneListeners.forEach((listener) => listener());
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-2 border-zinc-950">
        <Card.Header className="flex flex-col items-stretch gap-2 border-b border-zinc-200 bg-zinc-950 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-black">
              <Sparkles className="size-5" aria-hidden="true" />
              منشور اليوم — {WEEKDAY_LABELS[plan.weekday]}: {plan.theme.label}
            </p>
            <p className="mt-1 text-xs text-zinc-300">الهدف: {plan.theme.goal}</p>
          </div>
          <Chip className={done
            ? 'bg-emerald-500/20 text-emerald-200'
            : 'bg-amber-500/20 text-amber-200'}
          >
            {done ? 'تم النشر اليوم' : 'لم يُنشر بعد'}
          </Chip>
        </Card.Header>
        <Card.Content className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
          <Image
            src={cardUrl(plan, 'square', true)}
            alt={`بطاقة ${plan.headline}`}
            width={1080}
            height={1080}
            unoptimized
            className="aspect-square w-full rounded-3xl border border-zinc-200 object-cover"
          />
          <div className="flex min-w-0 flex-col gap-4">
            <pre className="min-h-32 whitespace-pre-wrap break-words rounded-2xl bg-zinc-100 p-4 font-sans text-sm leading-7 text-zinc-800">
              {plan.text}
            </pre>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onPress={() => share('square')} className="min-h-11 bg-emerald-600 font-bold text-white">
                <Send className="size-4" aria-hidden="true" />
                شارك في الجروب
              </Button>
              <Button onPress={() => share('story')} className="min-h-11 bg-zinc-950 font-bold text-white">
                <Send className="size-4" aria-hidden="true" />
                شارك كحالة (ستوري)
              </Button>
              <Button onPress={() => copy('post', plan.text)} className="min-h-11 bg-zinc-100 font-bold text-zinc-900">
                {copied === 'post'
                  ? <Check className="size-4" aria-hidden="true" />
                  : <Copy className="size-4" aria-hidden="true" />}
                {copied === 'post' ? 'تم النسخ' : 'نسخ النص'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {(['square', 'story'] as const).map((format) => (
                  <a
                    key={format}
                    href={cardUrl(plan, format)}
                    download={`dairtak-${plan.dateKey}-${format}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-2 text-xs font-bold text-zinc-900"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {format === 'square' ? 'بطاقة مربعة' : 'بطاقة حالة'}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3">
              <p className="text-xs leading-6 text-zinc-600">
                {todayEvents
                  ? `نتيجة منشور اليوم حتى الآن: ${todayEvents.visits} زيارة، ${todayEvents.opens} فتح، ${todayEvents.actions} تواصل.`
                  : 'الزيارات القادمة من منشور اليوم تظهر هنا تلقائيًا.'}
              </p>
              <Button onPress={toggleDone} size="sm" className="min-h-10 bg-zinc-950 font-bold text-white">
                <Check className="size-4" aria-hidden="true" />
                {done ? 'تراجع' : 'نشرت منشور اليوم'}
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      <Card className="border border-zinc-200">
        <Card.Header className="border-b border-zinc-100">
          <div>
            <h2 className="flex items-center gap-2 font-black">
              <CalendarDays className="size-5" aria-hidden="true" />
              خطة الأيام القادمة ونتائج آخر أسبوع
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              لكل يوم موضوع ثابت، والمحتوى يتغيّر تلقائيًا من بيانات الدليل.
            </p>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-5 lg:grid-cols-2">
          <ol className="space-y-2">
            {upcoming.map((item) => (
              <li key={item.ref} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm">
                <span className="min-w-0">
                  <b className="block">{WEEKDAY_LABELS[item.weekday]} — {item.theme.label}</b>
                  <span className="block truncate text-xs text-zinc-500">{item.headline}</span>
                </span>
                <time dateTime={item.dateKey} className="shrink-0 text-xs text-zinc-500">
                  {item.dateKey.slice(5)}
                </time>
              </li>
            ))}
          </ol>
          <ol className="space-y-2">
            {lastWeek.map(({ plan: past, events }) => (
              <li key={past.ref} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 text-sm">
                <span className="min-w-0">
                  <b className="block truncate">{past.headline}</b>
                  <span className="block text-xs text-zinc-500">
                    {WEEKDAY_LABELS[past.weekday]} {past.dateKey.slice(5)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-zinc-700">
                  {events
                    ? `${events.visits} زيارة · ${events.actions} تواصل`
                    : 'لا زيارات'}
                </span>
              </li>
            ))}
          </ol>
        </Card.Content>
      </Card>

      <Card className="border border-zinc-200">
        <Card.Header className="border-b border-zinc-100">
          <div>
            <h2 className="font-black">شعارات جاهزة</h2>
            <p className="mt-1 text-xs text-zinc-500">اضغط لنسخ الشعار واستخدمه في الحالة، المطبوعات، أو وصف الجروب.</p>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-2 sm:grid-cols-2">
          {BRAND_SLOGANS.map((slogan) => (
            <button
              key={slogan}
              type="button"
              onClick={() => copy(slogan, slogan)}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 text-start text-sm font-bold text-zinc-800 hover:bg-zinc-100"
            >
              <span>{slogan}</span>
              {copied === slogan
                ? <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                : <Copy className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />}
            </button>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
