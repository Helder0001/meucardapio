// app/(storefront)/layout.tsx
// Layout dedicado ao storefront — adiciona fonte Playfair Display para títulos premium

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} font-sans`} style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {children}
    </div>
  )
}
