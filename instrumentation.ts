// instrumentation.ts
//
// Next.js chama register() uma vez, na subida do servidor, antes de
// qualquer rota rodar. Carrega a config de Sentry certa pra cada runtime
// (Node vs Edge) — o client (navegador) é inicializado à parte, por
// sentry.client.config.ts (ver comentário lá pra detalhes/env vars).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = async (
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) => {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
