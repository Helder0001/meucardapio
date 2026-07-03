import { Skeleton } from '@/components/shared/skeleton'

export default function MenuLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Capa */}
      <Skeleton className="h-40 sm:h-56 w-full rounded-none" />

      <div className="max-w-2xl mx-auto px-4 -mt-8 relative">
        {/* Logo + nome */}
        <div className="flex items-end gap-3 mb-4">
          <Skeleton className="h-20 w-20 rounded-2xl border-4 border-white dark:border-gray-950 flex-shrink-0" />
          <div className="pb-1 space-y-2 flex-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        </div>

        {/* Categorias */}
        <div className="flex gap-2 overflow-hidden mb-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 flex-shrink-0 rounded-full" />
          ))}
        </div>

        {/* Produtos */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800">
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-4 w-16 mt-2" />
              </div>
              <Skeleton className="h-20 w-20 rounded-xl flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
