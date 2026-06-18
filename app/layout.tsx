// app/layout.tsx
//
// Layout raiz da aplicação.
// Tudo que renderiza aqui aparece em TODAS as páginas.

import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'
import { PwaRegister } from '@/components/shared/pwa-register'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'FoodSaaS — Cardápio Digital e Delivery',
    template: '%s | FoodSaaS',
  },
  description: 'Plataforma completa para restaurantes, pizzarias e deliveries.',
  keywords: ['cardápio digital', 'delivery', 'restaurante', 'pedido online'],
  authors: [{ name: 'FoodSaaS' }],
  creator: 'FoodSaaS',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'FoodSaaS',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        {/* Toast notifications globais */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
        />
            <PwaRegister />
    </body>
    </html>
  )
}
