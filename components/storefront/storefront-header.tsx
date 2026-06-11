'use client'
// components/storefront/storefront-header.tsx — redesenhado

import { ShoppingBag, MapPin, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface StorefrontHeaderProps {
  tenant: { name: string; logo: string | null; primaryColor: string | null }
  tableInfo: { number: number; sector: string } | null
  cartCount: number
  cartTotal: number
  onCartOpen: () => void
}

export function StorefrontHeader({ tenant, tableInfo, cartCount, cartTotal, onCartOpen }: StorefrontHeaderProps) {
  const color = tenant.primaryColor ?? '#f97316'

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-900/5">
      <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">

        {/* Logo + nome */}
        <div className="flex items-center gap-3 min-w-0">
          {tenant.logo ? (
            <img
              src={tenant.logo}
              alt={tenant.name}
              className="w-10 h-10 rounded-2xl object-cover flex-shrink-0 shadow-sm"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            >
              {tenant.name[0]}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="font-black text-sm text-gray-900 dark:text-gray-100 leading-tight truncate">
              {tenant.name}
            </h1>
            {tableInfo ? (
              <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Mesa {tableInfo.number} · {tableInfo.sector}
              </p>
            ) : (
              <p className="text-[11px] font-medium flex items-center gap-1" style={{ color }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Aberto agora
              </p>
            )}
          </div>
        </div>

        {/* Carrinho */}
        {cartCount > 0 && (
          <button
            onClick={onCartOpen}
            className="relative flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 hover:opacity-90 shadow-sm flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>{cartCount}</span>
            <span className="hidden sm:inline text-xs font-semibold opacity-90">
              · {formatCurrency(cartTotal)}
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
