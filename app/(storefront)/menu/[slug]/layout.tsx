// app/(storefront)/layout.tsx
// Layout dedicado ao storefront — adiciona fonte Playfair Display para títulos premium

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} font-sans`} style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {/*
        Script de segurança do Mercado Pago — gera um Device ID
        (window.MP_DEVICE_SESSION_ID) usado ao criar pagamentos PIX via API
        direta, pra reduzir recusas de antifraude ("Pagamento rejeitado pelo
        PSP do recebedor"). Sem isso, o MP não recebe nenhum sinal de
        dispositivo do cliente nas chamadas servidor-a-servidor.
      */}
      <Script src="https://www.mercadopago.com/v2/security.js" strategy="afterInteractive" {...({ view: 'checkout' } as any)} />
      {children}
    </div>
  )
}
