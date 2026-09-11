'use client'

// components/dashboard/menu/import-menu-client.tsx
//
// Fluxo: upload (foto/PDF) → "Analisar com IA" → prévia editável
// (categorias/produtos com checkbox, nome/descrição/preço editáveis e
// selo de confiança) → "Importar N produtos" → grava no banco de vez.

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Loader2, Trash2, Sparkles, ArrowLeft } from 'lucide-react'

type Product = { name: string; description: string; price: number; confidence: number; _selected: boolean }
type Category = { name: string; products: Product[] }

function confidenceBadge(c: number) {
  if (c >= 0.85) return { emoji: '🟢', label: 'leitura segura', cls: 'text-emerald-600 dark:text-emerald-400' }
  if (c >= 0.6)  return { emoji: '🟡', label: 'confira este item', cls: 'text-amber-600 dark:text-amber-400' }
  return { emoji: '🔴', label: 'baixa confiança — revise', cls: 'text-red-600 dark:text-red-400' }
}

export function ImportMenuClient() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile]           = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [categories, setCategories] = useState<Category[] | null>(null)

  const handleFilePick = (f: File | null) => {
    setFile(f)
    setCategories(null)
  }

  const analyze = async () => {
    if (!file) return
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/ai/import-menu', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não conseguimos analisar esse arquivo.')
        return
      }
      const withSelection: Category[] = data.menu.categories.map((c: any) => ({
        name: c.name,
        products: c.products.map((p: any) => ({ ...p, _selected: true })),
      }))
      setCategories(withSelection)
      toast.success(`${data.totalProducts} produtos identificados — revise antes de importar.`)
    } catch {
      toast.error('Erro ao analisar o arquivo. Tente novamente.')
    } finally {
      setAnalyzing(false)
    }
  }

  const updateProduct = (ci: number, pi: number, patch: Partial<Product>) => {
    setCategories((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[ci] = { ...next[ci], products: [...next[ci].products] }
      next[ci].products[pi] = { ...next[ci].products[pi], ...patch }
      return next
    })
  }

  const removeProduct = (ci: number, pi: number) => {
    setCategories((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[ci] = { ...next[ci], products: next[ci].products.filter((_, i) => i !== pi) }
      return next.filter((c) => c.products.length > 0)
    })
  }

  const selectedCount = categories?.reduce(
    (sum, c) => sum + c.products.filter((p) => p._selected).length, 0
  ) ?? 0

  const confirmImport = async () => {
    if (!categories) return
    setConfirming(true)
    try {
      const payload = {
        categories: categories
          .map((c) => ({ name: c.name, products: c.products.filter((p) => p._selected) }))
          .filter((c) => c.products.length > 0),
      }
      const res = await fetch('/api/ai/import-menu/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao importar o cardápio.')
        return
      }
      toast.success(`${data.createdProducts} produtos importados em ${data.createdCategories} categoria(s) nova(s)!`)
      router.push('/dashboard/menu/products')
      router.refresh()
    } catch {
      toast.error('Erro ao importar. Tente novamente.')
    } finally {
      setConfirming(false)
    }
  }

  // ── Tela 1: upload ────────────────────────────────────────────────────
  if (!categories) {
    return (
      <div className="max-w-xl mx-auto">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          {file ? (
            <p className="text-sm font-medium text-foreground">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Envie uma foto ou PDF do seu cardápio</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP ou PDF — até 15MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
          />
        </div>

        <button
          onClick={analyze}
          disabled={!file || analyzing}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {analyzing ? 'Analisando com IA…' : 'Analisar com IA'}
        </button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          A IA não vai cadastrar nada automaticamente — você revisa e confirma antes.
        </p>
      </div>
    )
  }

  // ── Tela 2: prévia editável ──────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button
        onClick={() => setCategories(null)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Enviar outro arquivo
      </button>

      {categories.map((category, ci) => (
        <div key={ci} className="rounded-2xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 font-semibold text-sm text-foreground">
            {category.name}
          </div>
          <div className="divide-y divide-border">
            {category.products.map((product, pi) => {
              const badge = confidenceBadge(product.confidence)
              return (
                <div key={pi} className="p-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={product._selected}
                    onChange={(e) => updateProduct(ci, pi, { _selected: e.target.checked })}
                    className="mt-2.5 h-4 w-4 rounded border-input"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      value={product.name}
                      onChange={(e) => updateProduct(ci, pi, { name: e.target.value })}
                      className="w-full text-sm font-medium bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0 py-0.5"
                    />
                    <input
                      value={product.description}
                      placeholder="Descrição (opcional)"
                      onChange={(e) => updateProduct(ci, pi, { description: e.target.value })}
                      className="w-full text-xs text-muted-foreground bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0 py-0.5"
                    />
                    <p className={`text-[11px] ${badge.cls}`}>{badge.emoji} {Math.round(product.confidence * 100)}% — {badge.label}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-muted-foreground text-xs">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={product.price}
                      onChange={(e) => updateProduct(ci, pi, { price: parseFloat(e.target.value) || 0 })}
                      className="w-16 text-sm text-right bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0 py-0.5"
                    />
                    <button onClick={() => removeProduct(ci, pi)} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <button
        onClick={confirmImport}
        disabled={selectedCount === 0 || confirming}
        className="sticky bottom-4 w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-colors"
      >
        {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirming ? 'Importando…' : `✓ Importar ${selectedCount} produto${selectedCount !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
