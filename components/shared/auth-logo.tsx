// components/shared/auth-logo.tsx
//
// NOVO: componente compartilhado para exibir a logo "Meu Cardápio" nas
// páginas de autenticação (login, registro, recuperação de senha), com
// fallback para um ícone "M" caso /public/logo-icon.png não esteja configurado.

'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AuthLogoProps {
  /** 'light' para fundo colorido (texto branco), 'dark' para fundo claro */
  variant?: 'light' | 'dark'
  className?: string
}

export function AuthLogo({ variant = 'dark', className }: AuthLogoProps) {
  const isLight = variant === 'light'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden relative flex-shrink-0',
        isLight ? 'bg-white' : 'bg-brand-500'
      )}>
        <Image
          src="/logo-icon.png"
          alt="Meu Cardápio"
          fill
          className="object-cover"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement
            el.style.display = 'none'
            el.nextElementSibling?.classList.remove('hidden')
          }}
        />
        <span className={cn(
          'hidden font-bold text-sm',
          isLight ? 'text-brand-600' : 'text-white'
        )}>
          M
        </span>
      </div>
      <span className={cn(
        'font-semibold text-lg',
        isLight ? 'text-white' : 'text-foreground'
      )}>
        Meu Cardápio
      </span>
    </div>
  )
}
