import 'server-only';

import type { DailyPlan } from '@/lib/marketing/playbook';

export type AutoPublishResult = {
  channel: 'telegram' | 'facebook';
  status: 'sent' | 'skipped' | 'failed';
};

const TIMEOUT_MS = 15_000;

async function postJson(url: string, body: Record<string, string>): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  return response.ok;
}

async function publishToTelegram(plan: DailyPlan, imageUrl: string): Promise<AutoPublishResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token || !chatId) return { channel: 'telegram', status: 'skipped' };
  try {
    const sent = await postJson(`https://api.telegram.org/bot${token}/sendPhoto`, {
      chat_id: chatId,
      photo: imageUrl,
      // Telegram rejects photo captions longer than 1024 characters.
      caption: plan.text.slice(0, 1024),
    });
    return { channel: 'telegram', status: sent ? 'sent' : 'failed' };
  } catch {
    return { channel: 'telegram', status: 'failed' };
  }
}

async function publishToFacebookPage(plan: DailyPlan, imageUrl: string): Promise<AutoPublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !accessToken || !/^\d+$/.test(pageId)) {
    return { channel: 'facebook', status: 'skipped' };
  }
  try {
    const sent = await postJson(`https://graph.facebook.com/${pageId}/photos`, {
      url: imageUrl,
      caption: plan.text,
      access_token: accessToken,
    });
    return { channel: 'facebook', status: sent ? 'sent' : 'failed' };
  } catch {
    return { channel: 'facebook', status: 'failed' };
  }
}

/**
 * Posts today's plan to every channel that has credentials configured.
 * Channels without credentials are skipped, so this is safe to run unconfigured.
 */
export async function autoPublishDailyPlan(
  plan: DailyPlan,
  imageUrl: string,
): Promise<AutoPublishResult[]> {
  return Promise.all([
    publishToTelegram(plan, imageUrl),
    publishToFacebookPage(plan, imageUrl),
  ]);
}
