// lib/security/customer-session.ts
//
// VULN-ALTA-04 CORRIGIDO: a identidade do cliente no storefront (telefone
// verificado por OTP) vivia só no navegador (Zustand, em memória) e as
// rotas públicas confiavam direto no `phone`/`tenantId` enviados como
// query string — qualquer pessoa podia chamar /api/storefront/customer
// com o telefone de outra pessoa e ver nome, saldo de cashback, pontos de
// fidelidade e histórico de pedidos. Pior: /api/otp/send também confiava
// só na flag `isVerified` do banco (que nunca expira nem é reatada a um
// dispositivo) pra pular o envio de um novo código — bastava digitar um
// telefone que já tinha sido verificado uma vez, em qualquer lugar, para
// ser tratado como já autenticado.
//
// Este módulo centraliza a emissão/leitura de um cookie httpOnly,
// criptografado com AES-256-GCM (mesma primitiva já usada em
// lib/security/crypto.ts para o mfaSecret e para o desafio de MFA em
// lib/auth/config.ts), contendo { phone, tenantId, exp }. Segue o mesmo
// padrão de cookie httpOnly assinado já usado em
// lib/mercadopago/oauth-state-cookie.ts. Só é aceito como prova de
// identidade se:
//   1. a autenticidade do blob confere (GCM detecta qualquer adulteração);
//   2. ainda não expirou;
//   3. o tenantId dentro do cookie bate com o tenantId da requisição atual.
//
// Como é httpOnly, também não pode ser lido/roubado via XSS no
// storefront (ver achado F5 do relatório de auditoria).

import { cookies } from 'next/headers'
import { encrypt, decrypt } from '@/lib/security/crypto'

export const CUSTOMER_SESSION_COOKIE = 'mc_customer_session'
const CUSTOMER_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000 // 180 dias

interface CustomerSessionPayload {
  phone: string
  tenantId: string
  exp: number
}

function encode(phone: string, tenantId: string): string {
  const payload: CustomerSessionPayload = {
    phone,
    tenantId,
    exp: Date.now() + CUSTOMER_SESSION_TTL_MS,
  }
  return encrypt(JSON.stringify(payload))
}

function decode(token: string | undefined | null): CustomerSessionPayload | null {
  if (!token) return null
  try {
    const payload = JSON.parse(decrypt(token)) as CustomerSessionPayload
    if (!payload?.phone || !payload?.tenantId || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    // token adulterado, expirado ou de formato inválido
    return null
  }
}

/** Emite o cookie de sessão do cliente — chamar logo após OTP verificado com sucesso. */
export async function setCustomerSessionCookie(phone: string, tenantId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(CUSTOMER_SESSION_COOKIE, encode(phone, tenantId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CUSTOMER_SESSION_TTL_MS / 1000,
  })
}

/**
 * Lê o cookie de sessão do cliente a partir do contexto da requisição atual
 * (Route Handlers/Server Components) e retorna o telefone verificado —
 * apenas se houver uma sessão válida PARA ESSE tenant específico. Uma
 * sessão válida de outro tenant, ou nenhum cookie, retornam null.
 */
export async function getVerifiedPhoneForTenant(tenantId: string): Promise<string | null> {
  const cookieStore = await cookies()
  const session = decode(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value)
  if (!session) return null
  if (session.tenantId !== tenantId) return null
  return session.phone
}
