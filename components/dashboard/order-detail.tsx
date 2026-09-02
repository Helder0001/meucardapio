'use client'

// components/dashboard/order-detail.tsx

import { useState, useTransition, useEffect } from 'react'
import { refundPaymentAction } from '@/actions/orders/refund-payment'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, formatPhone, formatOrderNumber } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, CreditCard, Plus, X, Pencil, Minus, Trash2, Search, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { formatCpf, isValidCpf } from '@/lib/utils/cpf'
import { paymentMethodLabel } from '@/lib/utils/payment-labels'

interface CatalogProduct { id: string; name: string; price: number; isOutOfStock?: boolean }
interface CatalogCategory { id: string; name: string; products: CatalogProduct[] }

// Linha de edição de item — usada apenas dentro do editor de itens do pedido.
interface EditItemRow {
  key: string           // productId + adicionais ordenados (chave estável da linha)
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  notes?: string
  addonIds: string[]
  addonNames: string[]
}

function makeItemKey(productId: string, addonIds: string[]): string {
  return `${productId}::${[...addonIds].sort().join(',')}`
}

// Formas de pagamento para as quais é possível trocar um pagamento ainda
// não confirmado (mesma lista aceita pela rota change-payment-method).
// "Crédito (online)" (CREDIT_CARD) fica de fora de propósito: esse método é
// reservado ao link de pagamento gerado pelo sistema (Checkout Pro) — só
// trocar o rótulo pra ele aqui não gera cobrança nenhuma, só confunde.
function changeMethodOptions(orderType?: string): Array<{ value: string; label: string }> {
  return [
    { value: 'PIX',                label: '⚡ PIX' },
    { value: 'CASH',                label: '💵 Dinheiro' },
    { value: 'CREDIT_CARD_MANUAL',  label: paymentMethodLabel('CREDIT_CARD_MANUAL', orderType) },
    { value: 'DEBIT_CARD',          label: '💳 Débito' },
    { value: 'VOUCHER',             label: '🎟️ Voucher' },
  ]
}

type AddPaymentMethod = 'PIX' | 'CASH' | 'CREDIT_CARD' | 'CREDIT_CARD_MANUAL' | 'DEBIT_CARD' | 'VOUCHER' | 'TRANSFER'
interface AddPaymentEntry { method: AddPaymentMethod; amount: number }

// Tradução dos status do histórico para português
const STATUS_PT: Record<string, string> = {
  PENDING:          'Recebido',
  CONFIRMED:        'Confirmado',
  PREPARING:        'Preparando',
  READY:            'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
}

