// lib/cache/redis.ts
//
// Usamos o Upstash Redis (upstash.com) porque:
// 1. Funciona em Edge Functions e Serverless (HTTP-based, não TCP)
// 2. Tem tier gratuito generoso (10k req/dia)
// 3. Compatível com Vercel sem configuração extra
//
// O que guardamos no Redis:
// - Sessões de usuário
// - Rate limiting (tentativas de login, OTP, etc.)
// - Cache de cardápios (TTL 5min)
// - OTP codes (TTL 5min)
// - Pub/Sub para kanban em tempo real

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// ── Client singleton ──────────────────────────────────────
export const redis = Redis.fromEnv()

// ── Rate limiters ─────────────────────────────────────────

// Login: 5 tentativas por minuto por IP
export const loginRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'rl:login',
})

// OTP: 3 tentativas por 10 minutos por telefone
export const otpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'rl:otp',
})

// API geral: 60 requests por minuto por IP
export const apiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:api',
})

// ── Helpers de cache ──────────────────────────────────────

// Chaves padronizadas para evitar colisões
export const CacheKeys = {
  menu: (tenantId: string) => `menu:${tenantId}`,
  tenant: (slug: string) => `tenant:${slug}`,
  tenantById: (id: string) => `tenant:id:${id}`,
  otp: (phone: string, tenantId: string) => `otp:${tenantId}:${phone}`,
  session: (userId: string) => `session:${userId}`,
  orderChannel: (tenantId: string) => `orders:${tenantId}`,
  printerJobs: (token: string) => `printer:${token}:jobs`,
} as const

// Cache de cardápio: 5 minutos
// Invalidado automaticamente quando produto é alterado
export async function cacheMenu(tenantId: string, data: unknown) {
  await redis.setex(CacheKeys.menu(tenantId), 300, JSON.stringify(data))
}

export async function getCachedMenu(tenantId: string) {
  const cached = await redis.get(CacheKeys.menu(tenantId))
  if (!cached) return null
  return typeof cached === 'string' ? JSON.parse(cached) : cached
}

export async function invalidateMenu(tenantId: string) {
  await redis.del(CacheKeys.menu(tenantId))
}

// OTP: armazena hash do código por 5 minutos
export async function storeOTP(phone: string, tenantId: string, hashedCode: string) {
  const key = CacheKeys.otp(phone, tenantId)
  await redis.setex(key, 300, hashedCode) // 5 minutos
}

export async function getStoredOTP(phone: string, tenantId: string) {
  return redis.get<string>(CacheKeys.otp(phone, tenantId))
}

export async function deleteOTP(phone: string, tenantId: string) {
  await redis.del(CacheKeys.otp(phone, tenantId))
}

// Publica evento de pedido para o kanban em tempo real
export async function publishOrderEvent(tenantId: string, event: unknown) {
  await redis.publish(CacheKeys.orderChannel(tenantId), JSON.stringify(event))
}
