// app/not-found.tsx

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🍽️</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Página não encontrada
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          O cardápio ou página que você procura não existe ou foi removido.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-600 transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
