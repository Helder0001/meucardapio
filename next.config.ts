import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  typedRoutes: false,

  images: {
    remotePatterns: [
      // Domínio do Supabase Storage (bucket público)
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_SUPABASE_HOSTNAME || 'localhost',
        pathname: '/storage/v1/object/public/**',
      },
      // Para desenvolvimento local (MinIO ou outro S3 compatível)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  poweredByHeader: false,
}

export default withSentryConfig(nextConfig, {
  // Organização/projeto do Sentry — preencha com os seus valores (Settings
  // → General em sentry.io) via env vars, ou troque direto aqui. Sem isso
  // o upload de source maps na build é pulado silenciosamente (o app
  // funciona normal, só sem stack traces bonitinhos no Sentry).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: true, // não poluir o log de build da Vercel
  widenClientFileUpload: true,
  disableLogger: true,

  // Desliga o upload de source maps quando não há token configurado, em
  // vez de falhar o build — assim o Sentry funciona em "modo básico"
  // (captura de erro) mesmo antes de você configurar o upload completo.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
})
