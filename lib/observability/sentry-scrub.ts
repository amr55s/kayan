const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const EGYPT_PHONE_PATTERN = /(?<!\d)(?:\+?20|0)?1[0125]\d{8}(?!\d)/gu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\b/gu;

export function redactSentryText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(EGYPT_PHONE_PATTERN, '[redacted-phone]')
    .replace(JWT_PATTERN, '[redacted-token]');
}

type SentryLikeEvent = {
  message?: string;
  user?: unknown;
  extra?: unknown;
  request?: {
    cookies?: unknown;
    data?: unknown;
    env?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
    url?: string;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
};

/** Keep operational traces while removing user-controlled text and credentials. */
export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  event.user = undefined;
  event.extra = undefined;
  if (event.message) event.message = redactSentryText(event.message);

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redactSentryText(value.value);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redactSentryText(breadcrumb.message);
    breadcrumb.data = undefined;
  }

  if (event.request) {
    event.request.cookies = undefined;
    event.request.data = undefined;
    event.request.env = undefined;
    event.request.query_string = undefined;
    event.request.headers = undefined;
    if (event.request.url) {
      try {
        const url = new URL(event.request.url);
        url.search = '';
        url.hash = '';
        event.request.url = url.toString();
      } catch {
        event.request.url = event.request.url.split(/[?#]/u, 1)[0];
      }
    }
  }
  return event;
}
