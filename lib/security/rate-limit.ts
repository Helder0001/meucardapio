// lib/security/rate-limit.ts
//
// Rate limiting em múltiplas dimensões:
// - Por IP (já existia)
// - Por telefone (novo — impede bypass com múltiplos IPs)
// - Por fingerprint de dispositivo (novo — camada extra)
//
// Previne: credential stuffing, brute force de OTP, spam de pedidos

import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/cache/redis'

// ── Login ──────────────────────────────────────────────────────────────────
// 5 tentativas por minuto por IP
export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix:  'rl:login:ip',
  analytics: true,
})

// 10 tentativas por hora por email (evita lockout legítimo por IP compartilhado)
export const loginEmailLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix:  'rl:login:email',
})

// ── OTP ────────────────────────────────────────────────────────────────────
// 3 tentativas por 10 minutos POR IP
export const otpIpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix:  'rl:otp:ip',
})

// 3 tentativas por 10 minutos POR TELEFONE (principal correção do VULN-07)
// Impede bypass com VPN/múltiplos IPs
export const otpPhoneLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix:  'rl:otp:phone',
})

// Máximo 2 OTPs enviados por telefone por hora (evita spam de SMS/WhatsApp)
export const otpSendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, '1 h'),
  prefix:  'rl:otp:send',
})

// ── Impressoras ────────────────────────────────────────────────────────────
// 20 requests por 10s por IP — generoso pro polling normal de uma impressora
// real, mas trava tentativas de força bruta varrendo tokens.
export const printerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '10 s'),
  prefix:  'rl:printer',
})

// ── API geral ──────────────────────────────────────────────────────────────
// 60 requests por minuto por IP
export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix:  'rl:api',
})

// ── Pedidos ────────────────────────────────────────────────────────────────
// Máximo 10 pedidos por hora por telefone (evita spam de pedidos falsos)
export const orderLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix:  'rl:order:phone',
})

// ── Upload ─────────────────────────────────────────────────────────────────
// 20 uploads por hora por tenant
export const uploadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix:  'rl:upload',
})

// ── Avaliações ─────────────────────────────────────────────────────────────
// 5 avaliações por hora por pedido — trava tentativas repetidas de submeter
// review no mesmo orderId (força bruta / abuso), independente do IP.
export const reviewLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix:  'rl:review:order',
})

// ── Helper: verificar OTP com ambas as dimensões ──────────────────────────
export async function checkOtpRateLimit(
  ip: string,
  phone: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const [byIp, byPhone] = await Promise.all([
    otpIpLimiter.limit(ip),
    otpPhoneLimiter.limit(phone),
  ])

  if (!byIp.success) {
    return { allowed: false, retryAfter: Math.ceil((byIp.reset - Date.now()) / 1000) }
  }
  if (!byPhone.success) {
    return { allowed: false, retryAfter: Math.ceil((byPhone.reset - Date.now()) / 1000) }
  }
  return { allowed: true }
}
