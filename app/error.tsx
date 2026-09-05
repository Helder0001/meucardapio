'use client'
// app/error.tsx — error boundary pra erros dentro do layout normal.
//
// CORREÇÃO: esse arquivo renderizava <html><body> por dentro, só que
// error.tsx roda ANINHADO dentro do app/layout.tsx (que já tem seu
// próprio <html><body>) — só global-error.tsx (que substitui o layout
// inteiro quando o próprio layout quebra) deve ter esses wrappers. Como
// estava, gerava <html>/<body> duplicados e aninhados de verdade no DOM.
// Ver app/global-error.tsx pro caso do layout raiz quebrar.
//
// Também nunca chamava Sentry.captureException de verdade — só tinha um
// comentário dizendo que "o Sentry captura automaticamente", o que não
// acontece sozinho sem essa chamada explícita.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Algo deu errado
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
          Ocorreu um erro inesperado. Nossa equipe foi notificada.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono mb-4">
            Código: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm hover:bg-brand-600 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
