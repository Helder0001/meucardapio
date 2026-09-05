// sentry.edge.config.ts — inicialização do Sentry no runtime Edge
// (middleware/proxy.ts e Route Handlers com `export const runtime = 'edge'`).

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  debug: false,
})
