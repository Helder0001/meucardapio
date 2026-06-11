// components/shared/pwa-register.tsx
// Registra o Service Worker e exibe prompt de instalação do PWA.
// Colocar no app/layout.tsx (client component).

'use client'

import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('[PWA] SW registration failed:', err))
  }, [])

  return null
}
