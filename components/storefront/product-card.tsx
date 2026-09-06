'use client'
// components/storefront/product-card.tsx — premium redesign

import { formatCurrency } from '@/lib/utils/format'
import { Clock, Flame, Star, Plus } from 'lucide-react'
import Image from 'next/image'

interface ProductCardProps {
  product: {
    id: string; name: string; description: string | null
    price: number; comparePrice: number | null; image: string | null
    isFeatured: boolean; isBestSeller: boolean; isOutOfStock?: boolean
    preparationTime: number | null; tags: string[]; addonGroups: any[]
  }
  onSelect: () => void
  disabled?: boolean
  primaryColor?: string | null
}

export function ProductCard({ product, onSelect, disabled, primaryColor }: ProductCardProps) {
  const color = primaryColor ?? '#f97316'
  const hasDiscount = product.comparePrice && product.comparePrice > product.price
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / product.comparePrice!) * 100)
    : 0

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="group relative flex bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 text-left transition-all duration-200 hover:shadow-lg hover:shadow-gray-900/8 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed w-full"
    >
      {/* Imagem lateral */}
      <div className="relative flex-shrink-0 w-28 h-28 sm:w-32 sm:h-32 overflow-hidden bg-gray-100 dark:bg-gray-800">
        {product.image ? (
          <Image
            src={product.image} alt={product.name} fill
            sizes="(max-width: 640px) 112px, 128px"
            className={`object-cover group-hover:scale-105 transition-transform duration-400 ${product.isOutOfStock ? 'grayscale opacity-60' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
            🍽️
          </div>
        )}
        {hasDiscount && !product.isOutOfStock && (
          <div className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-lg shadow-sm">
            -{discountPct}%
          </div>
        )}
        {product.isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-gray-100 text-[10px] font-black px-2 py-1 rounded-lg shadow-sm">
              Esgotado
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between">
        <div>
          {/* Badges */}
          {(product.isBestSeller || product.isFeatured) && (
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {product.isBestSeller && (
                <span className="inline-flex items-center gap-1 text-[9px] font-black bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded-lg border border-brand-100 dark:border-brand-900/40">
                  <Flame className="w-2.5 h-2.5" /> Mais pedido
                </span>
              )}
              {product.isFeatured && !product.isBestSeller && (
                <span className="inline-flex items-center gap-1 text-[9px] font-black bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-lg border border-amber-100 dark:border-amber-900/40">
                  <Star className="w-2.5 h-2.5" /> Destaque
                </span>
              )}
            </div>
          )}

          {/* Nome */}
          <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-snug line-clamp-1 mb-0.5">
            {product.name}
          </h3>

          {/* Descrição */}
          {product.description && (
            <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-end justify-between mt-2.5 gap-2">
          <div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-black text-sm" style={{ color }}>
                {formatCurrency(product.price)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-gray-400 line-through leading-none">
                  {formatCurrency(product.comparePrice!)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {product.preparationTime && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400 font-medium">
                  <Clock className="w-3 h-3" />
                  {product.preparationTime}min
                </span>
              )}
              {product.addonGroups.length > 0 && (
                <span className="text-[10px] text-gray-400">+ opções</span>
              )}
            </div>
          </div>

          {/* Botão + */}
          {!disabled && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-200"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)`, boxShadow: `0 2px 8px ${color}44` }}
            >
              <Plus className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
