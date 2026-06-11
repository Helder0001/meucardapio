'use client'
// components/dashboard/product-edit-form.tsx

import { useState, useTransition } from 'react'
import { updateProductAction } from '@/actions/products/update-product'
import { ImageUpload } from '@/components/shared/image-upload'
import { Loader2, Sparkles, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Addon      { id: string; name: string; price: number; isActive: boolean }
interface AddonGroup { id: string; name: string; minSelect: number; maxSelect: number; isRequired: boolean; addons: Addon[] }

interface ProductEditFormProps {
  product: {
    id: string; name: string; description: string | null; price: number
    comparePrice: number | null; categoryId: string; isActive: boolean
    isFeatured: boolean; isBestSeller: boolean; preparationTime: number | null
    ingredients: string[]; image: string | null; tags: string[]
    addonGroupIds: string[]
  }
  categories:     Array<{ id: string; name: string }>
  allAddonGroups: AddonGroup[]
}

export function ProductEditForm({ product, categories, allAddonGroups }: ProductEditFormProps) {
  const router = useRouter()
  const [isPending, start] = useTransition()

  // Estado local do formulário
  const [name,            setName]            = useState(product.name)
  const [description,     setDescription]     = useState(product.description ?? '')
  const [price,           setPrice]           = useState(String(product.price))
  const [comparePrice,    setComparePrice]    = useState(product.comparePrice ? String(product.comparePrice) : '')
  const [categoryId,      setCategoryId]      = useState(product.categoryId)
  const [preparationTime, setPreparationTime] = useState(product.preparationTime ? String(product.preparationTime) : '')
  const [isActive,        setIsActive]        = useState(product.isActive)
  const [isFeatured,      setIsFeatured]      = useState(product.isFeatured)
  const [isBestSeller,    setIsBestSeller]    = useState(product.isBestSeller)
  const [image,           setImage]           = useState(product.image ?? '')
  const [ingredients,     setIngredients]     = useState<string[]>(product.ingredients)
  const [ingredientInput, setIngredientInput] = useState('')
  const [tags,            setTags]            = useState<string[]>(product.tags)
  const [tagInput,        setTagInput]        = useState('')
  const [selectedGroups,  setSelectedGroups]  = useState<string[]>(product.addonGroupIds)
  const [isGeneratingAI,  setIsGeneratingAI]  = useState(false)

  const addIngredient = () => {
    const v = ingredientInput.trim()
    if (v && !ingredients.includes(v)) { setIngredients((p) => [...p, v]); setIngredientInput('') }
  }

  const addTag = () => {
    const v = tagInput.trim().toLowerCase()
    if (v && !tags.includes(v)) { setTags((p) => [...p, v]); setTagInput('') }
  }

  const toggleGroup = (id: string) =>
    setSelectedGroups((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id])

  const generateDescription = async () => {
    if (!name) { toast.error('Informe o nome primeiro'); return }
    setIsGeneratingAI(true)
    try {
      const res  = await fetch('/api/ai/generate-description', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productName: name, ingredients }),
      })
      const data = await res.json()
      if (data.description) { setDescription(data.description); toast.success('Descrição gerada!') }
      else toast.error(data.error ?? 'Erro ao gerar')
    } catch { toast.error('Erro de conexão') }
    finally { setIsGeneratingAI(false) }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const fd = new FormData()
      fd.set('productId',      product.id)
      fd.set('name',           name)
      fd.set('description',    description)
      fd.set('price',          price)
      fd.set('comparePrice',   comparePrice)
      fd.set('categoryId',     categoryId)
      fd.set('preparationTime',preparationTime)
      fd.set('isActive',       String(isActive))
      fd.set('isFeatured',     String(isFeatured))
      fd.set('isBestSeller',   String(isBestSeller))
      fd.set('image',          image)
      ingredients.forEach((i) => fd.append('ingredients', i))
      tags.forEach((t) => fd.append('tags', t))
      selectedGroups.forEach((g) => fd.append('addonGroupIds', g))

      const result = await updateProductAction(fd)
      if (result.error) toast.error(result.error)
      else { toast.success('Produto atualizado!'); router.push('/dashboard/menu/products') }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Imagem */}
      <div className="bg-card border border-border rounded-xl p-5">
        <ImageUpload
          value={image}
          onChange={setImage}
          onRemove={() => setImage('')}
          type="product"
          label="Foto do produto"
        />
      </div>

      {/* Dados principais */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Informações básicas</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Categoria *</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <button type="button" onClick={generateDescription} disabled={isGeneratingAI}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60">
                {isGeneratingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Gerar com IA
              </button>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Preço (R$) *</label>
            <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Preço "de" (R$)</label>
            <input type="number" step="0.01" min="0" value={comparePrice} onChange={(e) => setComparePrice(e.target.value)}
              placeholder="Ex: 59.90 (tachado)"
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Tempo de preparo (min)</label>
            <input type="number" min="1" value={preparationTime} onChange={(e) => setPreparationTime(e.target.value)}
              placeholder="Ex: 20"
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {/* Ingredientes */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Ingredientes</label>
          <div className="flex gap-2 mb-2">
            <input value={ingredientInput} onChange={(e) => setIngredientInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient() } }}
              placeholder="Ex: Mussarela"
              className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" onClick={addIngredient}
              className="px-3 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ingredients.map((i) => (
              <span key={i} className="flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full">
                {i}
                <button type="button" onClick={() => setIngredients((p) => p.filter((x) => x !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
          <div className="flex gap-2 mb-2">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Ex: vegano, sem-gluten"
              className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" onClick={addTag}
              className="px-3 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs px-2.5 py-1 rounded-full">
                #{t}
                <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Opções */}
        <div className="flex flex-wrap gap-5 pt-2">
          {[
            { label: 'Produto ativo',      value: isActive,     set: setIsActive },
            { label: '⭐ Em destaque',      value: isFeatured,   set: setIsFeatured },
            { label: '🔥 Mais vendido',     value: isBestSeller, set: setIsBestSeller },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)}
                className="w-4 h-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Grupos de adicionais */}
      {allAddonGroups.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Grupos de adicionais</h2>
          <p className="text-xs text-muted-foreground">Selecione quais grupos de opções aparecem para este produto</p>
          <div className="space-y-2">
            {allAddonGroups.map((group) => (
              <label key={group.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                <input type="checkbox" checked={selectedGroups.includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                  className="w-4 h-4 rounded border-input text-primary focus:ring-ring mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.isRequired ? 'Obrigatório' : 'Opcional'} •{' '}
                    {group.maxSelect === 1 ? 'Escolha 1' : `Até ${group.maxSelect}`} •{' '}
                    {group.addons.length} opções
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {group.addons.slice(0, 4).map((a) => a.name).join(', ')}
                    {group.addons.length > 4 && '...'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="px-5 py-2.5 border border-input rounded-lg text-sm font-medium hover:bg-muted transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}
