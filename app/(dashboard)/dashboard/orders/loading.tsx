import { Skeleton, SkeletonTable } from '@/components/shared/skeleton'

export default function OrdersLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-32" />)}
      </div>
      <SkeletonTable rows={8} />
    </div>
  )
}
