'use client'

// components/shared/theme-provider.tsx
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
