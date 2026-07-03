'use client'

// components/dashboard/coupons-manager.tsx

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createCouponAction, toggleCouponAction } from '@/actions/coupons/manage-coupons'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { Plus, X, Tag, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'

interface Coupon {
  id: string
  code: string
  description: string | null
  type: string
  value: number
  minOrderValue: number | null
  usageLimit: number | null
  usageCount: number
  expiresAt: Date | null
  isActive: boolean
  createdAt: Date
}

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Criar cupom
    </button>
  )
}

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE:    '% Desconto',
  FIXED:         'R$ Fixo',
  FREE_DELIVERY: 'Frete Grátis',
}

export function CouponsManager({ coupons: initial }: { coupons: Coupon[] }) {
  const [showForm,    setShowForm]    = useState(false)
  const [coupons,     setCoupons]     = useState(initial)
  const [couponType,  setCouponType]  = useState('PERCENTAGE')
  const [isPending,   startTransition] = useTransition()
  const [formState,   formAction]     = useFormState(createCouponAction, {})

  const handleToggle = (id: string, current: boolean) => {
    startTransition(async () => {
      const result = await toggleCouponAction(id, !current)
      if (result.error) { toast.error(result.error); return }
      setCoupons((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !current } : c))
      toast.success(current ? 'Cupom desativado' : 'Cupom ativado')
    })
  }

  // Fechar formulário após criar com sucesso
  if (formState.success && showForm) {
    setShowForm(false)
    toast.success('Cupom criado com sucesso!')
    // Recarregar a lista — em produção usaríamos revalidatePath
    window.location.reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo cupom
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Criar novo cupom</h3>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          <form action={formAction} className="grid grid-cols-2 gap-4">
            {formState.error && (
              <div className="col-span-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {formState.error}
              </div>
            )}

            {/* Código */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Código *</label>
              <input
                name="code"
                required
                placeholder="Ex: BEMVINDO10"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-muted-foreground mt-1">Letras maiúsculas e números</p>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
              <input
                name="description"
                placeholder="Ex: 10% para novos clientes"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tipo de desconto *</label>
              <select
                name="type"
                value={couponType}
                onChange={(e) => setCouponType(e.target.value)}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="PERCENTAGE">Porcentagem (%)</option>
                <option value="FIXED">Valor fixo (R$)</option>
                <option value="FREE_DELIVERY">Frete grátis</option>
              </select>
            </div>

            {/* Valor */}
            {couponType !== 'FREE_DELIVERY' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {couponType === 'PERCENTAGE' ? 'Porcentagem (%)' : 'Valor (R$)'} *
                </label>
                <input
                  name="value"
                  type="number"
                  step={couponType === 'PERCENTAGE' ? '1' : '0.01'}
                  min="0"
                  max={couponType === 'PERCENTAGE' ? '100' : undefined}
                  required
                  placeholder={couponType === 'PERCENTAGE' ? '10' : '5.00'}
                  className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {/* Pedido mínimo */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Pedido mínimo (R$)
              </label>
              <input
                name="minOrderValue"
                type="number"
                step="0.01"
                min="0"
                placeholder="Sem mínimo"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Limite de usos */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Limite de usos
              </label>
              <input
                name="usageLimit"
                type="number"
                min="1"
                placeholder="Ilimitado"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Data de expiração */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Válido até
              </label>
              <input
                name="expiresAt"
                type="datetime-local"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="col-span-2 flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <SubmitBtn />
            </div>
          </form>
        </div>
      )}

      {/* Lista de cupons */}
      {coupons.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum cupom criado ainda</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Código', 'Tipo', 'Desconto', 'Usos', 'Expira em', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date()
                const exhausted = coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit
                return (
                  <tr key={coupon.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-foreground">{coupon.code}</p>
                      {coupon.description && (
                        <p className="text-xs text-muted-foreground">{coupon.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {TYPE_LABELS[coupon.type]}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {coupon.type === 'PERCENTAGE'    ? `${coupon.value}%` :
                       coupon.type === 'FIXED'         ? formatCurrency(coupon.value) :
                       '🚚 Grátis'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {coupon.usageCount}
                      {coupon.usageLimit ? `/${coupon.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {coupon.expiresAt
                        ? <span className={cn(expired && 'text-destructive')}>
                            {formatDate(coupon.expiresAt)}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(coupon.id, coupon.isActive)}
                        disabled={isPending || expired || exhausted}
                        className="flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {coupon.isActive && !expired && !exhausted ? (
                          <><ToggleRight className="h-5 w-5 text-emerald-500" />
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Ativo</span></>
                        ) : (
                          <><ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {expired ? 'Expirado' : exhausted ? 'Esgotado' : 'Inativo'}
                          </span></>
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
