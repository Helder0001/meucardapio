// lib/security/csp.ts
// Construção da Content-Security-Policy por requisição.
// Isolado do middleware para facilitar manutenção e testes.

interface CSPOptions {
  nonce: string
  isStorefront: boolean
  isDev: boolean
}

/**
 * Domínios permitidos no script-src.
 * Documentação de cada domínio:
 * - sdk.mercadopago.com: SDK oficial do Mercado Pago (Card Payment Brick)
 * - http2.mlstatic.com: CDN do Mercado Pago (sub-scripts e traduções)
 * - www.mercadopago.com: Device ID (security.js) para antifraude PIX
 * - device.clearsale.com.br: Fingerprint de antifraude da Efí
 */
const SCRIPT_SRC_DOMAINS = [
  'https://sdk.mercadopago.com',
  'https://http2.mlstatic.com',
  'https://www.mercadopago.com',
  'https://device.clearsale.com.br',
  // Google Analytics (gtag.js) — carregado só depois que o usuário aceita
  // cookies no banner de consentimento (ver components/shared/analytics-consent.tsx).
  'https://www.googletagmanager.com',
]

/**
 * Domínios permitidos no connect-src.
 */
const CONNECT_SRC_DOMAINS = [
  'https://api.mercadopago.com',
  'https://api.mercadolibre.com',
  'https://www.mercadolibre.com',
  'https://www.mercadopago.com',
  'https://events.mercadopago.com',
  'https://secure-fields.mercadopago.com',
  'https://api-static.mercadopago.com',
  'https://http2.mlstatic.com',
  'https://*.upstash.io',
  'https://tokenizer.sejaefi.com.br',
  'https://cobrancas.api.efipay.com.br',
  'https://cobrancas-h.api.efipay.com.br',
  'https://device.clearsale.com.br',
  'https://web.fpcs-monitor.com.br',
  // Google Analytics — endpoints de coleta (gtag beacon).
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'wss:',
]

/**
 * Domínios permitidos no frame-src.
 */
const FRAME_SRC_DOMAINS = [
  'https://www.mercadopago.com',
  'https://www.mercadolibre.com',
  'https://secure-fields.mercadopago.com',
]

export function buildCSP({ nonce, isStorefront, isDev }: CSPOptions): string {
  // Em desenvolvimento, CSP mais permissiva para facilitar debugging
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https:",
      "font-src 'self'",
      "connect-src 'self' ws: wss: https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  }

  const directives = [
    "default-src 'self'",
    // IMPORTANTE: NÃO usar nonce no script-src. O SDK do Mercado Pago injeta
    // scripts inline dinamicamente (sem nonce), então 'unsafe-inline' é
    // necessário. Com nonce presente, o navegador ignoraria 'unsafe-inline'
    // e quebraria o Card Payment Brick.
    `script-src 'self' 'unsafe-inline' ${SCRIPT_SRC_DOMAINS.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://http2.mlstatic.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' https://http2.mlstatic.com",
    `connect-src 'self' ${CONNECT_SRC_DOMAINS.join(' ')}`,
    `frame-src ${FRAME_SRC_DOMAINS.join(' ')}`,
    `frame-ancestors ${isStorefront ? "'self'" : "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ]

  return directives.join('; ')
}
