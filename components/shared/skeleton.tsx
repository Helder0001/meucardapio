// components/shared/skeleton.tsx
//
// Skeleton genérico — usado nos loading.tsx do dashboard e do cardápio
// digital, no lugar de uma tela em branco ou um spinner solto.

import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-muted', className)} />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  )
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-32 flex-1 max-w-[10rem]" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
