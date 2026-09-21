'use client'
// components/storefront/cart-drawer.tsx — pagamento múltiplo + endereço obrigatório

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import Image from 'next/image'
import { X, Trash2, Plus, Minus, Tag, Loader2, ArrowRight, ShoppingBag, Truck, Store, MapPin, PlusCircle, MinusCircle, UtensilsCrossed } from 'lucide-react'
import { useCartStore } from '@/lib/store/cart'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { createOrderAction } from '@/actions/orders/create-order'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useStorefrontDict } from '@/lib/i18n/storefront-context'
import { fmt } from '@/lib/i18n/format'

const AddressPinPicker = dynamic(
  () => import('./address-pin-picker').then((m) => m.AddressPinPicker),
  { ssr: false }
)

// Fortaleza-CE como centro neutro de último recurso — só usado se nem o
// endereço buscado NEM a loja tiverem coordenada conhecida ainda, só pra
// o mapa abrir em algum lugar minimamente plausível em vez de "0,0" (que
// cairia no meio do oceano, na costa da África).
const FALLBACK_CENTER = { lat: -3.7319, lng: -38.5267 }

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenant: {
    id: string
    slug: string
    primaryColor?: string | null
    settings?: any
    pixEnabled?: boolean
    cardEnabled?: boolean
    linkEnabled?: boolean
    manualPixEnabled?: boolean
    // Estimativa inicial pro mapa de confirmação de endereço (ver
    // components/storefront/address-pin-picker.tsx) — usado como
    // fallback quando ainda não há coordenada vinda de busca de rua/CEP.
    latitude?: number | null
    longitude?: number | null
    // CORREÇÃO (#4): categorias/produtos, pra montar a seção "Peça
    // também" dentro do carrinho.
    categories?: Array<{ products: Array<{
      id: string; name: string; price: number; image: string | null
      isOutOfStock?: boolean; isFeatured: boolean; isBestSeller: boolean
    }> }>
    deliveryZones: Array<{
      id: string
      bairro: string | null
      fee: number
      freeAbove: number | null
      minOrder: number | null
      name: string | null
    }>
  }
  tableInfo: { id: string; number: number } | null
  // CORREÇÃO (#2, ajuste): vem da página (?demo=1, só nos links da landing
  // page) — ver lib/utils/demo-tenant.ts.
  isDemo?: boolean
}

type Step = 'cart' | 'info' | 'payment'
// CORREÇÃO: separar crédito e débito
// CORREÇÃO: separar crédito pago online (cobrado na hora, confirmação
// automática) de crédito pago na entrega/retirada (manual, na maquininha)
type PaymentMethodValue = 'PIX' | 'PIX_MANUAL' | 'CASH' | 'CREDIT_CARD' | 'CREDIT_CARD_MANUAL' | 'DEBIT_CARD' | 'LINK'

const STEPS: Step[] = ['cart', 'info', 'payment']

interface PaymentOption { value: PaymentMethodValue; label: string; sub: string }

interface PaymentEntry {
  id: string
  method: PaymentMethodValue
  amount: string
  changeFor: string
}

function newEntry(method: PaymentMethodValue = 'PIX'): PaymentEntry {
  return { id: Math.random().toString(36).slice(2), method, amount: '', changeFor: '' }
}

