export type ChatRiskSignal = {
  type: 'external_contact' | 'off_platform_payment' | 'duplicate_outreach' | 'velocity' | 'reports' | 'denied_access';
  score: 1 | 2 | 3;
  /** Rule IDs and numeric counts only. Never place message text in evidence. */
  evidence: string[];
};

export type ChatRiskInput = {
  body?: string | null;
  previousBodies?: readonly string[];
  messagesInWindow?: number;
  reportCount?: number;
  deniedAccessCount?: number;
};

const phone = /(?:\+?20|0)?1[0125]\d{8}/u;
const externalLink = /https?:\/\/(?![^/]*(?:dairtak\.com|localhost))(?:[^\s/]+)[^\s]*/iu;
const offPlatformPayment = /(?:فودافون\s*كاش|تحويل\s*بنكي|instapay|western\s*union|pay\s*outside)/iu;

export function classifyChatRisk(input: ChatRiskInput): ChatRiskSignal[] {
  const body = input.body?.trim() ?? '';
  const signals: ChatRiskSignal[] = [];
  if (phone.test(body) || externalLink.test(body)) signals.push({ type: 'external_contact', score: 2, evidence: [phone.test(body) ? 'phone_detected' : 'external_link_detected'] });
  if (offPlatformPayment.test(body)) signals.push({ type: 'off_platform_payment', score: 3, evidence: ['off_platform_payment_phrase'] });
  if (body && (input.previousBodies ?? []).filter((item) => item.trim() === body).length >= 2) signals.push({ type: 'duplicate_outreach', score: 2, evidence: ['duplicate_body_count:3'] });
  if ((input.messagesInWindow ?? 0) >= 12) signals.push({ type: 'velocity', score: 2, evidence: [`messages_5m:${input.messagesInWindow}`] });
  if ((input.reportCount ?? 0) > 0) signals.push({ type: 'reports', score: Math.min(3, input.reportCount ?? 1) as 1 | 2 | 3, evidence: [`report_count:${input.reportCount}`] });
  if ((input.deniedAccessCount ?? 0) > 0) signals.push({ type: 'denied_access', score: 1, evidence: [`denied_access_count:${input.deniedAccessCount}`] });
  return signals;
}
