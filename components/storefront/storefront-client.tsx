'use client'
// components/storefront/storefront-client.tsx — com todas as correções

import { useState, useEffect, useRef, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useCartStore } from '@/lib/store/cart'
import { ProductCard } from './product-card'
import { CartDrawer } from './cart-drawer'
import { ProductModal } from './product-modal'
import { CategoryNav } from './category-nav'
import { ClosedBanner } from './closed-banner'
import {
  Search, X, ShoppingBag, MapPin, Clock, Star,
  ChevronDown, MessageCircle, Flame, Sparkles,
  Info, Instagram, Home as HomeIcon, Clock3, CreditCard,
  ChevronRight, ArrowLeft, User, LogOut, Settings, Moon, Sun,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import Image from 'next/image'

interface Product {
  id: string; name: string; description: string | null
  price: number; comparePrice: number | null; image: string | null
  isFeatured: boolean; isBestSeller: boolean
  preparationTime: number | null; tags: string[]; addonGroups: AddonGroup[]
}
interface AddonGroup {
  id: string; name: string; minSelect: number; maxSelect: number
  isRequired: boolean; addons: Array<{ id: string; name: string; price: number }>
}
interface Category { id: string; name: string; image: string | null; products: Product[] }

interface StorefrontClientProps {
  tenant: {
    id: string; name: string; slug: string; logo: string | null
    primaryColor: string | null; phone: string | null; settings: any
    categories: Category[]
    deliveryZones: Array<{
      id: string; type: string; name: string | null; bairro: string | null
      fee: number; freeAbove: number | null; minOrder: number | null; maxTime: number | null
    }>
  }
  tableInfo: { id: string; number: number; sector: string } | null
  isOpen: boolean
  closedMessage?: string
}

// ─── Modal de Mais Informações ───
function InfoModal({
  tenant,
  isOpen: modalOpen,
  onClose,
  color,
}: {
  tenant: StorefrontClientProps['tenant']
  isOpen: boolean
  onClose: () => void
  color: string
}) {
  const settings = tenant.settings as any ?? {}
  const instagram: string | null = settings?.instagram ?? null
  const address: string | null = settings?.address ?? null
  const businessHours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isOpen: boolean }> =
    settings?.businessHoursDisplay ?? []
  const acceptedPayments: string[] = settings?.acceptedPayments ?? []

  const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  if (!modalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5" style={{ color }} />
            <h2 className="font-black text-gray-900 dark:text-gray-100 text-lg">Mais informações</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Sobre / Instagram */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-black text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <User className="w-4 h-4" style={{ color }} /> Sobre
            </h3>
            {tenant.name && <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold">{tenant.name}</p>}
            {instagram && (
              <a
                href={`https://instagram.com/${instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}
              >
                <Instagram className="w-4 h-4" />
                {instagram.startsWith('@') ? instagram : `@${instagram}`}
              </a>
            )}
            {address && (
              <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
                <span>{address}</span>
              </div>
            )}
            {!instagram && !address && (
              <p className="text-sm text-gray-400">Informações de contato não configuradas.</p>
            )}
          </div>

          {/* Horários */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-black text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock3 className="w-4 h-4" style={{ color }} /> Horários de funcionamento
            </h3>
            {businessHours.length > 0 ? (
              <div className="space-y-2">
                {businessHours.map((h) => (
                  <div key={h.dayOfWeek} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300 w-20">{DAYS[h.dayOfWeek]}</span>
                    {h.isOpen ? (
                      <span className="text-gray-600 dark:text-gray-400">{h.openTime} – {h.closeTime}</span>
                    ) : (
                      <span className="text-red-400 font-semibold">Fechado</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Horários não configurados.</p>
            )}
          </div>

          {/* Pagamentos */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-black text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4" style={{ color }} /> Formas de pagamento
            </h3>
            {acceptedPayments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {acceptedPayments.map((p) => (
                  <span key={p} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white" style={{ background: color }}>
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">PIX, Dinheiro, Cartão de Crédito/Débito</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Login do Cliente ───
function CustomerAuthModal({
  isOpen: modalOpen,
  onClose,
  color,
  tenantId,
}: {
  isOpen: boolean
  onClose: () => void
  color: string
  tenantId: string
}) {
  const [step, setStep] = useState<'phone' | 'otp' | 'profile'>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState('')
  const { setCustomer, customerPhone } = useCartStore()

  const formatPhoneDisplay = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  }

  const handlePhoneSubmit = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { setError('Digite um número válido'); return }
    setIsLoading(true); setError('')
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `55${digits}`, tenantId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao enviar código'); return }
      if (data.alreadyVerified) {
        setCustomer(`55${digits}`, data.name ?? '')
        onClose(); return
      }
      if (data.devCode) setDevCode(data.devCode)
      setStep('otp')
    } catch { setError('Erro de conexão') }
    finally { setIsLoading(false) }
  }

  const handleOtpSubmit = async () => {
    if (otpCode.length < 4) { setError('Digite o código completo'); return }
    setIsLoading(true); setError('')
    try {
      const digits = phone.replace(/\D/g, '')
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `55${digits}`, code: otpCode, tenantId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Código inválido'); return }
      setCustomer(`55${digits}`, data.name ?? '')
      if (!data.name) setStep('profile')
      else onClose()
    } catch { setError('Erro de conexão') }
    finally { setIsLoading(false) }
  }

  const handleProfileSave = () => {
    const digits = phone.replace(/\D/g, '')
    setCustomer(`55${digits}`, name)
    onClose()
  }

  if (!modalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          {step !== 'phone' && (
            <button onClick={() => setStep(step === 'otp' ? 'phone' : 'otp')} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mr-1">
              <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="font-black text-gray-900 dark:text-gray-100">
              {step === 'phone' ? 'Entrar / Cadastrar' : step === 'otp' ? 'Verificar número' : 'Seu nome'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 'phone' ? 'Use seu WhatsApp para acompanhar pedidos e pontos de fidelidade' :
               step === 'otp' ? `Código enviado para ${phone}` : 'Informe seu nome para identificação'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-xl">⚠ {error}</p>}

          {step === 'phone' && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(formatPhoneDisplay(e.target.value)); setError('') }}
                  placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': color } as any}
                  onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                />
              </div>
              <button
                onClick={handlePhoneSubmit}
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                {isLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</> : 'Enviar código'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              {devCode && <p className="text-xs text-center text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 rounded-xl">🧪 Código de desenvolvimento: <strong>{devCode}</strong></p>}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Código de verificação</label>
                <input
                  type="number"
                  value={otpCode}
                  onChange={(e) => { setOtpCode(e.target.value.slice(0, 6)); setError('') }}
                  placeholder="000000"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm text-center tracking-widest font-bold bg-transparent focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': color } as any}
                />
              </div>
              <button
                onClick={handleOtpSubmit}
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                {isLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verificando...</> : 'Confirmar'}
              </button>
            </>
          )}

          {step === 'profile' && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Seu nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João Silva"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': color } as any}
                />
              </div>
              <button
                onClick={handleProfileSave}
                className="w-full py-3.5 rounded-2xl text-white font-bold"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                Salvar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function StorefrontClient({ tenant, tableInfo, isOpen, closedMessage }: StorefrontClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [heroCollapsed, setHeroCollapsed] = useState(false)
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  // nav mobile: 'home' | 'offers' | 'orders'
  const [activeNav, setActiveNav] = useState<'home' | 'offers' | 'orders'>('home')

  const categoryRefs = useRef<Record<string, HTMLElement>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)

  const { setTenant, setTable, totalItems, subtotal, customerPhone, customerName } = useCartStore()

  const color = tenant.primaryColor ?? '#f97316'
  const { theme, setTheme } = useTheme()
  const settings = tenant.settings as any ?? {}
  const coverImage: string | null = settings?.coverImage ?? null
  const bannerText: string | null = settings?.tagline ?? null

  useEffect(() => {
    setTenant(tenant.id)
    if (tableInfo) setTable(tableInfo.id, tableInfo.number)
  }, [tenant.id, tableInfo, setTenant, setTable])

  // Collapse hero on scroll
  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY
      setHeroCollapsed(scrollY > 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return tenant.categories
    const q = searchQuery.toLowerCase()
    return tenant.categories
      .map((cat) => ({
        ...cat,
        products: cat.products.filter(
          (p) => p.name.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.products.length > 0)
  }, [searchQuery, tenant.categories])

  const featuredProducts = useMemo(() => {
    if (searchQuery) return []
    return tenant.categories.flatMap((c) => c.products).filter((p) => p.isFeatured).slice(0, 8)
  }, [searchQuery, tenant.categories])

  const bestSellers = useMemo(() => {
    if (searchQuery) return []
    return tenant.categories.flatMap((c) => c.products).filter((p) => p.isBestSeller).slice(0, 6)
  }, [searchQuery, tenant.categories])

  const offerProducts = useMemo(() => {
    return tenant.categories
      .flatMap((c) => c.products)
      .filter((p) => p.comparePrice && p.comparePrice > p.price)
  }, [tenant.categories])

  const minDeliveryFee = tenant.deliveryZones.length > 0
    ? Math.min(...tenant.deliveryZones.map((z) => z.fee))
    : null
  const minDeliveryTime = tenant.deliveryZones.length > 0
    ? Math.min(...tenant.deliveryZones.filter((z) => z.maxTime).map((z) => z.maxTime!))
    : null

  const scrollToCategory = (categoryId: string) => {
    setSearchQuery('')
    const el = categoryRefs.current[categoryId]
    if (el) {
      const offset = 130
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) setActiveCategoryId(entry.target.id) })
      },
      { threshold: 0.2, rootMargin: '-120px 0px -60% 0px' }
    )
    Object.values(categoryRefs.current).forEach((el) => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [tenant.categories])

  const cartCount = totalItems()
  const cartTotal = subtotal()

  // Navegar pelo menu mobile
  const handleNavHome = () => {
    setActiveNav('home')
    setSearchQuery('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleNavOffers = () => {
    setActiveNav('offers')
    setSearchQuery('')
  }
  const handleNavOrders = () => {
    setActiveNav('orders')
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-gray-950 smooth-scroll">

      {/* ─── STICKY MINI HEADER (aparece após scroll) ─── */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          heroCollapsed
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="glass-card border-b border-gray-200/60 dark:border-gray-800">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {tenant.logo ? (
                <img src={tenant.logo} alt={tenant.name}
                  className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
                  {tenant.name[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-black text-sm text-gray-900 dark:text-white truncate leading-tight">{tenant.name}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {isOpen ? 'Aberto' : 'Fechado'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Botão Mais Informações */}
              <button
                onClick={() => setInfoModalOpen(true)}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-gray-200 text-gray-600 dark:text-gray-300 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mais info</span>
              </button>
              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-white font-bold text-xs flex-shrink-0 transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {cartCount > 0 && <span>{cartCount} itens · {formatCurrency(cartTotal)}</span>}
                {cartCount === 0 && <span>Carrinho</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── HERO — estilo DR Doces ─── */}
      <div ref={heroRef} className="bg-white dark:bg-gray-900">

        {/* Banner — largura total, altura fixa responsiva, sem corte */}
        <div className="w-full overflow-hidden" style={{ height: 'clamp(120px, 33vw, 220px)' }}>
          {coverImage ? (
            <img src={coverImage} alt={`${tenant.name} banner`} className="w-full h-full object-cover object-center" />
          ) : (
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}55, ${color}cc)` }} />
          )}
        </div>

        {/* Logo centralizado — sobreposto na borda inferior do banner */}
        <div className="flex justify-center -mt-10 relative z-10">
          {tenant.logo ? (
            <img src={tenant.logo} alt={tenant.name}
              className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-gray-900 shadow-lg" />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-black text-2xl border-4 border-white dark:border-gray-900 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
              {tenant.name[0]}
            </div>
          )}
        </div>

        {/* Info centralizada */}
        <div className="text-center px-4 pt-2 pb-4">
          <h1 className="text-xl font-black text-gray-900 dark:text-white">{tenant.name}</h1>
          {bannerText && <p className="text-gray-500 text-sm mt-0.5">{bannerText}</p>}

          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap text-sm text-gray-500">
            {settings?.address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {settings.address}
              </span>
            )}
            {settings?.address && <span>•</span>}
            <button onClick={() => setInfoModalOpen(true)} className="font-semibold text-gray-700 dark:text-gray-300 hover:underline">
              Mais informações
            </button>
          </div>

          <div className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            {isOpen ? (
              <span className="font-semibold" style={{ color }}>
                Aberto{minDeliveryTime ? ` · ${minDeliveryTime}–${minDeliveryTime + 15} min` : ''}
                {minDeliveryFee !== null ? ` · a partir de ${minDeliveryFee === 0 ? 'grátis' : formatCurrency(minDeliveryFee)}` : ''}
              </span>
            ) : (
              <span className="font-semibold text-red-500">Fechado no momento</span>
            )}
            {tableInfo && (
              <span className="flex items-center justify-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" /> Mesa {tableInfo.number}
              </span>
            )}
          </div>

          {/* Botões — apenas desktop (mobile já tem nav embaixo) */}
          <div className="hidden sm:flex items-center justify-center gap-2 mt-3 flex-wrap">
            <button onClick={handleNavHome}
              className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-all">
              <HomeIcon className="w-3.5 h-3.5" /> Início
            </button>
            <button onClick={handleNavOffers}
              className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-all">
              <Flame className="w-3.5 h-3.5" /> Ofertas
            </button>
            <button onClick={handleNavOrders}
              className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Pedidos
            </button>
            {tenant.phone && (
              <a href={`https://wa.me/${tenant.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-all">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {/* Toggle tema — desktop */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark'
                ? <Sun className="w-3.5 h-3.5" />
                : <Moon className="w-3.5 h-3.5" />
              }
              {theme === 'dark' ? 'Claro' : 'Escuro'}
            </button>
            <button onClick={() => setCartOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
              <ShoppingBag className="w-3.5 h-3.5" />
              {cartCount > 0 ? `Carrinho · ${formatCurrency(cartTotal)}` : 'Carrinho'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── BARRA DE BUSCA + NAV ─── */}
      <div className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-900/5">
        <div className="max-w-3xl mx-auto">
          {/* Busca */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar no cardápio…"
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': color } as any}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          {!searchQuery && activeNav === 'home' && (
            <CategoryNav
              categories={tenant.categories}
              activeCategoryId={activeCategoryId}
              onCategoryClick={scrollToCategory}
              primaryColor={color}
            />
          )}
        </div>
      </div>

      {/* ─── AVISO FECHADO ─── */}
      {!isOpen && <ClosedBanner message={closedMessage ?? 'Estabelecimento fechado no momento.'} />}

      {/* ─── CONTEÚDO PRINCIPAL ─── */}
      <main className="max-w-3xl mx-auto pb-safe px-4 pt-5 space-y-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>

        {/* ── TELA DE OFERTAS ── */}
        {activeNav === 'offers' && (
          <section>
            <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-sm">🏷️</span>
              Ofertas
            </h2>
            {offerProducts.length > 0 ? (
              <div className="product-grid">
                {offerProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={() => setSelectedProduct(product)}
                    disabled={!isOpen}
                    primaryColor={color}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4 text-2xl">🏷️</div>
                <p className="font-semibold text-gray-500">Nenhuma oferta no momento</p>
              </div>
            )}
          </section>
        )}

        {/* ── TELA DE PEDIDOS ── */}
        {activeNav === 'orders' && (
          <section>
            <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm">📋</span>
              Meus pedidos
            </h2>
            {customerPhone ? (
              <div className="space-y-3">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black" style={{ background: color }}>
                        {(customerName ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-sm text-gray-900 dark:text-white">{customerName || 'Cliente'}</p>
                        <p className="text-xs text-gray-400">{customerPhone}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { useCartStore.getState().setCustomer('', ''); }}
                      className="text-xs text-red-400 hover:text-red-500 font-semibold flex items-center gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sair
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center py-4">Histórico de pedidos disponível em breve.</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4 text-2xl">👤</div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Entre para ver seus pedidos</p>
                <p className="text-sm text-gray-400 mb-5">Use seu WhatsApp para acompanhar pedidos e acumular pontos de fidelidade</p>
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="px-6 py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                >
                  Entrar / Cadastrar
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── CONTEÚDO HOME ── */}
        {activeNav === 'home' && (
          <>
            {/* DESTAQUES carousel */}
            {featuredProducts.length > 0 && !searchQuery && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    Destaques
                  </h2>
                  <span className="text-xs text-gray-400 font-medium">deslize →</span>
                </div>
                <div className="featured-scroll pb-2">
                  {featuredProducts.map((product) => (
                    <FeaturedCard
                      key={product.id}
                      product={product}
                      onSelect={() => setSelectedProduct(product)}
                      disabled={!isOpen}
                      color={color}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* MAIS PEDIDOS */}
            {bestSellers.length > 0 && !searchQuery && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-sm">🔥</span>
                    Mais pedidos
                  </h2>
                </div>
                <div className="product-grid">
                  {bestSellers.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={() => setSelectedProduct(product)}
                      disabled={!isOpen}
                      primaryColor={color}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* CATEGORIAS */}
            {filteredCategories.map((category) => (
              <section
                key={category.id}
                id={category.id}
                ref={(el) => { if (el) categoryRefs.current[category.id] = el }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {category.image ? (
                    <img src={category.image} alt={category.name}
                      className="w-8 h-8 rounded-xl object-cover" />
                  ) : (
                    <div className="w-1 h-5 rounded-full flex-shrink-0"
                      style={{ background: color }} />
                  )}
                  <h2 className="text-base font-black text-gray-900 dark:text-white">{category.name}</h2>
                  <span className="text-xs text-gray-400">{category.products.length} itens</span>
                </div>
                <div className="product-grid">
                  {category.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={() => setSelectedProduct(product)}
                      disabled={!isOpen}
                      primaryColor={color}
                    />
                  ))}
                </div>
              </section>
            ))}

            {/* Sem resultados */}
            {searchQuery && filteredCategories.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4 text-2xl">🔍</div>
                <p className="font-semibold text-gray-500">Nenhum produto para "{searchQuery}"</p>
                <button onClick={() => setSearchQuery('')}
                  className="mt-3 text-sm font-semibold" style={{ color }}>
                  Limpar busca
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ─── BOTTOM NAV MOBILE ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden">
        <div className="glass-card border-t border-gray-200/60 dark:border-gray-800">
          <div className="flex items-center justify-around px-2 py-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
            {/* Home */}
            <button
              onClick={handleNavHome}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-colors ${activeNav === 'home' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}
              style={activeNav === 'home' ? { color } : undefined}
            >
              <HomeIcon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Início</span>
            </button>

            {/* Ofertas */}
            <button
              onClick={handleNavOffers}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-colors ${activeNav === 'offers' ? '' : 'text-gray-400'}`}
              style={activeNav === 'offers' ? { color } : undefined}
            >
              <Flame className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Ofertas</span>
            </button>

            {/* Carrinho — botão central destaque */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex flex-col items-center -mt-5"
            >
              <div className="w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white transition-all active:scale-90"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)`, boxShadow: `0 8px 20px ${color}55` }}>
                <ShoppingBag className="w-6 h-6" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full text-[10px] font-black flex items-center justify-center"
                    style={{ color }}>
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold text-gray-500 mt-1">Carrinho</span>
            </button>

            {/* Pedidos */}
            <button
              onClick={handleNavOrders}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-colors ${activeNav === 'orders' ? '' : 'text-gray-400'}`}
              style={activeNav === 'orders' ? { color } : undefined}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[10px] font-semibold">Pedidos</span>
            </button>

            {/* WhatsApp — mobile */}
            {tenant.phone && (
              <a
                href={`https://wa.me/${tenant.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl text-emerald-500 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="text-[10px] font-semibold">WhatsApp</span>
              </a>
            )}

            {/* Toggle tema — mobile */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-colors text-gray-400 hover:text-gray-600"
            >
              {theme === 'dark'
                ? <Sun className="w-5 h-5" />
                : <Moon className="w-5 h-5" />
              }
              <span className="text-[10px] font-semibold">Tema</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── FAB CARRINHO DESKTOP ─── */}
      {cartCount > 0 && (
        <div className="hidden sm:block fixed bottom-6 right-6 z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-3 pl-4 pr-5 py-3.5 text-white rounded-2xl shadow-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95 fade-scale-in"
            style={{
              background: `linear-gradient(135deg, ${color}, ${color}bb)`,
              boxShadow: `0 12px 32px ${color}44`,
            }}
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full text-[9px] font-black flex items-center justify-center"
                style={{ color }}>
                {cartCount}
              </span>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] opacity-80 leading-none">Ver carrinho</span>
              <span className="text-sm font-black leading-tight">{formatCurrency(cartTotal)}</span>
            </div>
          </button>
        </div>
      )}

      {/* ─── MODAL DE PRODUTO ─── */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          disabled={!isOpen}
          primaryColor={color}
        />
      )}

      {/* ─── CART DRAWER ─── */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        tenant={tenant}
        tableInfo={tableInfo}
      />

      {/* ─── MODAL MAIS INFORMAÇÕES ─── */}
      <InfoModal
        tenant={tenant}
        isOpen={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        color={color}
      />

      {/* ─── MODAL LOGIN CLIENTE ─── */}
      <CustomerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        color={color}
        tenantId={tenant.id}
      />
    </div>
  )
}

/* ─── Featured Card ─── */
function FeaturedCard({
  product, onSelect, disabled, color,
}: {
  product: Product; onSelect: () => void; disabled?: boolean; color: string
}) {
  const hasDiscount = product.comparePrice && product.comparePrice > product.price
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / product.comparePrice!) * 100)
    : 0

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="group relative flex flex-col bg-white dark:bg-gray-900 rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 active:scale-[0.97] disabled:opacity-50 product-shine"
      style={{ width: '200px' }}
    >
      <div className="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
        {product.image ? (
          <Image
            src={product.image} alt={product.name} fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">🍽️</div>
        )}
        {hasDiscount && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">
            -{discountPct}%
          </div>
        )}
        {product.isBestSeller && (
          <div className="absolute top-2 right-2 text-xs" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>🔥</div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <p className="font-bold text-xs text-gray-900 dark:text-white line-clamp-2 leading-snug mb-1 flex-1">
          {product.name}
        </p>
        <div className="flex items-center justify-between mt-auto">
          <div>
            <p className="font-black text-sm" style={{ color }}>
              {formatCurrency(product.price)}
            </p>
            {hasDiscount && (
              <p className="text-[10px] text-gray-400 line-through leading-none">
                {formatCurrency(product.comparePrice!)}
              </p>
            )}
          </div>
          {!disabled && (
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0 group-hover:scale-110 transition-transform"
              style={{ background: color }}
            >
              +
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
