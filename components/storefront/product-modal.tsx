'use client'
// components/storefront/product-modal.tsx — redesenhado

import { useState, useEffect } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { useCartStore } from '@/lib/store/cart'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Image from 'next/image'

interface Addon { id: string; name: string; price: number }
interface AddonGroup {
  id: string; name: string; minSelect: number; maxSelect: number; isRequired: boolean; addons: Addon[]
}
interface ProductModalProps {
  product: {
    id: string; name: string; description: string | null
    price: number; image: string | null; addonGroups: AddonGroup[]
    isOutOfStock?: boolean
  }
  onClose: () => void
  disabled?: boolean
  primaryColor?: string | null
}

export function ProductModal({ product, onClose, disabled, primaryColor }: ProductModalProps) {
  const color = primaryColor ?? '#f97316'
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { addItem } = useCartStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const toggleAddon = (groupId: string, addonId: string, maxSelect: number) => {
    setSelectedAddons((prev) => {
      const current = prev[groupId] ?? []
      if (current.includes(addonId)) return { ...prev, [groupId]: current.filter((id) => id !== addonId) }
      if (maxSelect === 1) return { ...prev, [groupId]: [addonId] }
      if (current.length >= maxSelect) return prev
      return { ...prev, [groupId]: [...current, addonId] }
    })
    setErrors((prev) => { const next = { ...prev }; delete next[groupId]; return next })
  }

  const addonTotal = product.addonGroups.reduce((sum, group) => {
    const selected = selectedAddons[group.id] ?? []
    return sum + selected.reduce((s, addonId) => {
      const addon = group.addons.find((a) => a.id === addonId)
      return s + (addon?.price ?? 0)
    }, 0)
  }, 0)

  const unitPrice = product.price + addonTotal
  const total = unitPrice * quantity

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    for (const group of product.addonGroups) {
      const selected = selectedAddons[group.id] ?? []
      if (group.isRequired && selected.length < group.minSelect) {
        newErrors[group.id] = `Selecione pelo menos ${group.minSelect} opção`
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAddToCart = () => {
    if (!validate()) return
    const addons = product.addonGroups.flatMap((group) =>
      (selectedAddons[group.id] ?? []).map((addonId) => {
        const addon = group.addons.find((a) => a.id === addonId)!
        return { id: addon.id, name: addon.name, price: addon.price }
      })
    )
    addItem({ productId: product.id, productName: product.name, productPrice: product.price, quantity, notes: notes.trim() || undefined, addons })
    toast.success(`${product.name} adicionado! 🛒`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Imagem */}
        {product.image ? (
          <div className="h-52 sm:h-60 relative rounded-t-3xl overflow-hidden flex-shrink-0">
            <Image src={product.image} alt={product.name} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {/* Nome sobre imagem */}
            <div className="absolute bottom-4 left-5 right-12">
              <h2 className="text-xl font-black text-white leading-tight drop-shadow-sm">{product.name}</h2>
              <p className="text-base font-bold text-white/90 mt-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                {formatCurrency(product.price)}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-5 pt-6 pb-2 flex-shrink-0">
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 pr-10">{product.name}</h2>
            <p className="text-lg font-black mt-1" style={{ color }}>{formatCurrency(product.price)}</p>
          </div>
        )}

        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 bg-white/90 dark:bg-gray-800/90 rounded-2xl flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-white shadow-sm backdrop-blur-sm transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Conteúdo scrollável */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {product.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Grupos de adicionais */}
          {product.addonGroups.map((group) => (
            <div key={group.id} className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-gray-100">{group.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {group.maxSelect === 1 ? 'Escolha 1 opção' : `Escolha até ${group.maxSelect}`}
                  </p>
                </div>
                <span className={cn(
                  'text-[10px] font-black px-2.5 py-1 rounded-xl',
                  group.isRequired
                    ? 'text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                )} style={group.isRequired ? { background: color } : {}}>
                  {group.isRequired ? 'Obrigatório' : 'Opcional'}
                </span>
              </div>

              {errors[group.id] && (
                <p className="text-xs text-red-500 mb-2 font-medium">⚠ {errors[group.id]}</p>
              )}

              <div className="space-y-2">
                {group.addons.map((addon) => {
                  const isSelected = (selectedAddons[group.id] ?? []).includes(addon.id)
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(group.id, addon.id, group.maxSelect)}
                      className={cn(
                        'w-full flex items-center justify-between p-3.5 rounded-2xl border-2 text-left transition-all',
                        isSelected ? 'border-transparent' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                      )}
                      style={isSelected ? { background: `${color}15`, borderColor: `${color}40` } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          group.maxSelect === 1 ? 'rounded-full' : 'rounded-md',
                          isSelected ? 'border-transparent' : 'border-gray-300 dark:border-gray-600'
                        )} style={isSelected ? { background: color } : {}}>
                          {isSelected && (
                            <div className={cn('bg-white', group.maxSelect === 1 ? 'w-2 h-2 rounded-full' : 'w-2.5 h-2.5 rounded-sm')} />
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{addon.name}</span>
                      </div>
                      {addon.price > 0 && (
                        <span className="text-sm font-bold" style={{ color }}>+{formatCurrency(addon.price)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Observações */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              Observações <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, bem passado..."
              rows={2}
              maxLength={200}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Footer */}
        {!disabled ? (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
            {/* Quantidade */}
            <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-2xl px-2 py-1.5">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center font-black text-gray-900 dark:text-gray-100 text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white transition-colors"
                style={{ background: color }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Botão adicionar */}
            <button
              type="button"
              onClick={handleAddToCart}
              className="flex-1 flex items-center justify-between text-white px-5 py-3.5 rounded-2xl font-black transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            >
              <span>Adicionar</span>
              <span>{formatCurrency(total)}</span>
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="w-full text-center py-3.5 rounded-2xl font-black bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
              {product.isOutOfStock ? 'Produto esgotado' : 'Loja fechada no momento'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
