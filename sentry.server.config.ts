// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://92bdd90788520cb9d52f639cfa31f386@o4511829266006016.ingest.de.sentry.io/4511829267120208",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
  sendDefaultPii: false,
});