// Métodos que podem ser confirmados manualmente (não precisam de webhook).
// CREDIT_CARD entra aqui pois no PDV/balcão o cartão é passado na maquininha
// na hora (sempre manual); no cardápio digital, CREDIT_CARD é cobrado online
// e confirmado sozinho via webhook, mas mantém-se aqui como rede de segurança
// caso o webhook atrase/falhe. CREDIT_CARD_MANUAL é sempre manual (entrega/retirada).
// PIX_MANUAL (chave direta, fora de gateway) nunca recebe webhook — sempre
// depende de alguém confirmar manualmente aqui após ver o comprovante.
const MANUAL_METHODS = ['CASH', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD', 'VOUCHER', 'TRANSFER', 'PIX_MANUAL']

const STATUS_FLOW = [
  { key: 'PENDING',           label: 'Recebido' },
  { key: 'CONFIRMED',         label: 'Confirmado' },
  { key: 'PREPARING',         label: 'Preparando' },
  { key: 'READY',             label: 'Pronto' },
  { key: 'OUT_FOR_DELIVERY',  label: 'Saiu p/ entrega' },
  { key: 'DELIVERED',         label: 'Entregue' },
]

const NEXT_STATUS: Record<string, string> = {
  PENDING:          'CONFIRMED',
  CONFIRMED:        'PREPARING',
  PREPARING:        'READY',
  READY:            'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
}

// Para pedidos que não são delivery (mesa, retirada, balcão),
// pula OUT_FOR_DELIVERY e vai direto de READY para DELIVERED.
function getNextStatus(currentStatus: string, orderType: string): string | undefined {
  if (currentStatus === 'READY' && orderType !== 'DELIVERY') return 'DELIVERED'
  return NEXT_STATUS[currentStatus]
}

const NEXT_LABEL: Record<string, string> = {
  PENDING:          'Confirmar pedido',
  CONFIRMED:        'Iniciar preparo',
  PREPARING:        'Marcar como pronto',
  READY:            'Marcar como entregue',   // label genérico — sobrescrito abaixo para delivery
  OUT_FOR_DELIVERY: 'Marcar como entregue',
}

// Regras de avanço de status por role e tipo de pedido:
//
// DELIVERY_PERSON → só pedidos DELIVERY, fluxo completo (todas as etapas)
// STAFF           → todos os tipos EXCETO marcar DELIVERED em DELIVERY
// ATTENDANT       → todos os tipos EXCETO marcar DELIVERED em DELIVERY
// MANAGER/ADMIN   → tudo liberado

function getAllowedNextStatus(
  status: string, orderType: string, role: string
): { next: string; label: string } | undefined {
  const isDelivery = orderType === 'DELIVERY'

  // DELIVERY_PERSON: só pedidos DELIVERY, só saiu-p/entrega e entregue
  if (role === 'DELIVERY_PERSON') {
    if (!isDelivery) return undefined
    if (status === 'READY')            return { next: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega' }
    if (status === 'OUT_FOR_DELIVERY') return { next: 'DELIVERED',        label: 'Marcar como entregue' }
    return undefined
  }

  // STAFF: pode confirmar, preparar, pronto — mas NÃO entregue
  if (role === 'STAFF') {
    if (['PENDING', 'CONFIRMED', 'PREPARING'].includes(status)) {
      return { next: getNextStatus(status, orderType)!, label: NEXT_LABEL[status] }
    }
    return undefined // READY e OUT_FOR_DELIVERY: sem ação de avanço
  }

  // MANAGER / TENANT_ADMIN: fluxo completo
  const next = getNextStatus(status, orderType)
  if (!next) return undefined
  const label = status === 'READY' && isDelivery ? 'Saiu para entrega' : (NEXT_LABEL[status] ?? '')
  return { next, label }
}

export function OrderDetail({
  order, userRole, catalog = [], pixEnabled = true, cardEnabled = true,
}: { order: any; userRole: string; catalog?: CatalogCategory[]; pixEnabled?: boolean; cardEnabled?: boolean }) {
  const [status,   setStatus]   = useState(order.status)
  const [payments, setPayments] = useState<any[]>(order.payments)

  // BUG CORRIGIDO: essa tela nunca atualizava sozinha — só quando o staff
  // clicava em algo manualmente (ex.: "Concluído"). No balcão, quando o
  // cliente paga um Pix, a confirmação chega via webhook em segundo plano
  // e nada aqui refletia isso até um reload manual da página. Mesmo padrão
  // de polling já usado no cardápio digital (order-tracking.tsx): só fica
  // ativo enquanto existir pagamento PIX/CREDIT_CARD ainda PENDING, e para
  // sozinho assim que confirmar (ou depois de ~3min, pra não ficar
  // batendo pra sempre num pagamento abandonado).
  useEffect(() => {
    const hasPendingGatewayPayment = payments.some(
      (p) => p.status === 'PENDING' && (p.method === 'PIX' || p.method === 'CREDIT_CARD') && (p.pixQrCode || p.checkoutUrl)
    )
    if (!hasPendingGatewayPayment) return

    let attempts = 0
    const maxAttempts = 36 // ~3min a 5s por tentativa
    const interval = setInterval(async () => {
      attempts++
      try {
        const res = await fetch(`/api/orders/${order.id}/status`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data.payments?.length) {
            setPayments((prev) =>
              prev.map((p) => {
                const updated = data.payments.find((dp: any) => dp.id === p.id)
                return updated ? { ...p, ...updated } : p
              })
            )
            const stillPending = data.payments.some((p: any) => p.status === 'PENDING')
            if (!stillPending) {
              clearInterval(interval)
              router.refresh() // pega o status do pedido tb (PENDING → CONFIRMED, etc.)
            }
          }
        }
      } catch {
        // silencioso — só tenta de novo no próximo ciclo
      }
      if (attempts >= maxAttempts) clearInterval(interval)
    }, 5000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  const [isPending, start]      = useTransition()
  const router = useRouter()

  // ── Itens e totais — ficam em estado local pois podem mudar ao editar o pedido ──
  const [items,          setItems]          = useState<any[]>(order.items)
  const [orderSubtotal,  setOrderSubtotal]  = useState<number>(Number(order.subtotal))
  const [orderTotal,     setOrderTotal]     = useState<number>(Number(order.total))

  // ── Edição de itens do pedido ──────────────────────────────────────────────
  const [isEditingItems, setIsEditingItems] = useState(false)
  const [editRows,       setEditRows]       = useState<EditItemRow[]>([])
  const [isSavingItems,  startSavingItems]  = useTransition()
  const [productQuery,   setProductQuery]   = useState('')

  // ── Troca de forma de pagamento (pagamento ainda não confirmado) ──────────
  const [changingPaymentId, setChangingPaymentId] = useState<string | null>(null)
  const [isChangingMethod,  startChangingMethod]  = useTransition()

  // ── Modal de pagamento posterior ──────────────────────────────────────────
  const [showAddPayment, setShowAddPayment]     = useState(false)
  const [addPayments, setAddPayments]           = useState<AddPaymentEntry[]>([{ method: 'CASH', amount: Number(order.total) }])
  const [addPaymentCpf, setAddPaymentCpf]       = useState('')
  const [isAddingPayment, startAddPayment]      = useTransition()
  // QR Code PIX após registrar pagamento posterior
  const [addPixData, setAddPixData]             = useState<{ qrCode: string; qrCodeBase64: string } | null>(null)
  const [addPixCopied, setAddPixCopied]         = useState(false)

  // ── Link de pagamento (Checkout Pro) ──────────────────────────────────────
  const [isSendingLink, setIsSendingLink]       = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl]     = useState<string | null>(null)

  const totalOrder   = orderTotal
  // CORREÇÃO: só pagamento com status PAID conta como "já pago" — um
  // pagamento PENDING (ex.: link de pagamento ainda não confirmado) estava
  // sendo somado aqui, zerando o "falta pagar" e escondendo o botão de
  // reenviar o link antes mesmo do cliente pagar.
  const alreadyPaid  = payments.filter((p: any) => p.status === 'PAID').reduce((s: number, p: any) => s + Number(p.amount), 0)
  const stillOwed    = Math.max(0, Math.round((totalOrder - alreadyPaid) * 100) / 100)

  // Pagamento registrado manualmente (dinheiro/cartão na hora) mas ainda
  // não confirmado pelo operador — diferente de um link/PIX pendente
  // (aquele espera o CLIENTE pagar; este já foi "recebido", só falta
  // confirmar). Tem `checkoutUrl` só quando veio do link de pagamento.
  const pendingManualPayments = payments.filter((p: any) => p.status === 'PENDING' && !p.checkoutUrl)
  const hasPendingManualPayment = pendingManualPayments.length > 0

  const addPaymentsSum      = addPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const addPaymentRemaining = Math.round((stillOwed - addPaymentsSum) * 100) / 100

  // Só mostra o botão de adicionar pagamento em pedidos PDV/TABLE/PICKUP
  // com pagamento pendente (cobrar no final ou pagamento ainda não registrado).
  // Bloqueado enquanto já existir um pagamento manual aguardando confirmação
  // — senão dava pra clicar "Registrar pagamento" de novo e duplicar (dois
  // pagamentos cobrindo o mesmo valor, os dois confirmáveis).
  const canAddPayment =
    order.type !== 'DELIVERY' &&
    !['CANCELLED', 'REFUNDED'].includes(status) &&
    stillOwed > 0 &&
    !hasPendingManualPayment &&
    ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF'].includes(userRole)

  const handleAddPayment = () => {
    if (addPaymentsSum < stillOwed - 0.01) {
      toast.error(`Valor insuficiente. Ainda faltam ${formatCurrency(stillOwed - addPaymentsSum)}.`)
      return
    }
    if (addPayments.some((p) => p.method === 'PIX') && !isValidCpf(addPaymentCpf)) {
      toast.error('Informe um CPF válido para pagar com PIX')
      return
    }
    startAddPayment(async () => {
      // Device ID gerado pelo script de segurança do Mercado Pago
      // (window.MP_DEVICE_SESSION_ID), carregado no layout do dashboard.
      const deviceId = typeof window !== 'undefined' ? (window as any).MP_DEVICE_SESSION_ID : undefined

      const res = await fetch(`/api/orders/${order.id}/add-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: addPayments,
          deviceId,
          customerCpf: addPayments.some((p) => p.method === 'PIX') ? addPaymentCpf : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Erro ao registrar pagamento'); return }

      // Atualizar lista de pagamentos localmente
      setPayments((prev) => [
        ...prev,
        ...(data.payments ?? []).map((p: any) => ({
          ...p,
          paidAt: null,
          changeAmount: null,
          pixExpiresAt: null,
        })),
      ])
      setShowAddPayment(false)
      setAddPayments([{ method: 'CASH', amount: stillOwed }])

      // Se veio QR Code PIX, exibir modal
      if (data.pixQrCode && data.pixQrCodeBase64) {
        setAddPixData({ qrCode: data.pixQrCode, qrCodeBase64: data.pixQrCodeBase64 })
      } else {
        toast.success('Pagamento registrado! Confirme o recebimento quando efetivado.')
      }
    })
  }

  // Gera um link de pagamento (Checkout Pro) e abre o WhatsApp com a
  // mensagem pronta para o garçom enviar ao cliente. Funciona com qualquer
  // método (PIX, crédito, débito) — o cliente escolhe na página do MP.
  const handleSendPaymentLink = async () => {
    setIsSendingLink(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/payment-link`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível gerar o link de pagamento')
        return
      }

      setPaymentLinkUrl(data.checkoutUrl)

      const phone = order.customer?.phone?.replace(/\D/g, '')
      const message = `Olá! Segue o link para pagamento do seu pedido #${String(order.orderNumber).padStart(4, '0')} (${formatCurrency(stillOwed)}): ${data.checkoutUrl}`

      if (phone) {
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')
      } else {
        // Sem telefone cadastrado — copia o link para a área de transferência
        await navigator.clipboard.writeText(data.checkoutUrl)
        toast.success('Link copiado! Cole para enviar ao cliente.')
      }
    } finally {
      setIsSendingLink(false)
    }
  }

  const copyAddPixCode = async () => {
    if (!addPixData) return
    try {
      await navigator.clipboard.writeText(addPixData.qrCode)
      setAddPixCopied(true)
      setTimeout(() => setAddPixCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  const isAttendant      = userRole === 'ATTENDANT'
  const isStaff          = userRole === 'STAFF'
  const isDeliveryPerson = userRole === 'DELIVERY_PERSON'

  const nextAction   = getAllowedNextStatus(status, order.type, userRole)
  const advanceTarget = nextAction?.next
  const advanceLabel  = nextAction?.label

  // Confirmar pagamento manual:
  // - DELIVERY_PERSON: só após DELIVERED (pedido entregue, cobrança no ato)
  // - ATTENDANT e STAFF: bloqueados em pedidos DELIVERY
  // - Admin/Gerente: sempre
  const canConfirmPayment = (payment: any) => {
    if (payment.status === 'PAID' || payment.status === 'FAILED') return false
    if (status === 'CANCELLED') return false
    const isManualMethod = ['CASH', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD', 'PIX_MANUAL'].includes(payment.method)
    if (!isManualMethod) return false
    if (isDeliveryPerson) {
      // Entregador só confirma pagamento de pedidos DELIVERY, e só após entregue
      return order.type === 'DELIVERY' && status === 'DELIVERED'
    }
    if (order.type === 'DELIVERY') {
      // ATTENDANT e STAFF não confirmam pagamento de delivery
      if (isAttendant || isStaff) return false
    }
    return true
  }

  const advanceStatus = () => {
    const next = advanceTarget
    if (!next) return
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        setStatus(next)
        toast.success('Status atualizado!')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Erro ao atualizar status')
      }
    })
  }

  const cancelOrder = () => {
    const reason = prompt('Motivo do cancelamento (opcional):')
    if (reason === null) return
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', cancelReason: reason }),
      })
      if (res.ok) {
        setStatus('CANCELLED')
        toast.success('Pedido cancelado')
      } else {
        toast.error('Erro ao cancelar')
      }
    })
  }

  // Marca um pagamento manual como pago
  const markPaymentPaid = (paymentId: string) => {
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/mark-paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (res.ok) {
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId ? { ...p, status: 'PAID', paidAt: new Date().toISOString() } : p
          )
        )
        toast.success('Pagamento confirmado!')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Erro ao confirmar pagamento')
      }
    })
  }

  // Estorna o pagamento (Pix/cartão via Efí, por enquanto) — botão aparece
  // pra todo mundo, mas a permissão de verdade é checada no servidor
  // (refundPaymentAction só deixa TENANT_ADMIN/MANAGER passar).
  const [isRefunding, startRefund] = useTransition()
  const refundPayment = (paymentId: string, amount: number) => {
    const confirmed = window.confirm(
      `Estornar ${formatCurrency(amount)}? Isso vai cancelar o pedido e devolver o valor pro cliente — não dá pra desfazer.`
    )
    if (!confirmed) return

    startRefund(async () => {
      const result = await refundPaymentAction(order.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, status: 'REFUNDED' } : p))
      )
      toast.success('Pagamento estornado e pedido cancelado.')
    })
  }


  // Permitido para qualquer pedido que ainda não foi cancelado/estornado.
  // Pedidos de balcão/mesa (PDV/TABLE) também podem ser editados mesmo já
  // ENTREGUES — nesse caso o pedido reabre no Kanban como PENDING (o backend
  // cuida disso em /api/orders/[id]/edit-items).
  const canEditOrder =
    (!['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(status) ||
      (status === 'DELIVERED' && ['PDV', 'TABLE'].includes(order.type))) &&
    ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF'].includes(userRole)

  const openItemEditor = () => {
    setEditRows(items.map((item: any) => ({
      key: makeItemKey(item.productId, item.addons.map((a: any) => a.addonId)),
      productId: item.productId,
      productName: item.productName,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      notes: item.notes ?? undefined,
      addonIds: item.addons.map((a: any) => a.addonId),
      addonNames: item.addons.map((a: any) => a.addonName),
    })))
    setProductQuery('')
    setIsEditingItems(true)
  }

  const closeItemEditor = () => {
    setIsEditingItems(false)
    setEditRows([])
  }

  const addProductToEdit = (product: CatalogProduct) => {
    if (product.isOutOfStock) {
      toast.error(`"${product.name}" está esgotado`)
      return
    }
    setEditRows((prev) => {
      const key = makeItemKey(product.id, [])
      const existing = prev.find((r) => r.key === key)
      if (existing) {
        return prev.map((r) => r.key === key ? { ...r, quantity: r.quantity + 1 } : r)
      }
      return [...prev, {
        key, productId: product.id, productName: product.name,
        unitPrice: product.price, quantity: 1, addonIds: [], addonNames: [],
      }]
    })
  }

  const updateEditQty = (key: string, delta: number) => {
    setEditRows((prev) => {
      const next = prev.map((r) => r.key === key ? { ...r, quantity: r.quantity + delta } : r)
      return next.filter((r) => r.quantity > 0)
    })
  }

  const removeEditRow = (key: string) => {
    setEditRows((prev) => prev.filter((r) => r.key !== key))
  }

  const editSubtotal = editRows.reduce((s, r) => s + r.unitPrice * r.quantity, 0)
  const editTotal = Math.max(0, editSubtotal + Number(order.deliveryFee) - Number(order.discountAmount) - Number(order.cashbackUsed))

  const filteredCatalogProducts = productQuery.trim().length === 0
    ? []
    : catalog
        .flatMap((c) => c.products)
        .filter((p) => p.name.toLowerCase().includes(productQuery.trim().toLowerCase()))
        .slice(0, 8)

  const saveItemEdits = () => {
    if (editRows.length === 0) {
      toast.error('O pedido precisa ter ao menos 1 item')
      return
    }
    startSavingItems(async () => {
      const res = await fetch(`/api/orders/${order.id}/edit-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editRows.map((r) => ({
            productId: r.productId,
            quantity: r.quantity,
            addonIds: r.addonIds,
            notes: r.notes,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao editar pedido')
        return
      }
      setItems(data.items)
      setOrderSubtotal(data.subtotal)
      setOrderTotal(data.total)
      setPayments(data.payments)
      closeItemEditor()
      toast.success('Pedido atualizado!')
      router.refresh()
    })
  }

  // ── Trocar forma de pagamento (só antes da confirmação) ─────────────────────
  const changePaymentMethod = (paymentId: string, method: string) => {
    startChangingMethod(async () => {
      const res = await fetch(`/api/orders/${order.id}/change-payment-method`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, method }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao trocar forma de pagamento')
        return
      }
      setChangingPaymentId(null)
      if (data.unchanged) return

      setPayments((prev) => {
        // PIX ⇄ manual troca o registro de pagamento (novo id) — substitui a linha antiga.
        if (data.replacedPaymentId && data.replacedPaymentId !== data.paymentId) {
          return prev
            .filter((p) => p.id !== data.replacedPaymentId)
            .concat([{
              id: data.paymentId, method: data.method, status: data.status, amount: data.amount,
              paidAt: null, changeAmount: null, pixExpiresAt: null,
            }])
        }
        // Troca simples entre métodos manuais — só atualiza o método na mesma linha.
        return prev.map((p) => p.id === paymentId ? { ...p, method: data.method } : p)
      })

      if (data.pixQrCode && data.pixQrCodeBase64) {
        setAddPixData({ qrCode: data.pixQrCode, qrCodeBase64: data.pixQrCodeBase64 })
      } else {
        toast.success('Forma de pagamento atualizada!')
      }
    })
  }

  const currentStep = STATUS_FLOW.findIndex((s) => s.key === status)
  const isDone      = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(status)

  return (
    <div className="space-y-5">
      {/* Status + ações */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={status} />
            <span className="text-sm text-muted-foreground">
              {order.type === 'DELIVERY' ? '🛵 Delivery' :
               order.type === 'TABLE'    ? `🍽️ Mesa ${order.table?.number ?? ''}` :
               order.type === 'PICKUP'   ? '🏪 Retirada' : '💳 Balcão'}
            </span>
          </div>
          <span className="text-xl font-bold text-foreground">
            {formatCurrency(orderTotal)}
          </span>
        </div>

        {/* Linha do tempo */}
        <div className="flex items-center gap-0 mb-5 overflow-x-auto">
          {STATUS_FLOW.filter((s) =>
            order.type !== 'DELIVERY' ? s.key !== 'OUT_FOR_DELIVERY' : true
          ).map((s, i, arr) => {
            const stepIdx = STATUS_FLOW.findIndex((x) => x.key === s.key)
            const done    = stepIdx < currentStep
            const current = stepIdx === currentStep
            return (
              <div key={s.key} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={cn(
                    'w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
                    done    ? 'bg-emerald-500 border-emerald-500 text-white' :
                    current ? 'bg-brand-500 border-brand-500 text-white ring-4 ring-brand-500/20' :
                              'bg-muted border-border text-muted-foreground'
                  )}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className="text-[9px] mt-1 text-muted-foreground whitespace-nowrap">{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={cn(
                    'flex-1 h-0.5 mx-1',
                    stepIdx < currentStep ? 'bg-emerald-500' : 'bg-border'
                  )} />
                )}
              </div>
            )
          })}
        </div>

        {/* Botões de ação */}
        {!isDone && (
          <div className="flex gap-3">
            {advanceTarget && (
              <button
                onClick={advanceStatus}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {advanceLabel}
              </button>
            )}
            {/* Cancelar — Atendente e Entregador não podem cancelar */}
            {!isAttendant && !isDeliveryPerson && (
              <button
                onClick={cancelOrder}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 border border-destructive/30 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/5 disabled:opacity-60 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Cancelar
              </button>
            )}
          </div>
        )}

        {/* NOVO: editar itens/pagamento do pedido — fora do bloco !isDone
            porque também precisa aparecer com o pedido ENTREGUE (balcão/mesa
            reabrindo pra adicionar item) — canEditOrder já cobre essa regra. */}
        {canEditOrder && (
          <div className="flex gap-3 mt-2">
            <button
              onClick={openItemEditor}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2.5 border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted/50 disabled:opacity-60 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {status === 'DELIVERED' ? 'Adicionar itens' : 'Editar pedido'}
            </button>
          </div>
        )}
        {/* CORREÇÃO: operador sem ação de avanço disponível neste status */}
        {!isDone && (isStaff || isDeliveryPerson || isAttendant) && !advanceTarget && (
          <p className="text-xs text-muted-foreground mt-2">
            Este pedido está em preparo na cozinha. Você poderá marcá-lo como entregue quando estiver pronto.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Itens do pedido */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Itens do pedido</h2>
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="flex justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.quantity}× {item.productName}
                  </p>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      + {item.addons.map((a: any) => a.addonName).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic mt-0.5">
                      Obs: {item.notes}
                    </p>
                  )}
                </div>
                <p className="font-medium text-foreground text-sm flex-shrink-0">
                  {formatCurrency(item.totalPrice)}
                </p>
              </div>
            ))}
          </div>

          {/* Totais */}
          <div className="border-t border-border mt-4 pt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span><span>{formatCurrency(orderSubtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Entrega</span><span>{formatCurrency(order.deliveryFee)}</span>
              </div>
            )}
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                <span>Desconto {order.coupon ? `(${order.coupon.code})` : ''}</span>
                <span>-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            {order.cashbackUsed > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                <span>Cashback usado</span><span>-{formatCurrency(order.cashbackUsed)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
              <span>Total</span><span>{formatCurrency(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Info lateral */}
        <div className="space-y-4">
          {/* Cliente */}
          {order.customer && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Cliente</h3>
              <p className="font-medium text-foreground">{order.customer.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatPhone(order.customer.phone)}</p>
              {order.customer.email && (
                <p className="text-xs text-muted-foreground">{order.customer.email}</p>
              )}
              <div className="flex gap-3 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                <span>{order.customer.totalOrders} pedidos</span>
                <span>{formatCurrency(order.customer.totalSpent)} gastos</span>
              </div>
            </div>
          )}

          {/* Pagamentos — mostra TODOS */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                Pagamento{payments.length > 1 ? 's' : ''}
              </h3>
              <div className="flex items-center gap-3">
                {/* Link de pagamento via WhatsApp — qualquer método */}
                {stillOwed > 0 && status !== 'CANCELLED' && (
                  <button
                    onClick={handleSendPaymentLink}
                    disabled={isSendingLink}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {isSendingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                    Enviar link de pagamento
                  </button>
                )}
                {/* NOVO: botão para adicionar pagamento posterior */}
                {canAddPayment && !showAddPayment && (
                  <button
                    onClick={() => {
                      setAddPayments([{ method: 'CASH', amount: stillOwed }])
                      setShowAddPayment(true)
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Registrar pagamento
                  </button>
                )}
              </div>
            </div>

            {paymentLinkUrl && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Link gerado:</p>
                <p className="text-xs text-muted-foreground break-all font-mono">{paymentLinkUrl}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(paymentLinkUrl).then(() => toast.success('Copiado!'))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Copiar link
                </button>
              </div>
            )}

            {/* NOVO: Banner de pagamento pendente */}
            {stillOwed > 0 && payments.length === 0 && status !== 'CANCELLED' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 mb-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⏳ Pagamento pendente — {formatCurrency(stillOwed)}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Este pedido foi criado com "cobrar no final". Use o botão acima para registrar o pagamento.
                </p>
              </div>
            )}

            {stillOwed > 0 && payments.length > 0 && status !== 'CANCELLED' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2.5 mb-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Saldo restante: {formatCurrency(stillOwed)}
                </p>
              </div>
            )}

            {/* NOVO: Formulário inline de adicionar pagamento */}
            {showAddPayment && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Registrar pagamento</p>
                  <button onClick={() => setShowAddPayment(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Total a receber: <strong className="text-foreground">{formatCurrency(stillOwed)}</strong>
                </p>

                {addPayments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={p.method}
                      onChange={(e) => setAddPayments((prev) => prev.map((x, i) => i === idx ? { ...x, method: e.target.value as AddPaymentMethod } : x))}
                      className="flex-1 px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="CASH">💵 Dinheiro</option>
                      <option value="CREDIT_CARD">💳 Crédito</option>
                      <option value="DEBIT_CARD">💳 Débito</option>
                      {pixEnabled && <option value="PIX">⚡ PIX</option>}
                      <option value="VOUCHER">🎟️ Voucher</option>
                      <option value="TRANSFER">🏦 Transferência</option>
                    </select>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={p.amount || ''}
                      onChange={(e) => setAddPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))}
                      placeholder="0,00"
                      className="w-24 px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {addPayments.length > 1 && (
                      <button
                        onClick={() => setAddPayments((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-6 h-6 flex-shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                {addPayments.some((p) => p.method === 'PIX') && (
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">CPF de quem vai pagar (obrigatório p/ PIX)</label>
                    <input
                      value={formatCpf(addPaymentCpf)}
                      onChange={(e) => setAddPaymentCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setAddPayments((prev) => [...prev, { method: 'CASH', amount: Math.max(addPaymentRemaining, 0) }])}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    + Dividir em outra forma
                  </button>
                  {addPayments.length > 1 && (
                    <span className={cn('text-[10px] font-semibold', addPaymentRemaining === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                      {addPaymentRemaining > 0
                        ? `Faltam ${formatCurrency(addPaymentRemaining)}`
                        : addPaymentRemaining < 0
                          ? `Excede em ${formatCurrency(-addPaymentRemaining)}`
                          : 'OK ✓'}
                    </span>
                  )}
                </div>

                <button
                  onClick={handleAddPayment}
                  disabled={isAddingPayment || addPaymentsSum <= 0}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isAddingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  {isAddingPayment ? 'Registrando...' : 'Confirmar pagamento'}
                </button>
              </div>
            )}

            {payments.length === 0 && !showAddPayment ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado</p>
            ) : payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((p: any, idx: number) => {
                  const isManual  = MANUAL_METHODS.includes(p.method)
                  const isPaid    = p.status === 'PAID'
                  const isFailed  = p.status === 'FAILED'
                  return (
                    <div key={p.id} className={cn(
                      'rounded-lg p-3 border',
                      isPaid
                        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800'
                        : isFailed
                          ? 'border-red-200 bg-red-50/60 dark:bg-red-950/10 dark:border-red-900'
                          : 'border-border bg-muted/30'
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {paymentMethodLabel(p.method, order.type)}
                          </p>
                          <p className="text-xs font-semibold text-foreground mt-0.5">
                            {formatCurrency(p.amount)}
                          </p>
                          {p.changeAmount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Troco: {formatCurrency(p.changeAmount)}
                            </p>
                          )}
                          {isPaid && p.paidAt && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                              ✓ Pago {formatDate(p.paidAt)}
                            </p>
                          )}
                          {isFailed && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                              Cancelado — pagamento não confirmado
                            </p>
                          )}
                          {!isPaid && !isFailed && p.method === 'PIX' && (
                            p.pixExpiresAt && new Date(p.pixExpiresAt) < new Date() ? (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                                PIX expirado — gere um novo código
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                Aguardando confirmação PIX
                              </p>
                            )
                          )}
                          {!isPaid && !isFailed && isManual && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Pendente de confirmação
                            </p>
                          )}
                          {/* NOVO: trocar forma de pagamento — só antes de confirmar, e não para pagamentos já definidos no "pagar agora" do PDV/Mesa */}
                          {!isPaid && !isFailed && canEditOrder && !p.setAtOrderCreation && (
                            changingPaymentId === p.id ? (
                              <select
                                autoFocus
                                defaultValue={p.method}
                                disabled={isChangingMethod}
                                onChange={(e) => changePaymentMethod(p.id, e.target.value)}
                                onBlur={() => setChangingPaymentId(null)}
                                className="mt-1.5 text-xs border border-input rounded-lg bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                {changeMethodOptions(order.type)
                                  .filter((opt) => (opt.value === 'PIX' ? pixEnabled : true))
                                  .filter((opt) => (opt.value === 'CREDIT_CARD' ? cardEnabled : true))
                                  .map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => setChangingPaymentId(p.id)}
                                disabled={isChangingMethod}
                                className="text-xs font-medium text-primary hover:underline mt-1"
                              >
                                Trocar forma de pagamento
                              </button>
                            )
                          )}
                        </div>
                        {/* Confirmar pagamento — controlado por canConfirmPayment() */}
                        {canConfirmPayment(p) && (
                          <button
                            onClick={() => markPaymentPaid(p.id)}
                            disabled={isPending}
                            title="Confirmar recebimento"
                            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                          >
                            {isPending
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <CreditCard className="h-3 w-3" />
                            }
                            Confirmar
                          </button>
                        )}
                        {/* Estornar pagamento — só pra Pix/Cartão que
                            passaram por gateway de verdade (Efí/MP/Stripe:
                            têm providerReference ou pixEndToEndId
                            preenchido). Pagamento manual (CASH,
                            CREDIT_CARD_MANUAL, cartão de máquina anotado à
                            mão etc.) nunca tem isso, então nunca mostra o
                            botão — não tem API nenhuma pra estornar algo
                            que não passou por gateway nenhum. Aparece pra
                            qualquer papel; permissão de verdade é checada
                            no servidor. */}
                        {isPaid && (p.method === 'PIX' || p.method === 'CREDIT_CARD') && (p.providerReference || p.pixEndToEndId) && (
                          <button
                            onClick={() => refundPayment(p.id, p.amount)}
                            disabled={isRefunding}
                            title="Estornar pagamento"
                            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-destructive/10 text-destructive text-xs font-medium rounded-lg hover:bg-destructive/20 disabled:opacity-60 transition-colors"
                          >
                            {isRefunding
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RotateCcw className="h-3 w-3" />
                            }
                            Estornar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          {/* Meta + Endereço de entrega */}
          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
            <p>Criado: {formatDate(order.createdAt)}</p>
            {order.waiter    && <p>Operador: <span className="font-medium text-foreground">{order.waiter.name}</span></p>}
            {order.createdBy && !order.waiter && <p>Operador: <span className="font-medium text-foreground">{order.createdBy.name}</span></p>}
            {order.pdv       && <p>PDV: {order.pdv.name}</p>}
            {order.type === 'DELIVERY' && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="font-semibold text-foreground mb-1">🛵 Endereço de entrega</p>
                {order.deliveryAddress && (() => {
                  const raw = order.deliveryAddress
                  // Pode ser { address: "rua xxx" } ou objeto estruturado
                  const addrStr = typeof raw === 'object' && raw !== null
                    ? (raw as any).address ?? JSON.stringify(raw)
                    : String(raw)
                  return <p>{addrStr}</p>
                })()}
                {order.deliveryBairro && (
                  <p className="mt-0.5">Bairro: {order.deliveryBairro}</p>
                )}
                {!order.deliveryAddress && !order.deliveryBairro && (
                  <p className="italic text-muted-foreground">Endereço não informado</p>
                )}
              </div>
            )}
            {order.cancelReason && <p className="text-destructive">Cancelado: {order.cancelReason}</p>}
          </div>

          {/* Histórico de status */}
          {order.statusHistory?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Histórico</h3>
              <div className="space-y-2">
                {order.statusHistory.map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-foreground">{STATUS_PT[h.status] ?? h.status}</span>
                      <span className="text-muted-foreground ml-1.5">{formatDate(h.createdAt)}</span>
                      {h.user && (
                        <span className="ml-1.5 text-muted-foreground">
                          · por <span className="font-medium text-foreground">{h.user.name}</span>
                        </span>
                      )}
                      {h.notes && !h.notes.startsWith('Alterado por') && (
                        <p className="text-muted-foreground italic mt-0.5">{h.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal QR Code PIX (pagamento posterior) ───────────────────────── */}
      {addPixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddPixData(null)} />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="text-center">
              <h3 className="font-bold text-foreground text-lg">Aguardando PIX</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Peça ao cliente escanear o QR Code ou usar o código copia e cola. Expira em 5 minutos.
              </p>
            </div>
            <img
              src={`data:image/png;base64,${addPixData.qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-52 h-52 rounded-xl border border-border"
            />
            <div className="w-full">
              <p className="text-xs font-medium text-foreground mb-1">Código copia e cola</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={addPixData.qrCode}
                  className="flex-1 px-3 py-2 text-xs border border-input rounded-lg bg-muted truncate"
                />
                <button
                  onClick={copyAddPixCode}
                  className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                  {addPixCopied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setAddPixData(null)}
              className="w-full px-4 py-2.5 bg-muted text-foreground text-sm font-semibold rounded-lg hover:bg-muted/70 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: editar itens do pedido ─────────────────────────────────── */}
      {isEditingItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeItemEditor} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-lg">Editar itens do pedido</h3>
              <button onClick={closeItemEditor} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Itens atuais */}
            <div className="space-y-2">
              {editRows.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum item — adicione algo abaixo.</p>
              )}
              {editRows.map((r) => (
                <div key={r.key} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.productName}</p>
                    {r.addonNames.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">+ {r.addonNames.join(', ')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatCurrency(r.unitPrice)} / un.</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateEditQty(r.key, -1)}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-muted hover:bg-muted/70 text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-foreground">{r.quantity}</span>
                    <button
                      onClick={() => updateEditQty(r.key, 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-muted hover:bg-muted/70 text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeEditRow(r.key)}
                      title="Remover item"
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive ml-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Adicionar item */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Adicionar item</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Buscar produto pelo nome..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {filteredCatalogProducts.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filteredCatalogProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { addProductToEdit(p); setProductQuery('') }}
                      disabled={p.isOutOfStock}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <span className="text-foreground truncate">{p.name}{p.isOutOfStock ? ' (esgotado)' : ''}</span>
                      <span className="text-muted-foreground flex-shrink-0">{formatCurrency(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
              {productQuery.trim().length > 0 && filteredCatalogProducts.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum produto encontrado.</p>
              )}
            </div>

            {/* Totais recalculados */}
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{formatCurrency(editSubtotal)}</span>
              </div>
              {Number(order.deliveryFee) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Entrega</span><span>{formatCurrency(order.deliveryFee)}</span>
                </div>
              )}
              {Number(order.discountAmount) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Desconto</span><span>-{formatCurrency(order.discountAmount)}</span>
                </div>
              )}
              {Number(order.cashbackUsed) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Cashback usado</span><span>-{formatCurrency(order.cashbackUsed)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
                <span>Novo total</span><span>{formatCurrency(editTotal)}</span>
              </div>
              {editTotal !== orderTotal && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500">
                  Total anterior: {formatCurrency(orderTotal)}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeItemEditor}
                disabled={isSavingItems}
                className="flex-1 py-2.5 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted/50 disabled:opacity-60 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveItemEdits}
                disabled={isSavingItems || editRows.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isSavingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSavingItems ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
