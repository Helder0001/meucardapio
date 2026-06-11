'use client'

// components/dashboard/product-form.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { createProductAction } from '@/actions/products/create-product'
import { useState, useRef } from 'react'
import { Loader2, Sparkles, Upload, X, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface Category { id: string; name: string }

interface ProductFormProps {
  categories: Category[]
  product?: {
    id: string
    name: string
    description: string | null
    price: number
    comparePrice?: number | null
    categoryId: string
    isActive: boolean
    isFeatured: boolean
    isBestSeller?: boolean
    preparationTime: number | null
    ingredients: string[]
    image?: string | null
  }
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Salvando...' : 'Salvar produto'}
    </button>
  )
}

export function ProductForm({ categories, product }: ProductFormProps) {
  const [state, formAction] = useFormState(createProductAction, {})
  const [ingredients, setIngredients] = useState<string[]>(product?.ingredients ?? [])
  const [ingredientInput, setIngredientInput] = useState('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [description, setDescription] = useState(product?.description ?? '')
  const [productName, setProductName] = useState(product?.name ?? '')

  // Image upload state
  const [imageUrl, setImageUrl] = useState<string>(product?.image ?? '')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (file: File) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 5MB.')
      return
    }
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'product')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erro ao enviar imagem'); return }
      setImageUrl(data.url)
      toast.success('Imagem enviada!')
    } catch {
      toast.error('Erro ao enviar imagem')
    } finally {
      setIsUploading(false)
    }
  }

  const addIngredient = () => {
    const val = ingredientInput.trim()
    if (val && !ingredients.includes(val)) {
      setIngredients((prev) => [...prev, val])
      setIngredientInput('')
    }
  }

  const removeIngredient = (ing: string) =>
    setIngredients((prev) => prev.filter((i) => i !== ing))

  const generateDescription = async () => {
    if (!productName) { toast.error('Informe o nome do produto primeiro'); return }
    setIsGeneratingAI(true)
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, ingredients }),
      })
      const data = await res.json()
      if (data.description) {
        setDescription(data.description)
        toast.success('Descrição gerada com IA!')
      }
    } catch {
      toast.error('Erro ao gerar descrição')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {product && <input type="hidden" name="productId" value={product.id} />}
      {/* Foto do produto — campo hidden com a URL */}
      <input type="hidden" name="image" value={imageUrl} />

      {state.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* ── Foto do produto ── */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Foto do produto
        </label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-28 h-28 rounded-2xl border-2 border-dashed border-input hover:border-primary flex items-center justify-center bg-muted cursor-pointer overflow-hidden flex-shrink-0 transition-colors group"
          >
            {imageUrl ? (
              <>
                <Image
                  src={imageUrl}
                  alt="Foto do produto"
                  fill
                  className="object-cover rounded-2xl"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                  <Upload className="h-5 w-5 text-white" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                {isUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-[10px] font-medium">Clique para enviar</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 border border-input rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
            >
              {isUploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><Upload className="h-4 w-4" /> {imageUrl ? 'Trocar imagem' : 'Enviar imagem'}</>
              )}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
              >
                <X className="h-3 w-3" /> Remover foto
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              JPG, PNG ou WebP. Máximo 5MB.<br />
              Recomendado: 800×600px.
            </p>
          </div>
        </div>

        {/* Input file oculto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImageUpload(file)
            e.target.value = ''
          }}
        />
      </div>

      {/* ── Categoria ── */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Categoria *</label>
        <select
          name="categoryId"
          defaultValue={product?.categoryId ?? ''}
          required
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Selecione uma categoria</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* ── Nome ── */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Nome do produto *</label>
        <input
          name="name"
          type="text"
          required
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Ex: Pizza Margherita"
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* ── Descrição com IA ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-foreground">Descrição</label>
          <button
            type="button"
            onClick={generateDescription}
            disabled={isGeneratingAI}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-60"
          >
            {isGeneratingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Gerar com IA
          </button>
        </div>
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o produto de forma apetitosa..."
          rows={3}
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* ── Preços ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Preço (R$) *</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.price}
            placeholder="0,00"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Preço original <span className="text-muted-foreground font-normal">(para mostrar desconto)</span>
          </label>
          <input
            name="comparePrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.comparePrice ?? undefined}
            placeholder="0,00"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* ── Tempo de preparo ── */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Tempo de preparo (min)</label>
        <input
          name="preparationTime"
          type="number"
          min="1"
          defaultValue={product?.preparationTime ?? undefined}
          placeholder="Ex: 20"
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* ── Ingredientes ── */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Ingredientes</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={ingredientInput}
            onChange={(e) => setIngredientInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient() } }}
            placeholder="Ex: Mussarela"
            className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={addIngredient}
            className="px-3 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70 transition-colors"
          >
            Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ingredients.map((ing) => (
            <span key={ing} className="flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full">
              {ing}
              <button type="button" onClick={() => removeIngredient(ing)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {ingredients.map((ing) => (
          <input key={ing} type="hidden" name="ingredients" value={ing} />
        ))}
      </div>

      {/* ── Opções ── */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={product?.isActive ?? true}
            className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
          />
          <span className="text-sm text-foreground">Produto ativo</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isFeatured"
            defaultChecked={product?.isFeatured ?? false}
            className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
          />
          <span className="text-sm text-foreground">⭐ Destaque</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isBestSeller"
            defaultChecked={product?.isBestSeller ?? false}
            className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
          />
          <span className="text-sm text-foreground">🔥 Mais pedido</span>
        </label>
      </div>

      <SubmitButton />
    </form>
  )
}
