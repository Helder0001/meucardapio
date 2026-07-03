import { Skeleton } from '@/components/shared/skeleton'

export default function KanbanLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="w-72 flex-shrink-0 space-y-3">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 3 }).map((_, card) => (
              <Skeleton key={card} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
