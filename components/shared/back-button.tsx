'use client'

// components/shared/back-button.tsx
//
// CORREÇÃO: extraído de páginas Server Component que tinham
// onClick={() => history.back()} diretamente no JSX, o que causa o erro
// "Event handlers cannot be passed to Client Component props" e quebra a
// página inteira ("Algo deu errado").

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackButton({ label = '← Voltar' }: { label?: string }) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
    >
      {label === '← Voltar' ? (
        <>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </>
      ) : (
        label
      )}
    </button>
  )
}
