// sentry.server.config.ts — inicialização do Sentry no runtime Node
// (Server Actions, Route Handlers rodando fora do edge). Ver comentário em
// sentry.client.config.ts sobre a env var necessária (SENTRY_DSN aqui,
// sem NEXT_PUBLIC_ — não precisa ir pro bundle do navegador).

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  debug: false,
})
