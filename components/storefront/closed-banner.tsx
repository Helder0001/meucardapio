'use client'

// components/storefront/closed-banner.tsx
export function ClosedBanner({ message }: { message: string }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-4 py-3 text-center">
      <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
        🕐 {message}
      </p>
    </div>
  )
}
