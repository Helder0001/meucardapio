'use client'
// app/error.tsx

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Sentry captura automaticamente via @sentry/nextjs
    console.error(error)
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
            className="px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm hover:bg-brand-600 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
