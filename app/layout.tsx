// app/layout.tsx

import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'
import { PwaRegister } from '@/components/shared/pwa-register'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { AnalyticsConsent } from '@/components/shared/analytics-consent'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Meu Cardápio — Cardápio Digital',
    template: '%s | Meu Cardápio',
  },
  description: 'Cardápio digital, pedidos online, delivery, PIX e gestão completa para o seu restaurante.',
  applicationName: 'Meu Cardápio',
  icons: {
    icon: '/logo-icon.png',
    apple: '/logo-icon.png',
  },
  openGraph: {
    title: 'Meu Cardápio — Cardápio Digital',
    description: 'Cardápio digital, pedidos online, delivery, PIX e gestão completa para o seu restaurante.',
    siteName: 'Meu Cardápio',
    // CORREÇÃO: era só o ícone quadrado (512×512) — no WhatsApp/Twitter/
    // Facebook isso aparece cortado/pequeno no preview. 1200×630 é o
    // tamanho padrão que essas plataformas esperam pra um card de link.
    images: [{ url: '/og/default.jpg', width: 1200, height: 630 }],
    locale: 'pt_BR',
  },
  // CORREÇÃO: sem isso, X/Twitter às vezes cai num card pequeno em vez do
  // "summary_large_image" — mesma imagem do OG acima.
  twitter: {
    card: 'summary_large_image',
    title: 'Meu Cardápio — Cardápio Digital',
    description: 'Cardápio digital, pedidos online, delivery, PIX e gestão completa para o seu restaurante.',
    images: ['/og/default.jpg'],
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce gerado no proxy.ts (middleware) por requisição — libera no CSP só
  // os scripts inline que a própria aplicação gerou (ex.: next-themes
  // evitando flash de tema ao carregar), em vez de confiar em 'unsafe-inline'.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster position="top-right" richColors closeButton duration={4000} />
          <PwaRegister />
          <AnalyticsConsent />
        </ThemeProvider>
      </body>
    </html>
  )
}
