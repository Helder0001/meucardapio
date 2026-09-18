// lib/i18n/cookies.ts
//
// Leitura/escrita do cookie de idioma de UM escopo por vez — cada escopo
// (dashboard/storefront/landing) tem seu próprio nome de cookie (ver
// dashboard.ts, storefront.ts, landing.ts), então nunca se sobrescrevem.
// Mesmo padrão de cookies() assíncrono já usado em
// lib/security/customer-session.ts.

import { cookies } from 'next/headers'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function readLocaleCookie(cookieName: string): Promise<string | null> {
  const store = await cookies()
  return store.get(cookieName)?.value ?? null
}

export async function writeLocaleCookie(cookieName: string, value: string): Promise<void> {
  const store = await cookies()
  store.set(cookieName, value, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  })
}
