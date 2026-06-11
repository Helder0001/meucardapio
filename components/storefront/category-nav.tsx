'use client'
// components/storefront/category-nav.tsx — redesenhado

import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface CategoryNavProps {
  categories: Array<{ id: string; name: string }>
  activeCategoryId: string | null
  onCategoryClick: (id: string) => void
  primaryColor?: string | null
}

export function CategoryNav({ categories, activeCategoryId, onCategoryClick, primaryColor }: CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const color = primaryColor ?? '#f97316'

  return (
    <div className="sticky top-16 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800">
      <div
        ref={scrollRef}
        className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryClick(cat.id)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-2xl text-sm font-bold transition-all active:scale-95',
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
              style={isActive ? { background: `linear-gradient(135deg, ${color}, ${color}cc)` } : {}}
            >
              {cat.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
