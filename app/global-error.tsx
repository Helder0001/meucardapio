'use client'
// app/global-error.tsx
//
// Só dispara quando o PRÓPRIO app/layout.tsx quebra (erro raríssimo,
// tipo um provider global explodindo) — nesse caso o Next não tem mais
// nenhum <html>/<body> renderizado, então (e só nesse arquivo) precisa
// fornecer os próprios. Erros normais de página são pegos por
// app/error.tsx, que roda ANINHADO dentro do layout e por isso NÃO deve
// repetir esses wrappers.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
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
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Algo deu errado
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Ocorreu um erro inesperado. Nossa equipe foi notificada.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 font-mono mb-4">
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-600 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
