// app/layout.tsx

import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'
import { PwaRegister } from '@/components/shared/pwa-register'
import { ThemeProvider } from '@/components/shared/theme-provider'
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
    images: ['/logo-icon.png'],
    locale: 'pt_BR',
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton duration={4000} />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
