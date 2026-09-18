// lib/i18n/storefront.ts
//
// Dicionário do escopo STOREFRONT (cardápio público que o cliente final
// vê) — cookie e contexto totalmente independentes do dashboard e da
// landing. Não é por tenant: é o idioma que o VISITANTE escolhe no
// navegador dele (um turista que fala inglês quer inglês em qualquer
// cardápio que ele escaneie, não só num restaurante específico).
//
// Hoje cobre a barra superior (busca + nav + carrinho) em
// components/storefront/storefront-client.tsx. Ver I18N-ROADMAP.md para o
// que falta (fichas de produto, carrinho/checkout, etc.).

export type StorefrontLocale = 'pt-BR' | 'en' | 'es'

export const STOREFRONT_LOCALE_COOKIE = 'mc_storefront_locale'
export const STOREFRONT_DEFAULT_LOCALE: StorefrontLocale = 'pt-BR'

export const STOREFRONT_LOCALES: { code: StorefrontLocale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

export interface StorefrontDict {
  searchPlaceholder: string
  nav: { inicio: string; ofertas: string; pedidos: string; avaliacoes: string; whatsapp: string }
  theme: { light: string; dark: string }
  cart: { label: string }
  table: string
  viewOnlyNotice: string
  closedDefault: string
  languageSwitcher: { label: string }
}

const pt: StorefrontDict = {
  searchPlaceholder: 'Buscar no cardápio…',
  nav: { inicio: 'Início', ofertas: 'Ofertas', pedidos: 'Pedidos', avaliacoes: 'Avaliações', whatsapp: 'WhatsApp' },
  theme: { light: 'Claro', dark: 'Escuro' },
  cart: { label: 'Carrinho' },
  table: 'Mesa',
  viewOnlyNotice: 'Cardápio somente para consulta — peça com a equipe',
  closedDefault: 'Estabelecimento fechado no momento.',
  languageSwitcher: { label: 'Idioma' },
}

const en: StorefrontDict = {
  searchPlaceholder: 'Search the menu…',
  nav: { inicio: 'Home', ofertas: 'Offers', pedidos: 'Orders', avaliacoes: 'Reviews', whatsapp: 'WhatsApp' },
  theme: { light: 'Light', dark: 'Dark' },
  cart: { label: 'Cart' },
  table: 'Table',
  viewOnlyNotice: 'Menu for browsing only — order with staff',
  closedDefault: 'Closed right now.',
  languageSwitcher: { label: 'Language' },
}

const es: StorefrontDict = {
  searchPlaceholder: 'Buscar en el menú…',
  nav: { inicio: 'Inicio', ofertas: 'Ofertas', pedidos: 'Pedidos', avaliacoes: 'Reseñas', whatsapp: 'WhatsApp' },
  theme: { light: 'Claro', dark: 'Oscuro' },
  cart: { label: 'Carrito' },
  table: 'Mesa',
  viewOnlyNotice: 'Menú solo para consulta — pida con el personal',
  closedDefault: 'Cerrado en este momento.',
  languageSwitcher: { label: 'Idioma' },
}

export const STOREFRONT_DICTIONARIES: Record<StorefrontLocale, StorefrontDict> = { 'pt-BR': pt, en, es }

export function getStorefrontDictionary(locale: string): StorefrontDict {
  return STOREFRONT_DICTIONARIES[locale as StorefrontLocale] ?? STOREFRONT_DICTIONARIES[STOREFRONT_DEFAULT_LOCALE]
}

export function resolveStorefrontLocale(cookieValue: string | null): StorefrontLocale {
  return (STOREFRONT_LOCALES.some((l) => l.code === cookieValue) ? cookieValue : STOREFRONT_DEFAULT_LOCALE) as StorefrontLocale
}
