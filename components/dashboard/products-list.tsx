'use client'

// components/dashboard/products-list.tsx

import { useState, useTransition } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { toggleProductActive } from '@/actions/products/toggle-active'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Edit2, TrendingUp, Package, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface Product {
  id: string
  name: string
  price: number
  isActive: boolean
  isFeatured: boolean
  isBestSeller: boolean
  soldCount: number
  image: string | null
  category: { name: string }
}

interface ProductsListProps {
  products: Product[]
  categories: Array<{ id: string; name: string }>
}

export function ProductsList({ products, categories }: ProductsListProps) {
  const [filter, setFilter] = useState<string>('all')
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? products
    : products.filter((p) => p.category.name === filter)

  const handleToggle = (productId: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await toggleProductActive(productId, !currentActive)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(currentActive ? 'Produto desativado' : 'Produto ativado')
      }
    })
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Excluir "${product.name}"? Esta ação não pode ser desfeita.`)) return
    setDeletingId(product.id)
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Produto excluído com sucesso!')
        window.location.reload()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'Erro ao excluir produto')
      }
    } catch {
      toast.error('Erro ao excluir produto')
    } finally {
      setDeletingId(null)
    }
  }

  const categoryNames = ['all', ...categories.map((c) => c.name)]

  return (
    <div className="space-y-4">
      {/* Filtro por categoria */}
      <div className="flex gap-2 flex-wrap">
        {categoryNames.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              filter === cat
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            {cat === 'all' ? 'Todos' : cat}
          </button>
        ))}
      </div>

      {/* Grid de produtos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((product) => (
          <div
            key={product.id}
            className={cn(
              'bg-card border border-border rounded-xl overflow-hidden transition-all',
              !product.isActive && 'opacity-60',
              deletingId === product.id && 'opacity-40 pointer-events-none'
            )}
          >
            {/* Imagem */}
            <div className="relative aspect-square bg-muted">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">
                  🍽️
                </div>
              )}
              {/* Badges */}
              <div className="absolute top-2 left-2 flex gap-1">
                {product.isFeatured && (
                  <span className="bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    ⭐
                  </span>
                )}
                {product.isBestSeller && (
                  <span className="bg-brand-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    🔥
                  </span>
                )}
              </div>
            </div>

            {/* Conteúdo */}
            <div className="p-3">
              <div className="flex items-start justify-between gap-1 mb-1">
                <p className="font-semibold text-sm text-foreground leading-tight line-clamp-1">
                  {product.name}
                </p>
                <p className="font-bold text-sm text-foreground flex-shrink-0">
                  {formatCurrency(product.price)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {product.category.name}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>{product.soldCount} vendas</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Toggle ativo/inativo */}
                  <button
                    onClick={() => handleToggle(product.id, product.isActive)}
                    disabled={isPending}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors',
                      product.isActive ? 'bg-emerald-500' : 'bg-muted'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      product.isActive ? 'left-4' : 'left-0.5'
                    )} />
                  </button>

                  {/* Editar */}
                  <Link
                    href={`/dashboard/menu/products/${product.id}`}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Link>

                  {/* Excluir */}
                  <button
                    onClick={() => handleDelete(product)}
                    disabled={deletingId === product.id}
                    title="Excluir produto"
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                  >
                    {deletingId === product.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum produto nesta categoria</p>
        </div>
      )}
    </div>
  )
}
