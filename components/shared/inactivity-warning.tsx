'use client'

// components/shared/inactivity-warning.tsx
// Exibe aviso 2 minutos antes do logout por inatividade

import { useInactivityLogout } from '@/hooks/use-inactivity-logout'
import { Clock, LogOut } from 'lucide-react'

export function InactivityWarning() {
  const { showWarning, countdown, stayLoggedIn, doLogout } = useInactivityLogout()

  if (!showWarning) return null

  const minutes = Math.floor(countdown / 60)
  const seconds = countdown % 60
  const timeStr = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}s`

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>

        <h2 className="font-bold text-foreground text-lg mb-1">
          Sessão expirando
        </h2>
        <p className="text-muted-foreground text-sm mb-4">
          Por inatividade, você será desconectado em
        </p>

        <div className="text-4xl font-bold text-amber-600 dark:text-amber-400 mb-5 font-mono">
          {timeStr}
        </div>

        <div className="flex gap-3">
          <button
            onClick={doLogout}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair agora
          </button>
          <button
            onClick={stayLoggedIn}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
