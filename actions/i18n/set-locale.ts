'use server'

// actions/i18n/set-locale.ts
//
// Três ações, uma por escopo — cada uma grava só o cookie daquele escopo,
// então trocar o idioma do cardápio nunca muda o do dashboard nem o da
// landing (ver components/shared/language-switcher.tsx, que chama uma
// dessas e depois router.refresh()).

import { writeLocaleCookie } from '@/lib/i18n/cookies'
import { DASHBOARD_LOCALE_COOKIE, DASHBOARD_LOCALES } from '@/lib/i18n/dashboard'
import { STOREFRONT_LOCALE_COOKIE, STOREFRONT_LOCALES } from '@/lib/i18n/storefront'
import { LANDING_LOCALE_COOKIE, LANDING_LOCALES } from '@/lib/i18n/landing'

export async function setDashboardLocaleAction(locale: string): Promise<void> {
  if (!DASHBOARD_LOCALES.some((l) => l.code === locale)) return
  await writeLocaleCookie(DASHBOARD_LOCALE_COOKIE, locale)
}

export async function setStorefrontLocaleAction(locale: string): Promise<void> {
  if (!STOREFRONT_LOCALES.some((l) => l.code === locale)) return
  await writeLocaleCookie(STOREFRONT_LOCALE_COOKIE, locale)
}

export async function setLandingLocaleAction(locale: string): Promise<void> {
  if (!LANDING_LOCALES.some((l) => l.code === locale)) return
  await writeLocaleCookie(LANDING_LOCALE_COOKIE, locale)
}
