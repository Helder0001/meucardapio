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
      {/* CORREÇÃO (#12): a caixa com fundo sólido (branco no variant
          "light") atrás da logo aparecia como um quadrado/borda em volta
          dela, já que a logo tem fundo transparente. Fundo removido —
          a logo agora fica direto sobre o gradiente da tela de login,
          sem nenhuma caixa atrás. `object-contain` no lugar de
          `object-cover` evita cortar a imagem. */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center relative flex-shrink-0">
        <Image
          src="/logo-icon.png"
          alt="Meu Cardápio"
          fill
          sizes="32px"
          className="object-contain"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement
            el.style.display = 'none'
            el.nextElementSibling?.classList.remove('hidden')
          }}
        />
        <span className={cn(
          'hidden font-bold text-sm',
          isLight ? 'text-white' : 'text-brand-500'
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
