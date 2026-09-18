'use client'

// lib/i18n/create-scope.tsx
//
// Fábrica genérica de um "escopo" de i18n isolado (Provider + hooks). Cada
// área do produto (dashboard, storefront, landing) chama isso UMA vez e
// exporta seu próprio Provider/hooks — o Context é criado por escopo, então
// trocar o idioma de um nunca reaparece em outro (são objetos totalmente
// separados, sem estado compartilhado).
//
// De propósito NÃO guarda o locale em state interno: o Provider só reflete
// o que o Server Component pai já resolveu a partir do cookie daquele
// escopo. Trocar de idioma = server action grava o cookie + router.refresh()
// (ver components/shared/language-switcher.tsx), que re-renderiza a árvore
// server-side com o dicionário novo. Mais simples e sem risco de o client
// ficar com um estado dessincronizado do que foi de fato salvo.

import { createContext, useContext, type ReactNode } from 'react'

export function createI18nScope<TDict>() {
  const Context = createContext<{ locale: string; dict: TDict } | null>(null)

  function I18nProvider({ locale, dict, children }: { locale: string; dict: TDict; children: ReactNode }) {
    return <Context.Provider value={{ locale, dict }}>{children}</Context.Provider>
  }

  function useDict(): TDict {
    const ctx = useContext(Context)
    if (!ctx) throw new Error('Hook de i18n usado fora do Provider deste escopo — confira o layout.')
    return ctx.dict
  }

  function useLocale(): string {
    const ctx = useContext(Context)
    if (!ctx) throw new Error('Hook de i18n usado fora do Provider deste escopo — confira o layout.')
    return ctx.locale
  }

  return { I18nProvider, useDict, useLocale }
}
