// lib/i18n/format.ts
//
// Helper pra strings do dicionário com placeholders tipo '{name}', '{max}'
// — usado nos 3 escopos (dashboard/storefront/landing) sempre que uma
// tradução precisa de um valor dinâmico no meio da frase (nome do
// produto, número mínimo/máximo de opções etc.).

export function fmt(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}
