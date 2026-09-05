// sentry.client.config.ts
//
// Inicialização do Sentry no navegador. O pacote @sentry/nextjs já estava
// no package.json, mas nunca tinha sido configurado — sem esses arquivos,
// nenhum erro de produção era capturado (o "13. Os logs estão instalados"
// do checklist). Precisa da env var NEXT_PUBLIC_SENTRY_DSN configurada na
// Vercel (Project Settings → Environment Variables) — pegue o DSN em
// sentry.io → Settings → Projects → seu projeto → Client Keys (DSN).
// Sem essa env var, o Sentry simplesmente não envia nada (não quebra o
// build nem o app).

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Amostragem de performance — 10% das transações é um bom ponto de
  // partida pra não estourar a cota gratuita do Sentry.
  tracesSampleRate: 0.1,

  // Session Replay: grava a tela de quem teve erro, ajuda muito a
  // debugar sem precisar pedir print pro cliente.
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],

  // Silencia no ambiente de dev — só reporta em produção.
  enabled: process.env.NODE_ENV === 'production',

  debug: false,
})