export function CartDrawer({ open, onClose, tenant, tableInfo, isDemo = false }: CartDrawerProps) {
  const router = useRouter()
  const t = useStorefrontDict()
  const STEP_LABELS = t.checkout.steps
  // Pago agora, direto no cardápio — confirmação automática. NOTA: 'LINK'
  // (Mercado Pago) foi removido de propósito das opções do cardápio
  // digital — esse método agora existe SOMENTE no PDV/balcão.
  const ONLINE_PAYMENT_OPTIONS: PaymentOption[] = [
    { value: 'PIX', ...t.checkout.onlinePayment.pix },
    { value: 'PIX_MANUAL', ...t.checkout.onlinePayment.pixManual },
    { value: 'CREDIT_CARD', ...t.checkout.onlinePayment.creditOnline },
  ]
  // Pago na hora da entrega/retirada — confirmado manualmente pela loja.
  // CORREÇÃO: o cliente não precisa ver "(Online)"/"(Maquininha)" — essa
  // distinção importa pro lojista (conciliação financeira, ver
  // lib/utils/payment-labels.ts), mas pro cliente é só ruído: o cabeçalho
  // da seção já deixa claro que é na maquininha física.
  const MANUAL_PAYMENT_OPTIONS: PaymentOption[] = [
    { value: 'CASH', ...t.checkout.manualPayment.cash },
    { value: 'CREDIT_CARD_MANUAL', ...t.checkout.manualPayment.creditManual },
    { value: 'DEBIT_CARD', ...t.checkout.manualPayment.debit },
  ]
  const color = tenant.primaryColor ?? '#f97316'
  const pixEnabled = tenant.pixEnabled ?? tenant.settings?.pixEnabled ?? true
  const cardEnabled = tenant.cardEnabled ?? tenant.settings?.cardEnabled ?? true
  const manualPixEnabled = tenant.manualPixEnabled ?? tenant.settings?.manualPixEnabled ?? false
  // CORREÇÃO (#2): quando o lojista desliga "Rastreamento ao vivo da
  // entrega" (components/dashboard/delivery-tracking-toggle.tsx →
  // tenant.settings.liveTrackingEnabled), o mapa de confirmação de
  // localização também some do checkout — ausente ou `true` = ligado
  // (mesmo default usado na action toggleLiveTrackingAction).
  const liveTrackingEnabled = tenant.settings?.liveTrackingEnabled ?? true
  // CORREÇÃO (#1): cardápio de demonstração — todo o fluxo (carrinho,
  // endereço, dados, escolha da forma de pagamento) fica livre; só a
  // confirmação final do pedido é bloqueada em handleSubmitOrder.
  // CORREÇÃO (#2, ajuste): usa a prop `isDemo` (vinda de ?demo=1 na URL,
  // só presente nos links da landing page) em vez de checar o slug do
  // tenant — o mesmo slug do cardápio de demonstração pode coincidir com
  // o de um tenant real (ex.: conta de teste que manteve o slug do seed),
  // e nesse caso o "Ver cardápio" do dashboard e o link de Configurações
  // não podem ficar travados.
  const isDemoTenant = isDemo
  // 'LINK' (Mercado Pago) não é mais uma opção no cardápio digital — ver
  // ONLINE_PAYMENT_OPTIONS acima. Fica exclusivo do PDV/balcão.
  const onlineOptions = ONLINE_PAYMENT_OPTIONS.filter((o) => {
    if (o.value === 'PIX') return pixEnabled
    if (o.value === 'PIX_MANUAL') return manualPixEnabled
    if (o.value === 'CREDIT_CARD') return cardEnabled
    return true
  })

  // Busca CEP via API interna (evita CORS) e identifica zona de entrega
  const handleCepLookup = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '')
    setCep(rawCep)
    // CORREÇÃO CRÍTICA: esse `selectedAddressLat/Lng` só era limpo quando o
    // cliente clicava em "editar" pra digitar manualmente — mas NUNCA
    // quando o endereço mudava por causa de uma busca de CEP. Resultado:
    // se em algum momento uma coordenada tinha sido selecionada (num
    // endereço A, até de um pedido anterior, já que isso fica salvo no
    // carrinho persistido), e depois o cliente buscava um CEP DIFERENTE
    // (endereço B), o texto mudava pra B mas a coordenada antiga de A
    // continuava lá — e era ela que ia pro pedido, plantando o pino
    // sempre no mesmo lugar de antes, não importa o endereço novo digitado.
    setSelectedAddressLat(null)
    setSelectedAddressLng(null)
    setPinLat(null)
    setPinLng(null)
    setPinConfirmed(false)
    if (digits.length !== 8) { setCepError(''); setCepZone(null); setAddressLockedByCep(false); return }
    setCepLoading(true); setCepError('')

    try {
      const res = await fetch(`/api/cep/${digits}`)
      if (!res.ok) {
        setCepError(t.checkout.cepNotFound)
        setCepZone(null)
        setCepLoading(false)
        setAddressLockedByCep(false)
        return
      }
      const data = await res.json()
      const { logradouro, bairro, localidade } = data

      // CORREÇÃO: rua e "bairro, cidade" ficam em estados separados pra dar
      // pra encaixar o número da casa entre os dois na hora de montar o
      // endereço final (ex.: "Rua Ana Batista 55, Jardim Iracema, Fortaleza")
      // em vez do número cair no fim de tudo.
      setDeliveryAddress(logradouro || '')
      setDeliveryCityLine([bairro, localidade].filter(Boolean).join(', '))
      // Só trava se o CEP realmente devolveu um nome de rua — CEPs de
      // "uso geral" (sem logradouro específico) deixam o campo editável.
      setAddressLockedByCep(!!logradouro)

      const bairroNorm = (bairro || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const zone = tenant.deliveryZones.find(z => {
        const zBairro = (z.bairro || z.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        return zBairro && bairroNorm.includes(zBairro)
      })

      if (zone) {
        setCepZone(zone)
        setDeliveryBairro(zone.bairro)
        setCepError('')
      } else {
        setCepZone(null)
        setCepError(t.checkout.cepOutOfArea)
        setDeliveryBairro(null)
      }
    } catch {
      setCepError(t.checkout.cepFetchError)
      setCepZone(null)
    } finally {
      setCepLoading(false)
    }
  }

  const [step, setStep]               = useState<Step>('cart')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [phone, setPhone]             = useState('')
  const [name, setName]               = useState('')
  const [payments, setPayments]       = useState<PaymentEntry[]>([newEntry('PIX')])
  const [couponInput, setCouponInput] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponDescription, setCouponDescription] = useState('')
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryCityLine, setDeliveryCityLine] = useState('') // "bairro, cidade" — preenchido junto com o CEP
  const [deliveryNumber, setDeliveryNumber] = useState('')
  const [cep, setCep] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState('')
  const [cepZone, setCepZone] = useState<typeof tenant.deliveryZones[0] | null>(null)
  // CORREÇÃO (#3): trava o campo de rua quando ele veio preenchido
  // automaticamente pelo CEP — evita a pessoa mudar sem querer pra um
  // endereço que não bate com o CEP informado (e com a zona de entrega
  // já validada). Só destrava se o CEP não for encontrado, permitindo
  // digitação manual nesse caso.
  const [addressLockedByCep, setAddressLockedByCep] = useState(false)

  // CORREÇÃO (#3): busca alternativa por nome da rua — nem todo cliente
  // sabe o próprio CEP de cabeça, e usar geolocalização exige permissão
  // de GPS que nem sempre está disponível/precisa.
  const [showStreetSearch, setShowStreetSearch] = useState(false)
  const [streetQuery, setStreetQuery] = useState('')
  const [streetResults, setStreetResults] = useState<Array<{ label: string; logradouro: string; bairro: string; localidade: string; uf: string; cep: string | null; lat: number | null; lng: number | null }>>([])
  const [streetSearching, setStreetSearching] = useState(false)
  // Coordenada da sugestão de endereço selecionada no autocomplete — usada
  // só como ESTIMATIVA INICIAL (seed) pra centralizar o mapa de confirmação
  // abaixo. Não é mais o valor final enviado direto (ver histórico de
  // correções nesse arquivo — geocodificação sozinha, mesmo com seleção de
  // sugestão, repetidamente caiu no endereço errado pra ruas sem numeração
  // predial na base do Nominatim/OpenCage).
  const [selectedAddressLat, setSelectedAddressLat] = useState<number | null>(null)
  const [selectedAddressLng, setSelectedAddressLng] = useState<number | null>(null)
  // Posição FINAL confirmada pelo cliente arrastando o mapa (ver
  // components/storefront/address-pin-picker.tsx) — essa é a coordenada
  // que efetivamente vai pro pedido. Fica null até o cliente mexer no
  // mapa; se ele nunca mexer, usamos a estimativa (selectedAddressLat)
  // mesmo, que já é melhor que nada.
  const [pinLat, setPinLat] = useState<number | null>(null)
  const [pinLng, setPinLng] = useState<number | null>(null)
  // CORREÇÃO: o checkout só libera "Continuar" na entrega depois que o
  // cliente confirma a localização no mapa (ver address-pin-picker.tsx) —
  // não basta ter digitado endereço/número.
  const [pinConfirmed, setPinConfirmed] = useState(false)
  // Estimativa inicial pro mapa de confirmação: melhor coordenada que já
  // temos (busca de rua) > localização da loja > centro neutro de
  // Fortaleza. Propositalmente NÃO inclui pinLat/pinLng aqui — isso é o
  // que o componente do mapa reporta de volta, e se entrasse nessa conta
  // o mapa ficaria "brigando" com o dedo do cliente, recentralizando toda
  // vez que ele arrasta.
  const pinSeed = {
    lat: selectedAddressLat ?? tenant.latitude ?? FALLBACK_CENTER.lat,
    lng: selectedAddressLng ?? tenant.longitude ?? FALLBACK_CENTER.lng,
  }

  useEffect(() => {
    if (streetQuery.trim().length < 4) { setStreetResults([]); return }
    const timer = setTimeout(async () => {
      setStreetSearching(true)
      try {
        const cityHint = (() => {
          // CORREÇÃO (#4): esse campo é texto livre — o lojista pode
          // preencher sem vírgula nenhuma (ex.: "Rua das Flores 155 -
          // Centro"). Nesse caso o split(',') devolve um único item, e
          // pegar os "últimos 2" acaba devolvendo o ENDEREÇO INTEIRO como
          // se fosse a cidade, o que polui a busca na Nominatim e faz
          // qualquer rua real não ser encontrada. Só usa como dica quando
          // o endereço realmente tem vírgulas (formato "Rua, Bairro,
          // Cidade - UF") — senão busca sem dica de cidade mesmo.
          const parts = ((tenant.settings as any)?.address ?? '')
            .split(',').map((s: string) => s.trim()).filter(Boolean)
          return parts.length >= 2 ? parts[parts.length - 1] : ''
        })()
        const res = await fetch(`/api/address/search?q=${encodeURIComponent(streetQuery)}&city=${encodeURIComponent(cityHint)}`)
        const data = await res.json()
        setStreetResults(data.results ?? [])
      } catch {
        setStreetResults([])
      } finally {
        setStreetSearching(false)
      }
    }, 500) // debounce — evita 1 requisição por tecla digitada
    return () => clearTimeout(timer)
  }, [streetQuery])

  const selectStreetResult = (r: { logradouro: string; bairro: string; localidade: string; uf: string; cep: string | null; lat: number | null; lng: number | null }) => {
    setDeliveryAddress(r.logradouro)
    setDeliveryCityLine([r.bairro, r.localidade].filter(Boolean).join(', '))
    setAddressLockedByCep(true)
    setShowStreetSearch(false)
    setStreetQuery('')
    setStreetResults([])
    setSelectedAddressLat(r.lat)
    setSelectedAddressLng(r.lng)
    // Novo endereço selecionado — qualquer confirmação de pino anterior
    // (de um endereço diferente) não vale mais.
    setPinLat(null)
    setPinLng(null)
    setPinConfirmed(false)

    // Mesma checagem de zona de entrega usada no fluxo de CEP — sem isso,
    // um endereço achado por rua nunca teria a zona/taxa de entrega
    // calculada.
    const bairroNorm = (r.bairro || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const zone = tenant.deliveryZones.find(z => {
      const zBairro = (z.bairro || z.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return zBairro && bairroNorm.includes(zBairro)
    })
    if (zone) {
      setCepZone(zone)
      setDeliveryBairro(zone.bairro)
      setCepError('')
      if (r.cep) setCep(r.cep)
    } else {
      setCepZone(null)
      setCepError(t.checkout.addressOutOfArea)
      setDeliveryBairro(null)
    }
  }

  // CORREÇÃO (#2): "usar minha localização" — GPS do navegador +
  // geocodificação reversa pra preencher rua/bairro/cidade igual a busca
  // por nome de rua, mas com a coordenada exata do cliente (mais precisa
  // que qualquer busca por texto) já indo direto pro pino do mapa.
  const [locatingMe, setLocatingMe] = useState(false)
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setCepError(t.checkout.geoNotSupported)
      return
    }
    setLocatingMe(true)
    setCepError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`/api/address/reverse?lat=${latitude}&lng=${longitude}`)
          const data = await res.json()
          if (data.result) {
            selectStreetResult({ ...data.result, lat: latitude, lng: longitude })
            // Sobrescreve com a coordenada real do GPS — mais precisa do
            // que a geocodificação reversa (que só arredonda pro imóvel
            // mais próximo conhecido).
            setPinLat(latitude)
            setPinLng(longitude)
          } else {
            setCepError(t.checkout.addressNotFound)
          }
        } catch {
          setCepError(t.checkout.addressFetchError)
        } finally {
          setLocatingMe(false)
        }
      },
      () => {
        setLocatingMe(false)
        setCepError(t.checkout.locationPermissionError)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Cashback / fidelidade ────────────────────────────────────────────────
  const [cashbackBalance, setCashbackBalance] = useState(0)
  const [loyaltyPoints, setLoyaltyPoints]     = useState(0)
  const [loyaltyConfig, setLoyaltyConfig]     = useState<{ redeemEvery: number; redeemValue: number; minPointsRedeem: number } | null>(null)
  const [cashbackToUse, setCashbackToUse]     = useState(0)
  const [useCashback, setUseCashback]         = useState(false)
  const [pointsToRedeem, setPointsToRedeem]   = useState(0)
  const [usePoints, setUsePoints]             = useState(false)

  const {
    items, couponCode, deliveryType, deliveryBairro, tableId, customerPhone,
    removeItem, updateQuantity, setCoupon, setDeliveryType, setDeliveryBairro,
    setCustomer, subtotal, clearCart, addItem,
  } = useCartStore()

  // CORREÇÃO (#4): "Peça também" — sugestão de mais produtos do cardápio
  // logo abaixo da lista de itens do carrinho. Prioriza destaques/mais
  // vendidos, exclui o que já está no carrinho e o que está esgotado.
  const suggestedProducts = (() => {
    const allProducts = (tenant.categories ?? []).flatMap((c) => c.products)
    const inCartIds = new Set(items.map((i) => i.productId))
    const available = allProducts.filter((p) => !inCartIds.has(p.id) && !p.isOutOfStock)
    const featured = available.filter((p) => p.isFeatured || p.isBestSeller)
    const rest = available.filter((p) => !p.isFeatured && !p.isBestSeller)
    return [...featured, ...rest].slice(0, 6)
  })()

  // Buscar saldo de cashback/pontos quando o cliente está identificado
  useEffect(() => {
    const phone = customerPhone
    if (!phone || !tenant.id) { setCashbackBalance(0); setLoyaltyPoints(0); return }
    fetch(`/api/storefront/customer?phone=${encodeURIComponent(phone)}&tenantId=${tenant.id}`)
      .then((r) => r.json())
      .then((d) => {
        setCashbackBalance(d.customer?.cashbackBalance ?? 0)
        setLoyaltyPoints(d.customer?.loyaltyPoints ?? 0)
        setLoyaltyConfig(d.loyaltyConfig ?? null)
      })
      .catch(() => {})
  }, [customerPhone, tenant.id])

  // BUG CORRIGIDO: deliveryFee dependia só de `deliveryBairro`, sem checar
  // `deliveryType`. Como `deliveryBairro` fica salvo no carrinho (persist)
  // e `setDeliveryType` nunca o limpava, trocar de Entrega pra Retirada
  // mantinha o bairro anterior guardado e a taxa de entrega continuava
  // sendo cobrada no total — mesmo depois de reload de página (o bairro
  // é persistido) ou de adicionar outro produto (o cálculo não dependia
  // do tipo de pedido, só recalculava o subtotal).
  const selectedZone = deliveryType === 'DELIVERY' && deliveryBairro
    ? tenant.deliveryZones.find((z) => z.bairro === deliveryBairro)
    : null
  const deliveryFee = selectedZone
    ? (selectedZone.freeAbove && subtotal() >= selectedZone.freeAbove ? 0 : selectedZone.fee)
    : 0
  // Desconto de pontos — calcula em R$ baseado no config do lojista
  const pointsDiscount = (() => {
    if (!usePoints || !loyaltyConfig || pointsToRedeem <= 0) return 0
    const blocks = Math.floor(pointsToRedeem / loyaltyConfig.redeemEvery)
    return blocks * loyaltyConfig.redeemValue
  })()

  const estimatedTotal = Math.max(0, subtotal() + deliveryFee - couponDiscount - (useCashback ? cashbackToUse : 0) - pointsDiscount)

  // CORREÇÃO: quando há só 1 forma de pagamento (sem split), o valor deve
  // sempre acompanhar o total do pedido automaticamente. Antes, o campo
  // ficava vazio até o cliente digitar manualmente e não era atualizado
  // se ele voltasse pro carrinho pra editar/adicionar itens — o total
  // mudava mas o valor do pagamento ficava desatualizado (dessincronizado),
  // podendo travar o envio do pedido ou cobrar um valor errado.
  useEffect(() => {
    if (payments.length !== 1) return
    const synced = estimatedTotal > 0 ? estimatedTotal.toFixed(2) : ''
    setPayments((prev) => (prev.length === 1 && prev[0].amount !== synced)
      ? [{ ...prev[0], amount: synced }]
      : prev)
  }, [estimatedTotal, payments.length])

  const stepIndex = STEPS.indexOf(step)
  const isTableOrder = !!(tableId || tableInfo)

  const totalAllocated = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining      = Math.max(0, estimatedTotal - totalAllocated)
  const isFullyAllocated = Math.abs(totalAllocated - estimatedTotal) < 0.01

  const addPayment = () => {
    const rest = Math.max(0, estimatedTotal - totalAllocated)
    setPayments((prev) => [...prev, { ...newEntry('CASH'), amount: rest > 0 ? rest.toFixed(2) : '' }])
  }

  const removePayment = (id: string) => {
    if (payments.length === 1) return
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePayment = (id: string, field: keyof PaymentEntry, value: string) => {
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p))
  }

  const distributeRemainder = (id: string) => {
    setPayments((prev) => {
      const total = prev.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const diff = estimatedTotal - total
      if (Math.abs(diff) < 0.01) return prev
      return prev.map((p) => p.id === id && !p.amount ? { ...p, amount: Math.max(0, diff).toFixed(2) } : p)
    })
  }

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setIsValidatingCoupon(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim().toUpperCase(), tenantId: tenant.id, subtotal: subtotal() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? t.checkout.couponInvalid); setCouponDiscount(0); setCouponDescription(''); return }
      setCoupon(couponInput.trim().toUpperCase())
      setCouponDiscount(data.discount ?? 0)
      setCouponDescription(data.description ?? '')
      toast.success(fmt(t.checkout.couponApplied, { desc: data.description }))
    } catch { toast.error(t.checkout.couponError) }
    finally { setIsValidatingCoupon(false) }
  }

  const handleSubmitOrder = async () => {
    if (items.length === 0) return
    // CORREÇÃO (#1): demonstração — bloqueia só na confirmação da forma de
    // pagamento (esse clique), depois de todo o resto do fluxo já ter
    // ficado livre pro visitante explorar.
    if (isDemoTenant) {
      toast.error(t.checkout.demoOrderError)
      return
    }
    if (!isTableOrder && !customerPhone && !phone) { toast.error(t.checkout.errPhone); return }
    if (deliveryType === 'DELIVERY' && !cepZone && tenant.deliveryZones.length > 0) { toast.error(t.checkout.errCepDelivery); return }

    // CORREÇÃO: endereço de entrega obrigatório
    if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) {
      toast.error(t.checkout.errAddressBeforeContinue)
      return
    }
    if (deliveryType === 'DELIVERY' && !deliveryNumber.trim()) {
      toast.error(t.checkout.errNumber)
      return
    }

    // Total já cobre zero (cashback/desconto cobriu tudo) — não faz sentido
    // pedir forma de pagamento pra cobrar R$0,00.
    const isFullyCovered = estimatedTotal <= 0

    if (!isFullyCovered) {
      if (payments.some((p) => !p.amount || parseFloat(p.amount) <= 0)) {
        toast.error(t.checkout.errPaymentAmounts)
        return
      }
      if (payments.some((p) => p.method === 'LINK') && payments.length > 1) {
        toast.error('"Link de pagamento" não pode ser combinado com outra forma de pagamento')
        return
      }
      if (!isFullyAllocated) {
        const diff = estimatedTotal - totalAllocated
        if (diff > 0.01) {
          toast.error(`Faltam ${formatCurrency(diff)} para completar o pagamento`)
          return
        }
      }
    }

    setIsSubmitting(true)
    try {
      const isPaymentLink = payments.length === 1 && payments[0].method === 'LINK'

      // Device ID gerado pelo script de segurança do Mercado Pago
      // (window.MP_DEVICE_SESSION_ID), carregado logo abaixo neste mesmo
      // componente assim que o carrinho é aberto (antes só existia via
      // strategy="afterInteractive" no layout do storefront, carregando em
      // toda visita ao cardápio — inclusive pra quem nunca chega a comprar
      // — e consumindo ~740ms de thread principal no meio do carregamento
      // da página, segundo o PageSpeed Insights).
      // Se o script ainda não rodou (ex.: bloqueado por ad-blocker, ou
      // cliente fechou o carrinho rápido demais), segue sem ele — não
      // bloqueia o pedido. Não é necessário pro fluxo de LINK (o Checkout
      // Pro coleta isso sozinho).
      const deviceId = isPaymentLink
        ? undefined
        : (typeof window !== 'undefined' ? (window as any).MP_DEVICE_SESSION_ID : undefined)

      const result = await createOrderAction({
        tenantId: tenant.id,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, addonIds: i.addons.map((a) => a.id), notes: i.notes })),
        type: isTableOrder ? 'TABLE' : deliveryType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        tableId: tableId ?? undefined,
        couponCode: couponCode ?? undefined,
        cashbackToUse:  useCashback && cashbackToUse > 0 ? cashbackToUse : undefined,
        pointsToRedeem: usePoints && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        deliveryBairro: deliveryBairro ?? undefined,
        // Número da casa concatenado no endereço — evita migração de
        // schema só pra isso, e mantém compatibilidade com quem já lê
        // deliveryAddress como texto único (impressão, WhatsApp, etc).
        // CORREÇÃO: faltava vírgula entre rua e número ("Rua Ana Batista
        // 55" em vez de "Rua Ana Batista, 55") — isso confunde o parser de
        // endereço da API de geocodificação, que pode não separar direito
        // nome da rua e número do imóvel.
        deliveryAddress: deliveryAddress
          ? [`${deliveryAddress}, ${deliveryNumber || 'S/N'}`, deliveryCityLine].filter(Boolean).join(', ')
          : undefined,
        // CORREÇÃO FINAL: depois de repetidos casos de geocodificação
        // automática (mesmo com sugestão selecionada) caindo num endereço
        // errado — porque a rua não tinha numeração predial na base da
        // API — a coordenada definitiva agora é a que o cliente confirmou
        // arrastando o mapa (pinLat/pinLng). Só usamos a estimativa da
        // busca (selectedAddressLat/Lng) se ele nunca chegou a mexer no
        // mapa, o que ainda é melhor que nada.
        deliveryLat: pinLat ?? selectedAddressLat ?? undefined,
        deliveryLng: pinLng ?? selectedAddressLng ?? undefined,
        customerPhone: isTableOrder ? (customerPhone || phone || undefined) : (customerPhone || phone),
        customerName: name || undefined,
        // 'LINK' não é um método aceito na criação do pedido (só existe pro
        // cardápio/balcão escolherem) — pra esse caso o pedido é criado sem
        // pagamento embutido, e o link é gerado depois, à parte. O filter
        // abaixo também prova ao TypeScript que nenhum item aqui é 'LINK'
        // (isPaymentLink já garante isso em runtime).
        payments: isFullyCovered || isPaymentLink ? undefined : payments
          .filter((p): p is typeof p & { method: Exclude<PaymentMethodValue, 'LINK'> } => p.method !== 'LINK')
          .map((p) => ({
            method: p.method,
            amount: parseFloat(p.amount),
            changeFor: p.method === 'CASH' && p.changeFor ? Number(p.changeFor) : undefined,
          })),
        paymentMethod: isFullyCovered || isPaymentLink ? undefined : (payments[0].method as Exclude<PaymentMethodValue, 'LINK'>),
        changeFor: !isFullyCovered && !isPaymentLink && payments[0].method === 'CASH' && payments[0].changeFor ? Number(payments[0].changeFor) : undefined,
        deviceId,
        customerCpf: undefined,
        deferPaymentLink: isPaymentLink,
      })

      if (result.error) { toast.error(result.error); return }

      if (isPaymentLink && result.orderId) {
        const res = await fetch(`/api/orders/${result.orderId}/payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.statusToken }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.checkoutUrl) {
          toast.error(data.error ?? 'Pedido criado, mas não foi possível gerar o link de pagamento. Acompanhe seu pedido para tentar de novo.')
          clearCart(); onClose()
          router.push(`/menu/${tenant.slug}/pedido/${result.orderId}`)
          return
        }
        clearCart(); onClose()
        // Redireciona o próprio cliente pra página do Mercado Pago — ele volta
        // automaticamente pra tela de acompanhamento do pedido (back_urls já
        // configuradas em checkout-client.ts).
        window.location.href = data.checkoutUrl
        return
      }
      clearCart(); onClose()
      toast.success(t.checkout.orderSuccess)
      router.push(`/menu/${tenant.slug}/pedido/${result.orderId}`)
    } catch { toast.error(t.checkout.orderError) }
    finally { setIsSubmitting(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/*
        Script de segurança do Mercado Pago — gera o Device ID usado ao
        criar pagamentos PIX via API direta, pra reduzir recusas de
        antifraude. Antes carregava globalmente no layout do storefront
        (toda visita ao cardápio); agora só monta quando o carrinho é
        aberto de fato — o cliente ainda tem as etapas de carrinho → dados
        → pagamento pela frente, tempo de sobra para o script terminar de
        gerar o ID antes do pedido ser enviado.
      */}
      <Script src="https://www.mercadopago.com/v2/security.js" strategy="afterInteractive" {...({ view: 'checkout' } as any)} />

      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-sm bg-white dark:bg-gray-900 flex flex-col h-full shadow-2xl">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                <ShoppingBag className="w-4 h-4" style={{ color }} />
              </div>
              <h2 className="font-black text-gray-900 dark:text-gray-100 text-base">{STEP_LABELS[step]}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!isTableOrder && (
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={cn('flex-1 h-1.5 rounded-full transition-all', i <= stepIndex ? 'opacity-100' : 'opacity-20')}
                    style={{ background: i <= stepIndex ? color : '#e5e7eb' }} />
                  {i < STEPS.length - 1 && <div className="w-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Carrinho ── */}
          {step === 'cart' && (
            <div className="p-5 space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag className="w-7 h-7 text-gray-400" />
                  </div>
                  <p className="font-semibold text-gray-500">{t.checkout.emptyTitle}</p>
                  <p className="text-sm mt-1 text-gray-400">{t.checkout.emptySubtitle}</p>
                  <button
                    onClick={onClose}
                    className="mt-4 text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    style={{ color }}
                  >
                    {t.checkout.seeMenu}
                  </button>
                </div>
              ) : (
                <>
                  {items.map((item) => (
                    <div key={item.cartItemId} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                      {/* CORREÇÃO (#4): thumbnail do produto — carrinho era
                          só texto antes, sem nenhuma referência visual. */}
                      <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
                        {item.productImage ? (
                          <Image src={item.productImage} alt={item.productName} width={64} height={64} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-400" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{item.productName}</p>
                        {item.addons.length > 0 && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.addons.map((a) => a.name).join(', ')}</p>}
                        {item.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">"{item.notes}"</p>}
                        <p className="font-black text-sm mt-1" style={{ color }}>{formatCurrency(item.totalPrice)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button onClick={() => removeItem(item.cartItemId)} className="text-gray-300 hover:text-red-400 transition-colors" aria-label={t.checkout.removeLabel}><Trash2 className="h-3.5 w-3.5" /></button>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)} className="w-7 h-7 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-gray-300 transition-colors"><Minus className="h-3 w-3 text-gray-500" /></button>
                          <span className="text-sm font-bold w-5 text-center text-gray-900 dark:text-gray-100">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)} className="w-7 h-7 rounded-xl flex items-center justify-center text-white" style={{ background: color }}><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* CORREÇÃO (#4): "Peça também" — sugestão rápida de mais
                      itens do cardápio, adicionados direto ao carrinho
                      (sem abrir modal de customização, pra ficar rápido). */}
                  {suggestedProducts.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">{t.checkout.orderAgainLabel}</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        {suggestedProducts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              addItem({ productId: p.id, productName: p.name, productPrice: p.price, productImage: p.image, quantity: 1, addons: [] })
                              toast.success(fmt(t.checkout.addedToast, { name: p.name }))
                            }}
                            className="flex-shrink-0 w-24 text-left bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden"
                          >
                            <div className="w-full h-16 bg-gray-100 dark:bg-gray-800">
                              {p.image ? (
                                <Image src={p.image} alt={p.name} width={96} height={64} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-4 h-4 text-gray-400" /></div>
                              )}
                            </div>
                            <div className="p-1.5">
                              <p className="text-[10px] font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">{p.name}</p>
                              <p className="text-[10px] font-black mt-0.5" style={{ color }}>{formatCurrency(p.price)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cupom */}
                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder={t.checkout.couponPlaceholder}
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <button onClick={handleApplyCoupon} disabled={isValidatingCoupon || !couponInput.trim()}
                        className="px-3 py-2.5 rounded-xl text-white text-sm font-bold transition-colors" style={{ background: color }}>
                        {isValidatingCoupon ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : <Tag className="h-4 w-4" />}
                      </button>
                    </div>
                    {couponCode && (
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ {couponCode}{couponDescription ? ` — ${couponDescription}` : ''}
                          {couponDiscount > 0 && <span className="ml-1 font-bold">(-{formatCurrency(couponDiscount)})</span>}
                        </span>
                        <button onClick={() => { setCoupon(null); setCouponInput(''); setCouponDiscount(0); setCouponDescription('') }} className="text-xs text-red-400 hover:text-red-500">{t.checkout.couponRemove}</button>
                      </div>
                    )}
                  </div>

                  {/* Cashback — só mostra se o cliente estiver identificado e tiver saldo */}
                  {cashbackBalance > 0 && (
                    <div className="pt-2">
                      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                              {t.checkout.cashbackAvailable}
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                              {t.checkout.cashbackBalance} <strong>{formatCurrency(cashbackBalance)}</strong>
                            </p>
                          </div>
                          {/* Toggle */}
                          <button
                            onClick={() => {
                              const next = !useCashback
                              setUseCashback(next)
                              if (next) {
                                // Usar o menor entre saldo disponível e total do pedido
                                const max = Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount)
                                setCashbackToUse(Math.floor(max * 100) / 100)
                              } else {
                                setCashbackToUse(0)
                              }
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors ${useCashback ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useCashback ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {useCashback && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">{t.checkout.cashbackUsing} <strong>{formatCurrency(cashbackToUse)}</strong></span>
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">{t.checkout.cashbackMax} {formatCurrency(Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount))}</span>
                            </div>
                            <input
                              type="range" min={0}
                              max={Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount)}
                              step={0.01}
                              value={cashbackToUse}
                              onChange={(e) => setCashbackToUse(Number(e.target.value))}
                              className="w-full accent-emerald-500"
                            />
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 text-center font-medium">
                              -({formatCurrency(cashbackToUse)}) {t.checkout.inTotalSuffix}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pontos de fidelidade — resgate configurável pelo lojista */}
                  {loyaltyPoints > 0 && loyaltyConfig && loyaltyPoints >= loyaltyConfig.minPointsRedeem && (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                            {t.checkout.loyaltyUsePoints}
                          </p>
                          <p className="text-xs text-amber-600/80 mt-0.5">
                            {t.checkout.loyaltyYouHave} <strong>{loyaltyPoints} {t.checkout.ptsSuffix}</strong> · {t.checkout.loyaltyEvery} {loyaltyConfig.redeemEvery} {t.checkout.ptsSuffix} = {formatCurrency(loyaltyConfig.redeemValue)}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !usePoints
                            setUsePoints(next)
                            if (next) {
                              // Máximo de pontos que pode usar sem negativar o pedido
                              const maxDiscount = subtotal() + deliveryFee - couponDiscount - (useCashback ? cashbackToUse : 0)
                              const maxBlocks   = Math.floor(maxDiscount / loyaltyConfig.redeemValue)
                              const available   = Math.floor(loyaltyPoints / loyaltyConfig.redeemEvery)
                              const blocks      = Math.min(maxBlocks, available)
                              setPointsToRedeem(blocks * loyaltyConfig.redeemEvery)
                            } else {
                              setPointsToRedeem(0)
                            }
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${usePoints ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${usePoints ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {usePoints && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              {t.checkout.loyaltyUsing} <strong>{pointsToRedeem} {t.checkout.ptsSuffix}</strong> = <strong>{formatCurrency(pointsDiscount)}</strong>
                            </span>
                            <span className="text-xs text-amber-600/80">
                              {t.checkout.loyaltyRemaining} {loyaltyPoints - pointsToRedeem} {t.checkout.ptsSuffix}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.floor(loyaltyPoints / loyaltyConfig.redeemEvery) * loyaltyConfig.redeemEvery}
                            step={loyaltyConfig.redeemEvery}
                            value={pointsToRedeem}
                            onChange={(e) => setPointsToRedeem(Number(e.target.value))}
                            className="w-full accent-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tipo de entrega */}
                  {!isTableOrder && (
                    <div className="pt-2">
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t.checkout.howToReceive}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['DELIVERY', 'PICKUP'] as const).map((type) => (
                          <button key={type} onClick={() => {
                            setDeliveryType(type)
                            // CORREÇÃO (junto com o cálculo de deliveryFee acima): ao
                            // trocar pra Retirada, limpa o CEP/zona da tela — senão,
                            // se o cliente voltar pra Entrega depois, via reaparecer o
                            // aviso "Entrega disponível" de uma busca antiga sem
                            // revalidar o CEP contra o carrinho atual.
                            if (type === 'PICKUP') {
                              setCep('')
                              setCepZone(null)
                              setCepError('')
                              setDeliveryBairro(null)
                              setDeliveryCityLine('')
                            }
                          }}
                            className={cn('py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-1.5',
                              deliveryType === type ? 'text-white border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300')}
                            style={deliveryType === type ? { background: color, borderColor: color } : {}}>
                            {type === 'DELIVERY' ? <><Truck className="w-4 h-4" /> {t.checkout.delivery}</> : <><Store className="w-4 h-4" /> {t.checkout.pickup}</>}
                          </button>
                        ))}
                      </div>
                      {deliveryType === 'DELIVERY' && (
                        <div className="mt-3 space-y-2">
                          {/* CORREÇÃO (#2): campo de CEP removido — a
                              busca por nome da rua já cobre o mesmo caso
                              de uso (achar a zona de entrega) sem exigir
                              que o cliente saiba o CEP de cabeça, e sem a
                              etapa extra de "não sabe o CEP?". Fica só a
                              busca por rua + a opção de usar o GPS. */}
                          <div className="relative">
                            <input
                              type="text"
                              value={streetQuery}
                              onChange={(e) => setStreetQuery(e.target.value)}
                              placeholder={t.checkout.streetPlaceholder}
                              className="w-full px-3 py-2.5 text-sm border rounded-xl bg-transparent border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            {streetSearching && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                            )}
                            {streetResults.length > 0 && (
                              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
                                {streetResults.map((r, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => selectStreetResult(r)}
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                            )}
                            {!streetSearching && streetQuery.trim().length >= 4 && streetResults.length === 0 && (
                              <p className="text-xs text-gray-400 mt-1">{t.checkout.noAddressFound}</p>
                            )}
                          </div>

                          {/* CORREÇÃO (#2): opção de compartilhar a
                              localização do celular — preenche o endereço
                              sozinho via GPS (mais preciso que buscar por
                              nome de rua) e já posiciona o pino do mapa na
                              coordenada exata. */}
                          <button
                            type="button"
                            onClick={useMyLocation}
                            disabled={locatingMe}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 disabled:opacity-60 transition-colors"
                          >
                            {locatingMe ? (
                              <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5" />
                            )}
                            {locatingMe ? t.checkout.searchingLocation : t.checkout.useMyLocation}
                          </button>

                          {cepError && <p className="text-xs text-red-500">{cepError}</p>}
                          {cepZone && (
                            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                              ✓ {t.checkout.deliveryAvailable} — {cepZone.name ?? cepZone.bairro} · {cepZone.freeAbove && subtotal() >= cepZone.freeAbove ? t.checkout.freeShipping : formatCurrency(cepZone.fee)}
                            </div>
                          )}

                          {/* Endereço preenchido automaticamente ou manualmente */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2 relative">
                              <input
                                type="text"
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                placeholder={t.checkout.streetComplementPlaceholder}
                                readOnly={addressLockedByCep}
                                className={cn(
                                  'w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500',
                                  addressLockedByCep ? 'bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 cursor-not-allowed' : 'bg-transparent',
                                  !deliveryAddress.trim() ? 'border-brand-300 dark:border-brand-700' : 'border-gray-200 dark:border-gray-700'
                                )}
                              />
                              {/* CORREÇÃO (#3): campo trava quando vem do
                                  CEP pra não descasar do endereço validado
                                  — mas dá pra destravar manualmente se
                                  precisar corrigir algo (ex: CEP genérico
                                  que trouxe a rua errada). */}
                              {addressLockedByCep && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddressLockedByCep(false)
                                    // Cliente vai editar o texto manualmente — a coordenada
                                    // da sugestão selecionada não serve mais de âncora, e o
                                    // pino confirmado no mapa (se houver) também não vale mais.
                                    setSelectedAddressLat(null)
                                    setSelectedAddressLng(null)
                                    setPinLat(null)
                                    setPinLng(null)
                                    setPinConfirmed(false)
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold underline"
                                  style={{ color }}
                                >
                                  editar
                                </button>
                              )}
                            </div>
                            {/* CORREÇÃO: número da casa ficava dentro do
                                mesmo texto corrido do endereço — cliente
                                esquecia de digitar e o entregador não
                                achava a casa. Agora é campo obrigatório
                                separado. */}
                            <input
                              type="text"
                              inputMode="numeric"
                              value={deliveryNumber}
                              onChange={(e) => setDeliveryNumber(e.target.value)}
                              placeholder={t.checkout.numberPlaceholder}
                              className={cn(
                                'px-3 py-2.5 text-sm border rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500',
                                !deliveryNumber.trim() ? 'border-brand-300 dark:border-brand-700' : 'border-gray-200 dark:border-gray-700'
                              )}
                            />
                          </div>
                          {/* Mapa de confirmação: depois de repetidas
                              tentativas de fazer a geocodificação automática
                              (Nominatim/OpenCage) acertar sozinha a casa
                              exata — sem sucesso pra ruas sem numeração
                              predial na base delas — a decisão final da
                              localização passa a ser do cliente, arrastando
                              o mapa até a posição certa. Ver
                              components/storefront/address-pin-picker.tsx. */}
                          {/* CORREÇÃO (#2): com o rastreamento ao vivo
                              desligado pelo lojista, não faz sentido pedir
                              essa confirmação de pino ao cliente. */}
                          {deliveryAddress.trim() && liveTrackingEnabled && (
                            <div className="mt-2">
                              <AddressPinPicker
                                seedLat={pinSeed.lat}
                                seedLng={pinSeed.lng}
                                onChange={(lat, lng) => { setPinLat(lat); setPinLng(lng) }}
                                onConfirm={() => setPinConfirmed(true)}
                                confirmed={pinConfirmed}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Dados do cliente ── */}
          {step === 'info' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t.checkout.phoneLabel}</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.checkout.phonePlaceholder}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-gray-400 mt-1.5">{t.checkout.phoneHelp}</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t.checkout.nameLabel}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.checkout.namePlaceholder} required
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
          )}

          {/* ── Pagamento ── */}
          {step === 'payment' && (
            <div className="p-5 space-y-4">
              {isTableOrder && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    {t.checkout.phoneOptionalTable}
                  </label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.checkout.phonePlaceholder}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              )}

              {/* Formas de Pagamento Múltiplas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{t.checkout.paymentMethods}</p>
                  {payments.length < 4 && (
                    <button onClick={addPayment}
                      className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors text-white"
                      style={{ background: color }}>
                      <PlusCircle className="w-3.5 h-3.5" /> {t.checkout.splitButton}
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {payments.map((entry, idx) => (
                    <div key={entry.id} className="border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {payments.length > 1 ? fmt(t.checkout.paymentNumbered, { n: idx + 1 }) : t.checkout.paymentSingular}
                        </span>
                        {payments.length > 1 && (
                          <button onClick={() => removePayment(entry.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <MinusCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* CORREÇÃO: separar visualmente pagamento online (cobrado
                          agora, confirmação automática) de pagamento manual
                          (pago na entrega/retirada, confirmado pela loja) */}
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                            {t.checkout.onlinePaymentHeading}
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {onlineOptions.map((opt) => (
                              <button key={opt.value} onClick={() => updatePayment(entry.id, 'method', opt.value)}
                                title={opt.sub}
                                className={cn('py-2.5 px-2 rounded-xl text-xs font-bold border-2 text-center transition-all',
                                  entry.method === opt.value ? 'text-white border-transparent' : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-200')}
                                style={entry.method === opt.value ? { background: color, borderColor: color } : {}}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                            {t.checkout.manualPaymentHeading}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {MANUAL_PAYMENT_OPTIONS.map((opt) => (
                              <button key={opt.value} onClick={() => updatePayment(entry.id, 'method', opt.value)}
                                title={opt.sub}
                                className={cn('py-2.5 px-2 rounded-xl text-xs font-bold border-2 text-center transition-all',
                                  entry.method === opt.value ? 'text-white border-transparent' : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-200')}
                                style={entry.method === opt.value ? { background: color, borderColor: color } : {}}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {[...onlineOptions, ...MANUAL_PAYMENT_OPTIONS].find(o => o.value === entry.method)?.sub}
                        </p>
                      </div>

                      {/* Valor */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry.amount}
                            onChange={(e) => updatePayment(entry.id, 'amount', e.target.value)}
                            onFocus={() => distributeRemainder(entry.id)}
                            placeholder={payments.length > 1 ? 'Valor' : estimatedTotal.toFixed(2)}
                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        {payments.length > 1 && remaining > 0.01 && !entry.amount && (
                          <button
                            onClick={() => updatePayment(entry.id, 'amount', remaining.toFixed(2))}
                            className="text-xs px-2.5 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 transition-colors whitespace-nowrap">
                            +{formatCurrency(remaining)}
                          </button>
                        )}
                      </div>

                      {entry.method === 'CASH' && (
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{t.checkout.changeForLabel}</label>
                          <input type="number" value={entry.changeFor} onChange={(e) => updatePayment(entry.id, 'changeFor', e.target.value)}
                            placeholder={t.checkout.changeForPlaceholder}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {payments.length > 1 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-500">{t.checkout.allocated}</span>
                      <span className={cn(isFullyAllocated ? 'text-emerald-600' : totalAllocated > estimatedTotal ? 'text-red-500' : 'text-amber-500')}>
                        {formatCurrency(totalAllocated)} / {formatCurrency(estimatedTotal)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', isFullyAllocated ? 'bg-emerald-500' : totalAllocated > estimatedTotal ? 'bg-red-400' : 'bg-amber-400')}
                        style={{ width: `${Math.min(100, (totalAllocated / estimatedTotal) * 100)}%` }} />
                    </div>
                    {!isFullyAllocated && remaining > 0.01 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">{t.checkout.missingToAllocate} {formatCurrency(remaining)}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Resumo */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{t.checkout.subtotal}</span><span>{formatCurrency(subtotal())}</span>
                </div>
                {deliveryType === 'DELIVERY' && (
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{t.checkout.deliveryFeeLabel}</span><span>{deliveryFee === 0 ? t.checkout.freeLabel : formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                {couponCode && couponDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>{t.checkout.couponLabel} {couponCode}</span><span>-{formatCurrency(couponDiscount)}</span>
                  </div>
                )}
                {useCashback && cashbackToUse > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>{t.checkout.cashbackLabel}</span><span>-{formatCurrency(cashbackToUse)}</span>
                  </div>
                )}
                {usePoints && pointsDiscount > 0 && (
                  <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400 font-semibold">
                    <span>{t.checkout.pointsLabel} ({pointsToRedeem} {t.checkout.ptsSuffix})</span><span>-{formatCurrency(pointsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700 pt-2.5">
                  <span>{t.checkout.estimatedTotal}</span>
                  <span style={{ color }}>{formatCurrency(estimatedTotal)}</span>
                </div>
                <p className="text-[10px] text-gray-400 text-center">{t.checkout.finalValueNote}</p>
              </div>

              {/* CORREÇÃO (#1): avisa antes do clique — o bloqueio em si
                  acontece em handleSubmitOrder. */}
              {isDemoTenant && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 text-center">
                  {t.checkout.demoOrderDisabledNotice}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            {step === 'cart' && (
              <button onClick={() => {
                // Validate address before proceeding
                if (deliveryType === 'DELIVERY' && !cepZone && tenant.deliveryZones.length > 0) {
                  toast.error(t.checkout.errCepDelivery)
                  return
                }
                if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) {
                  toast.error(t.checkout.errAddressBeforeContinue)
                  return
                }
                if (deliveryType === 'DELIVERY' && !deliveryNumber.trim()) {
                  toast.error(t.checkout.errNumber)
                  return
                }
                if (deliveryType === 'DELIVERY' && liveTrackingEnabled && !pinConfirmed) {
                  toast.error(t.checkout.errConfirmLocation)
                  return
                }
                setStep(isTableOrder ? 'payment' : 'info')
              }}
                disabled={deliveryType === 'DELIVERY' && (!deliveryNumber.trim() || (liveTrackingEnabled && !pinConfirmed))}
                className="w-full flex items-center justify-between text-white px-5 py-3.5 rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                <span>{t.checkout.continueBtn}</span>
                <div className="flex items-center gap-2">
                  <span>{formatCurrency(estimatedTotal)}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            )}
            {step === 'info' && (
              <div className="flex gap-2">
                <button onClick={() => setStep('cart')} className="px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 transition-colors">{t.checkout.back}</button>
                <button
                  onClick={() => {
                    if (!phone && !customerPhone) { toast.error(t.checkout.errPhone); return }
                    if (!name.trim()) { toast.error(t.checkout.errName); return }
                    setCustomer(phone || customerPhone!, name)
                    setStep('payment')
                  }}
                  className="flex-1 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  {t.checkout.continueBtn} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {step === 'payment' && (
              <div className="flex gap-2">
                <button onClick={() => setStep(isTableOrder ? 'cart' : 'info')} className="px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 transition-colors">{t.checkout.back}</button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={isSubmitting}
                  className="flex-1 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t.checkout.sending}</>
                  ) : (
                    <>{t.checkout.placeOrder} · {formatCurrency(estimatedTotal)}</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
