// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { scrubSentryEvent } from '@/lib/observability/sentry-scrub';

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
type RouterTransitionArgs = Parameters<
  typeof import('@sentry/nextjs').captureRouterTransitionStart
>;

let sentryClient: Promise<typeof import('@sentry/nextjs')> | null = null;

function loadSentryClient() {
  if (!sentryClient) {
    sentryClient = import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        enabled: Boolean(sentryDsn),

        // Keep browser tracing lightweight and disable all default PII surfaces.
        tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
        dataCollection: {
          userInfo: false,
          httpBodies: [],
        },
        sendDefaultPii: false,
        beforeSend: scrubSentryEvent,
      });
      return Sentry;
    });
  }
  return sentryClient;
}

// Sentry is optional. Do not make every visitor download its client SDK unless a
// DSN was deliberately supplied for this build.
if (sentryDsn) void loadSentryClient();

export function onRouterTransitionStart(...args: RouterTransitionArgs): void {
  if (!sentryDsn) return;
  void loadSentryClient().then((Sentry) => {
    Sentry.captureRouterTransitionStart(...args);
  });
}
