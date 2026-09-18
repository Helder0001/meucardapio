// app/(storefront)/layout.tsx
// Layout dedicado ao storefront — adiciona fonte Playfair Display para títulos premium

import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import { readLocaleCookie } from '@/lib/i18n/cookies'
import { STOREFRONT_LOCALE_COOKIE, getStorefrontDictionary, resolveStorefrontLocale } from '@/lib/i18n/storefront'
import { StorefrontI18nProvider } from '@/lib/i18n/storefront-context'

// CORREÇÃO (#6): trocado de Inter pra Poppins, pra bater com o visual do
// Cardápio Web de referência (traços mais geométricos/arredondados).
// Obs: não consegui inspecionar a fonte exata do site de referência (é
// uma SPA que só carrega o CSS via JS, e a ferramenta de busca não
// executa JavaScript) — Poppins foi escolhida por semelhança visual nas
// capturas de tela enviadas. Se não bater 100%, é só avisar.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-inter' })

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  // Idioma do CLIENTE que está navegando o cardápio — cookie e contexto
  // próprios deste escopo, independentes do dashboard e da landing (ver
  // lib/i18n/storefront.ts).
  const locale = resolveStorefrontLocale(await readLocaleCookie(STOREFRONT_LOCALE_COOKIE))
  const dict = getStorefrontDictionary(locale)

  return (
    <div className={`${poppins.variable} font-sans`} style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      <StorefrontI18nProvider locale={locale} dict={dict}>
        {children}
      </StorefrontI18nProvider>
    </div>
  )
}
