// app/(storefront)/layout.tsx
// Layout dedicado ao storefront — adiciona fonte Playfair Display para títulos premium

import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'

// CORREÇÃO (#6): trocado de Inter pra Poppins, pra bater com o visual do
// Cardápio Web de referência (traços mais geométricos/arredondados).
// Obs: não consegui inspecionar a fonte exata do site de referência (é
// uma SPA que só carrega o CSS via JS, e a ferramenta de busca não
// executa JavaScript) — Poppins foi escolhida por semelhança visual nas
// capturas de tela enviadas. Se não bater 100%, é só avisar.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-inter' })

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${poppins.variable} font-sans`} style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {children}
    </div>
  )
}
