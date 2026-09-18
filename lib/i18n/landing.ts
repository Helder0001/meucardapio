// lib/i18n/landing.ts
//
// Dicionário do escopo LANDING (site de marketing, app/page.tsx +
// components/marketing/home-page-client.tsx) — cookie e contexto
// independentes do dashboard e do storefront. Hoje cobre a barra de topo,
// o nav e o hero (primeira seção). O resto da página (features, planos,
// FAQ, rodapé — é grande, ~900 linhas) ainda está só em português; ver
// I18N-ROADMAP.md para o plano de continuação.

export type LandingLocale = 'pt-BR' | 'en' | 'es'

export const LANDING_LOCALE_COOKIE = 'mc_landing_locale'
export const LANDING_DEFAULT_LOCALE: LandingLocale = 'pt-BR'

export const LANDING_LOCALES: { code: LandingLocale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

export interface LandingDict {
  topBar: { trialBadge: string; rest: string }
  nav: {
    funcionalidades: string; comoFunciona: string; planos: string; faq: string
    entrar: string; comecarGratis: string
  }
  theme: { light: string; dark: string; toggleAria: string }
  hero: { badge: string; titleStart: string; titleHighlight: string; subtitle: string; ctaPrimary: string; ctaSecondary: string }
  languageSwitcher: { label: string }
}

const pt: LandingDict = {
  topBar: { trialBadge: '7 dias grátis', rest: 'Sem fidelidade · Cancele quando quiser' },
  nav: { funcionalidades: 'Funcionalidades', comoFunciona: 'Como funciona', planos: 'Planos', faq: 'FAQ', entrar: 'Entrar', comecarGratis: 'Começar grátis' },
  theme: { light: 'Modo claro', dark: 'Modo escuro', toggleAria: 'Alternar tema' },
  hero: {
    badge: '✦ Novo: IA para descrição de produtos',
    titleStart: 'Seu restaurante no controle.',
    titleHighlight: 'Seus pedidos organizados.',
    subtitle: 'Cardápio digital + pedidos + Kanban + WhatsApp + pagamentos em uma única plataforma. Seu cliente pede pelo celular e sua equipe acompanha tudo, do pedido até a entrega.',
    ctaPrimary: 'Começar grátis',
    ctaSecondary: 'Ver cardápio demo',
  },
  languageSwitcher: { label: 'Idioma' },
}

const en: LandingDict = {
  topBar: { trialBadge: '7-day free trial', rest: 'No contract · Cancel anytime' },
  nav: { funcionalidades: 'Features', comoFunciona: 'How it works', planos: 'Pricing', faq: 'FAQ', entrar: 'Log in', comecarGratis: 'Start free' },
  theme: { light: 'Light mode', dark: 'Dark mode', toggleAria: 'Toggle theme' },
  hero: {
    badge: '✦ New: AI for product descriptions',
    titleStart: 'Your restaurant in control.',
    titleHighlight: 'Your orders organized.',
    subtitle: 'Digital menu + orders + Kanban + WhatsApp + payments in a single platform. Your customer orders from their phone and your team tracks everything, from order to delivery.',
    ctaPrimary: 'Start free',
    ctaSecondary: 'See a demo menu',
  },
  languageSwitcher: { label: 'Language' },
}

const es: LandingDict = {
  topBar: { trialBadge: '7 días gratis', rest: 'Sin fidelidad · Cancela cuando quieras' },
  nav: { funcionalidades: 'Funciones', comoFunciona: 'Cómo funciona', planos: 'Planes', faq: 'FAQ', entrar: 'Iniciar sesión', comecarGratis: 'Empezar gratis' },
  theme: { light: 'Modo claro', dark: 'Modo oscuro', toggleAria: 'Cambiar tema' },
  hero: {
    badge: '✦ Nuevo: IA para descripción de productos',
    titleStart: 'Tu restaurante bajo control.',
    titleHighlight: 'Tus pedidos organizados.',
    subtitle: 'Menú digital + pedidos + Kanban + WhatsApp + pagos en una sola plataforma. Tu cliente pide desde el celular y tu equipo acompaña todo, del pedido a la entrega.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver menú demo',
  },
  languageSwitcher: { label: 'Idioma' },
}

export const LANDING_DICTIONARIES: Record<LandingLocale, LandingDict> = { 'pt-BR': pt, en, es }

export function getLandingDictionary(locale: string): LandingDict {
  return LANDING_DICTIONARIES[locale as LandingLocale] ?? LANDING_DICTIONARIES[LANDING_DEFAULT_LOCALE]
}

export function resolveLandingLocale(cookieValue: string | null): LandingLocale {
  return (LANDING_LOCALES.some((l) => l.code === cookieValue) ? cookieValue : LANDING_DEFAULT_LOCALE) as LandingLocale
}
