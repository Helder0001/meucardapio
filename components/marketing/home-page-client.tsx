'use client'

// components/marketing/home-page-client.tsx — toda a UI da landing page
// (com interatividade). O metadata (title/description/OG) fica em
// app/page.tsx, que é um Server Component só pra isso — Client Components
// não podem exportar metadata no App Router.
import { useState } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import Image from 'next/image'
import { Poppins } from 'next/font/google'
import { buildDemoMenuHref } from '@/lib/utils/demo-tenant'
import { monthlyPrice, annualTotalPrice, annualMonthlyEquivalent, PLAN_LABEL } from '@/lib/billing/pricing'
import type { LandingDict, LandingLocale } from '@/lib/i18n/landing'
import { LANDING_LOCALES } from '@/lib/i18n/landing'
import { setLandingLocaleAction } from '@/actions/i18n/set-locale'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import {
  Smartphone, Truck, UtensilsCrossed, BarChart3, MessageCircle,
  Printer, Sparkles, ChevronDown, QrCode, ShoppingBag, Columns3,
  Ticket, Heart, Users, Store, CreditCard, ShieldCheck, Moon, Sun,
} from 'lucide-react'

// CORREÇÃO (#7): a landing page usava a fonte padrão do site (GeistSans,
// definida em app/layout.tsx), enquanto o cardápio digital
// (app/(storefront)/menu/[slug]/layout.tsx) usa Poppins — mesma fonte
// aplicada aqui agora, pra landing page e cardápio ficarem visualmente
// consistentes.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'] })

// CORREÇÃO: a landing page vendia "lista de funcionalidades" (isso, isso e
// isso). Esse array agora só monta a grade "Tudo que seu restaurante
// precisa" (13 itens, seção final de funcionalidades) — a demonstração de
// cada funcionalidade principal (Kanban, WhatsApp, Cardápio/QR, Pagamentos,
// IA) ganhou seção própria mais acima na página, focada no problema que
// resolve em vez de só listar o recurso.
// CORREÇÃO (i18n): os títulos/descrições saíram daqui — agora vêm do
// dicionário (t.featuresSection.items), traduzido nos 3 idiomas. Esse
// array guarda só os ícones, na mesma ordem das chaves do dicionário.
const featureIcons = [
  Smartphone, QrCode, ShoppingBag, Columns3, MessageCircle, CreditCard,
  Truck, Ticket, Heart, BarChart3, Sparkles, Users, Printer,
]

// CORREÇÃO: volta a ter 2 planos (Normal e Pro) — preço e regra de
// desconto anual vêm de lib/billing/pricing.ts (fonte única, usada também
// no cadastro e na renovação), não mais um valor solto aqui.
// CORREÇÃO: logos de parceiros/integrações — todas tratadas em cinza
// uniforme com fundo transparente pra faixa de rolagem contínua. Logos que
// antes ficavam sem nome/legenda (Sentry, Upstash, Railway, Neon) agora
// identificadas, e GitHub + Vercel adicionadas à lista.
// CORREÇÃO: partner-3 e partner-4 estavam com nome/legenda trocados —
// partner-3 é o ícone triangular da Neon (banco de dados), partner-4 é o
// ícone de trem/círculo da Railway. E a legenda da Railway passou a
// refletir o uso real na plataforma (hospeda o Evolution API do
// WhatsApp), em vez de um "hospeda o backend" genérico.
// CORREÇÃO: mapeamento revisado a partir do código real (package.json,
// .env.example, imports), não mais por "achismo" de formato do ícone —
// isso já tinha causado erros antes.
// - partner-1 (espiral) é o ícone da Upstash, não da Sentry.
// - partner-2 (raio) é o ícone da Supabase (usada em app/api/upload/route.ts
//   pro Storage de imagens, via SUPABASE_SERVICE_ROLE_KEY) — não da Upstash,
//   e não foi removida à toa como cheguei a fazer: ela é real.
// - partner-3 (triângulo com ondas) é o ícone da Sentry, não da Neon.
// - o arquivo antes rotulado "Novu" é na verdade o ícone da Neon — Novu
//   nunca existiu de verdade no projeto (não tem dependência no
//   package.json nem env var, só estava citado aqui por engano).
// - legenda da Upstash reflete o uso real, visto em lib/cache/redis.ts e
//   lib/security/rate-limit.ts: cache de cardápio, sessões, OTP e rate
//   limit de login — não só "cache e filas" genérico.
const partnerLogos = [
  { name: 'Efí Bank', logo: '/integrations/efi-bank-logo-gray.png', caption: 'PIX e pagamentos' },
  { name: 'Groq', logo: '/integrations/partner-groq.png', caption: 'IA para descrições' },
  { name: 'Resend', logo: '/integrations/partner-resend.png', caption: 'E-mails automáticos' },
  { name: 'OpenCage', logo: '/integrations/partner-opencage.png', caption: 'Localização e endereços' },
  { name: 'Neon', logo: '/integrations/partner-novu.png', caption: 'Banco de dados PostgreSQL' },
  { name: 'Upstash', logo: '/integrations/partner-1.png', caption: 'Cache, sessões e rate limit' },
  { name: 'Supabase', logo: '/integrations/partner-2.png', caption: 'Armazenamento de imagens' },
  { name: 'Sentry', logo: '/integrations/partner-3.png', caption: 'Monitoramento de erros' },
  { name: 'Railway', logo: '/integrations/partner-4.png', caption: 'Hospeda o WhatsApp' },
  { name: 'GitHub', logo: '/integrations/partner-github.png', caption: 'Versionamento de código' },
  { name: 'Vercel', logo: '/integrations/partner-vercel.png', caption: 'Hospeda o frontend' },
]

// Ícones dos papéis de acesso — texto vem de t.team.roles (dicionário),
// na mesma ordem: Gerente, Atendente, Operador, Entregador.
const teamIcons = [ShieldCheck, MessageCircle, Columns3, Truck]

export function HomePageClient({ locale, dict: t }: { locale: LandingLocale; dict: LandingDict }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // CORREÇÃO: toggle Mensal/Anual na seção de preços, pra mostrar os 15%
  // de desconto sem precisar de duas seções separadas.
  const [pricingCycle, setPricingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const { theme, setTheme } = useTheme()

  return (
    <div className={`${poppins.className} min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden`}>

      {/* Barra de topo */}
      <div className="bg-gray-900 dark:bg-black text-white text-xs text-center py-2 font-medium">
        🎉 &nbsp;<span className="text-brand-400 font-bold">{t.topBar.trialBadge}</span> · {t.topBar.rest}
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* CORREÇÃO (#6): a caixa com fundo em degradê laranja atrás da
              logo aparecia como uma "borda laranja" ao redor dela, porque
              a logo enviada tem fundo transparente e não preenche o
              quadrado inteiro. Tirado o fundo colorido — a logo agora
              aparece limpa, sem nada atrás. `object-contain` no lugar de
              `object-cover` evita cortar a imagem também. */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center relative">
              <Image
                src="/logo-icon.png"
                alt="Meu Cardápio"
                fill
                sizes="32px"
                className="object-contain"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement
                  el.style.display = 'none'
                  el.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <span className="hidden text-brand-500 font-black text-sm">M</span>
            </div>
            <span className="font-black text-gray-900 dark:text-white text-base tracking-tight">
              Meu <span className="text-brand-500">Cardápio</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {['#funcionalidades', '#como-funciona', '#planos', '#faq'].map((href, i) => (
              <a key={href} href={href} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors">
                {[t.nav.funcionalidades, t.nav.comoFunciona, t.nav.planos, t.nav.faq][i]}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              {t.nav.entrar}
            </Link>
            {/* Idioma da landing — independente do idioma do dashboard/storefront */}
            <LanguageSwitcher
              locales={LANDING_LOCALES}
              currentLocale={locale}
              onChange={setLandingLocaleAction}
              label={t.languageSwitcher.label}
            />
            {/* Toggle tema */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={t.theme.toggleAria}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link href="/register" className="hidden sm:block px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 active:scale-95 transition-all shadow-sm shadow-brand-200 dark:shadow-none">
              {t.nav.comecarGratis}
            </Link>
            {/* Hamburger mobile */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Menu"
            >
              <span className={`block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-4 space-y-3">
            <a href="#funcionalidades" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">{t.nav.funcionalidades}</a>
            <a href="#como-funciona" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">{t.nav.comoFunciona}</a>
            <a href="#planos" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">{t.nav.planos}</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">{t.nav.faq}</a>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
              <Link href="/login" className="block text-center py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl">{t.nav.entrar}</Link>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl w-full"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? t.theme.light : t.theme.dark}
              </button>
              <Link href="/register" className="block text-center py-2.5 text-sm font-bold text-white bg-brand-500 rounded-xl">{t.nav.comecarGratis}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white dark:from-gray-900 dark:via-gray-950 dark:to-gray-950 pt-14 sm:pt-20 pb-14 sm:pb-28">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-400/10 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-5 text-center">

          <span className="animate-fade-up inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            {t.hero.badge}
          </span>

          <h1 className="animate-fade-up animate-fade-up-delay-1 mt-6 text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-white leading-[1.1] tracking-tight">
            {t.hero.titleStart}{' '}
            <span className="text-gradient">{t.hero.titleHighlight}</span>
          </h1>

          <p className="animate-fade-up animate-fade-up-delay-2 mt-6 text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {t.hero.subtitle}
          </p>

          <div className="animate-fade-up animate-fade-up-delay-3 mt-10 flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Link href="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-2xl hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-95 transition-all text-sm shadow-lg shadow-gray-300 dark:shadow-black/30">
              {t.hero.ctaPrimary}
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </Link>
            {/* CORREÇÃO: CTA secundário rebaixado para link de texto — antes
                era um botão com borda do mesmo tamanho do CTA principal,
                competindo por atenção. Continua visível e útil (é o link
                mais valioso pra quem quer ver o produto funcionando antes
                de criar conta), só que agora com peso visual claramente
                menor. */}
            <Link href={buildDemoMenuHref("pizzaria-do-jose")} className="group inline-flex items-center justify-center gap-1.5 px-4 py-3 text-gray-500 dark:text-gray-400 font-semibold hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-sm underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:decoration-brand-400">
              {t.hero.ctaSecondary}
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </Link>
          </div>
          <p className="animate-fade-up animate-fade-up-delay-4 mt-4 text-xs text-gray-400 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {t.hero.trustBadges.map((b) => <span key={b}>{b}</span>)}
          </p>

          {/* Screenshot real do produto (dashboard + cardápio no celular),
              substituindo o mock desenhado em HTML/CSS que havia aqui antes. */}
          <div className="animate-fade-up animate-fade-up-delay-4 mt-16 relative mx-auto max-w-4xl">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gray-900/10 dark:shadow-black/40">
              <Image
                src="/screenshots/hero-desktop-mobile.jpg"
                alt="Dashboard do Meu Cardápio no notebook e cardápio digital no celular"
                width={1536}
                height={557}
                priority
                sizes="(max-width: 768px) 100vw, 896px"
                className="w-full h-auto"
              />
            </div>
            {/* floating notifications */}
            <div className="absolute left-2 sm:-left-4 -top-3 sm:top-1/3 animate-float flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs sm:text-sm">✓</div>
              <div>
                <p className="text-[9px] sm:text-[10px] text-gray-500 leading-none">{t.hero.floatingPaymentConfirmed}</p>
                <p className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white">PIX · R$ 54,90</p>
              </div>
            </div>
            <div className="absolute right-2 sm:-right-4 -bottom-3 sm:bottom-1/4 animate-float-delay flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-xs sm:text-sm">💬</div>
              <div>
                <p className="text-[9px] sm:text-[10px] text-gray-500 leading-none">{t.hero.floatingWhatsappSent}</p>
                <p className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white">{t.hero.floatingOrderOnWay}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMA → SOLUÇÃO */}
      <section className="py-14 sm:py-24 max-w-5xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.problemSolution.title} <span className="text-gradient">{t.problemSolution.titleHighlight}</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.problemSolution.subtitle}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl bg-red-50/60 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-red-500 mb-4">{t.problemSolution.beforeLabel}</p>
            <ul className="space-y-3">
              {t.problemSolution.beforeItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <span className="text-red-400 font-bold">✗</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 p-6">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-600 mb-4">{t.problemSolution.afterLabel}</p>
            <ul className="space-y-3">
              {t.problemSolution.afterItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500 font-bold">✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-14 sm:py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              {t.howItWorks.badge}
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {t.howItWorks.title} <span className="text-gradient">{t.howItWorks.titleHighlight}</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {t.howItWorks.steps.map(({ n, title, desc }, i) => {
              const Icon = [QrCode, UtensilsCrossed, ShoppingBag, Columns3][i]
              return (
              <div
                key={n}
                className="group rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 cursor-default
                  transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-black text-gray-200 dark:text-gray-700">{n}</span>
                  <div className="inline-flex w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-950/40 items-center justify-center">
                    <Icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  </div>
                </div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-1.5">{title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
              </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* KANBAN EM DESTAQUE */}
      <section className="py-14 sm:py-24 max-w-5xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.kanban.title} <span className="text-gradient">{t.kanban.titleHighlight}</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.kanban.subtitle}
          </p>
        </div>
        <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gray-900/10 dark:shadow-black/40 border border-gray-200/80 dark:border-gray-700">
          <Image
            src="/screenshots/kanban-desktop.jpg"
            alt="Kanban de pedidos do Meu Cardápio, do pedido pendente até a entrega"
            width={1536}
            height={463}
            sizes="(max-width: 768px) 100vw, 1024px"
            className="w-full h-auto"
          />
        </div>
        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">{t.kanban.caption}</p>
      </section>

      {/* WHATSAPP */}
      <section className="py-14 sm:py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-4xl mx-auto px-5 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              <MessageCircle className="w-3.5 h-3.5" /> {t.whatsapp.badge}
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {t.whatsapp.title} <span className="text-gradient">{t.whatsapp.titleHighlight}</span>
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              {t.whatsapp.subtitle}
            </p>
          </div>
          <div className="rounded-3xl bg-[#e5ddd5] dark:bg-gray-800 border border-gray-100 dark:border-gray-800 p-4 shadow-xl shadow-gray-900/5">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center relative overflow-hidden flex-shrink-0">
                <Image
                  src="/logo-icon.png"
                  alt="Meu Cardápio"
                  fill
                  sizes="28px"
                  className="object-contain p-1"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                    el.nextElementSibling?.classList.remove('hidden')
                  }}
                />
                <span className="hidden text-brand-500 font-black text-xs">M</span>
              </div>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Meu Cardápio</span>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[92%] space-y-2">
              <p className="text-sm text-gray-800 dark:text-gray-200">{t.whatsapp.greeting}</p>
              <p className="text-sm text-gray-800 dark:text-gray-200">{locale === 'pt-BR' ? 'Seu pedido ' : locale === 'es' ? 'Tu pedido ' : 'Your order '}<span className="font-bold">#1042</span> {t.whatsapp.confirmed}</p>
              <p className="text-sm text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: t.whatsapp.items }} />
              <p className="text-sm font-bold text-gray-900 dark:text-white">{t.whatsapp.total}</p>
            </div>
            <div className="mt-2 bg-white dark:bg-gray-900 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[92%]">
              <p className="text-sm text-gray-800 dark:text-gray-200">{t.whatsapp.preparing}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CARDÁPIO / QR CODE */}
      <section className="py-14 sm:py-24 max-w-5xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            {t.menuQr.badge}
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.menuQr.title} <span className="text-gradient">{t.menuQr.titleHighlight}</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.menuQr.subtitle}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {t.menuQr.steps.map(({ title, desc }, i) => {
            const Icon = [QrCode, UtensilsCrossed, ShoppingBag, Store][i]
            return (
            <div
              key={title}
              className="group relative bg-gray-50 dark:bg-gray-900/50 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 text-center cursor-default
                transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30"
            >
              <div className="inline-flex w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-950/40 items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">{title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
              {i < 3 && <span className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 text-gray-300 dark:text-gray-700">→</span>}
            </div>
            )
          })}
        </div>
        <p className="mt-8 text-center text-sm font-medium text-gray-600 dark:text-gray-300">{t.menuQr.footer}</p>
      </section>

      {/* PAGAMENTOS */}
      <section className="py-14 sm:py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-2xl mx-auto px-5 text-center">
          <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            <CreditCard className="w-3.5 h-3.5" /> {t.payments.badge}
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.payments.title} <span className="text-gradient">{t.payments.titleHighlight}</span>
          </h2>
          {/* CORREÇÃO: promessa de "PIX + Cartão na mesma tela" com
              webhook/cashback automático removida — ainda estamos
              validando cenários de pagamento em produção, então o texto
              não afirma mais automação que não está 100% garantida.
              CORREÇÃO: screenshot ao lado do texto removida a pedido.
              CORREÇÃO: texto principal deixa claro o que é integrado
              (PIX e cartão online, via Efí Bank) e o que fica a critério
              do estabelecimento (cartão na maquineta e dinheiro), pra não
              criar expectativa de "pagamentos automáticos" sem escopo. */}
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            {t.payments.subtitle}
          </p>
          <div className="mt-6 flex gap-2 flex-wrap justify-center">
            {t.payments.methods.map(m => (
              <span key={m} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold px-3 py-1.5 rounded-full">{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* TECNOLOGIA */}
      {/* CORREÇÃO: seção renomeada de "Integrações" para "Tecnologia" —
          esses logos são serviços que o Meu Cardápio usa internamente na
          arquitetura (pagamentos, IA, e-mail, notificações, geolocalização),
          não integrações que o restaurante escolhe e já usa por conta
          própria. Chamar de "integrações"/"parceiros que você já usa"
          criava uma promessa comercial ambígua. */}
      <section id="integracoes" className="py-14 sm:py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            {t.tech.badge}
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.tech.title} <span className="text-gradient">{t.tech.titleHighlight}</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.tech.subtitle}
          </p>
        </div>

        {/* CORREÇÃO: logo do Grok (xAI) trocada pela logo correta da Groq
            (provedor de IA usado de fato pela plataforma), e a seção deixou
            de ser 2 cards fixos pra virar uma faixa de logos em rolagem
            contínua — todas em cinza uniforme e fundo transparente,
            incluindo a da Efí. CORREÇÃO: cada logo com nome conhecido
            ganhou uma legenda curta abaixo, explicando o benefício em vez
            de deixar o visitante adivinhar o que cada logo faz. */}
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex items-center w-max animate-marquee hover:[animation-play-state:paused]">
            {[...partnerLogos, ...partnerLogos].map(({ name, logo }, i) => {
              const caption = t.tech.captions[name]
              return (
              <div key={`${name}-${i}`} className="flex-shrink-0 w-32 mx-2 flex flex-col items-center justify-center gap-1.5">
                <div className="relative w-24 h-10">
                  <Image src={logo} alt={name} fill sizes="96px" className="object-contain" />
                </div>
                {caption && <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 text-center leading-tight">{caption}</span>}
              </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* IA — CORREÇÃO: seção reduzida (menos padding, título menor) pra
          não competir com o diferencial real do produto — cardápio +
          pedidos + Kanban + WhatsApp + gestão. A IA é um bônus, não o
          motivo principal para contratar. */}
      <section className="py-14 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <span className="inline-flex items-center gap-1.5 bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5" /> {t.ai.badge}
          </span>
          <h2 className="mt-3 text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.ai.title} <span className="text-gradient">{t.ai.titleHighlight}</span>
          </h2>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {t.ai.subtitle}
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-2">{t.ai.beforeLabel}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.ai.beforeExample}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-950/20 dark:to-pink-950/10 border border-fuchsia-100 dark:border-fuchsia-900/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-500 mb-2">{t.ai.afterLabel}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{t.ai.afterExample}</p>
            </div>
          </div>
        </div>
      </section>

      {/* FUNCIONALIDADES COMPLETAS — CORREÇÃO: seção renomeada de "Tudo
          que seu restaurante precisa" para "E muito mais", já que Cardápio,
          Kanban, WhatsApp, Pagamentos e IA já foram mostrados em seções
          próprias antes desta. Cards menores (ícone e padding reduzidos)
          pra não repetir o mesmo destaque visual das seções anteriores. */}
      <section id="funcionalidades" className="py-14 sm:py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            {t.featuresSection.badge}
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.featuresSection.title} <span className="text-gradient">{t.featuresSection.titleHighlight}</span>
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {t.featuresSection.items.map((f, i) => {
            const Icon = featureIcons[i]
            return (
              <div
                key={f.title}
                className="group bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 cursor-default
                  transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30"
              >
                <div className="inline-flex w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-950/40 items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                </div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-1">{f.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* EQUIPE / PERMISSÕES */}
      <section className="py-14 sm:py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              <Users className="w-3.5 h-3.5" /> {t.team.badge}
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {t.team.title} <span className="text-gradient">{t.team.titleHighlight}</span>
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400">{t.team.subtitle}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {t.team.roles.map(({ role, desc }, i) => {
              const Icon = teamIcons[i]
              return (
              <div
                key={role}
                className="group rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 text-center cursor-default
                  transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30"
              >
                <div className="inline-flex w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-950/40 items-center justify-center mx-auto mb-3">
                  <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                </div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">{role}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
              </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* TIPOS DE NEGÓCIO */}
      <section className="py-14 sm:py-24 max-w-5xl mx-auto px-5 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
          {t.businessTypes.title} <span className="text-gradient">{t.businessTypes.titleHighlight}</span>
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {t.businessTypes.items.map(({ emoji, label }) => (
            <span key={label} className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 px-4 py-2 rounded-full">
              <span>{emoji}</span>{label}
            </span>
          ))}
        </div>
        <p className="mt-8 text-gray-500 dark:text-gray-400">{t.businessTypes.footer1}</p>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">{t.businessTypes.footer2}</p>
      </section>

      {/* PLANOS */}
      <section id="planos" className="py-14 sm:py-24 max-w-5xl mx-auto px-5">
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            {t.plans.badge}
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {t.plans.title} <span className="text-gradient">{t.plans.titleHighlight}</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">{t.plans.subtitle}</p>

          {/* Mensal / Anual */}
          <div className="mt-6 inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full p-1">
            <button
              onClick={() => setPricingCycle('MONTHLY')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                pricingCycle === 'MONTHLY' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {t.plans.monthly}
            </button>
            <button
              onClick={() => setPricingCycle('ANNUAL')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                pricingCycle === 'ANNUAL' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {t.plans.annual} <span className="text-emerald-600 dark:text-emerald-400">-15%</span>
            </button>
          </div>
        </div>

        {/* CORREÇÃO: 2 planos de novo (Normal e Pro) — o Pro é só o Normal
            + WhatsApp automático, deixado explícito no card pra não parecer
            um recurso arbitrário a mais. */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto items-start">
          {(['NORMAL', 'PRO'] as const).map((tier) => {
            const isPro = tier === 'PRO'
            const price = pricingCycle === 'ANNUAL' ? annualMonthlyEquivalent(tier) : monthlyPrice(tier)
            return (
              <div
                key={tier}
                className={`rounded-3xl bg-white dark:bg-gray-900 border p-8 ${
                  isPro
                    ? 'border-brand-300 dark:border-brand-700 shadow-xl shadow-brand-900/10 relative'
                    : 'border-gray-200 dark:border-gray-700 shadow-sm'
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                    {t.plans.mostComplete}
                  </span>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">{PLAN_LABEL[tier]}</h3>
                  <div className="flex items-baseline justify-center gap-1 mt-2">
                    <span className="text-4xl font-black text-gray-900 dark:text-white">
                      R$ {price.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-sm text-gray-400">{t.plans.perMonth}</span>
                  </div>
                  {pricingCycle === 'ANNUAL' && (
                    <p className="mt-1 text-xs text-gray-400">
                      R$ {annualTotalPrice(tier).toFixed(2).replace('.', ',')} {t.plans.billedOnce}
                    </p>
                  )}
                  <p className="mt-2 text-xs font-bold text-brand-600 dark:text-brand-400">
                    {isPro ? t.plans.proTagline : t.plans.normalTagline}
                  </p>
                </div>
                <ul className="space-y-2.5 mb-8">
                  {t.plans.normalFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-xs bg-brand-100 dark:bg-brand-950/40 text-brand-500">✓</div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{f}</span>
                    </li>
                  ))}
                  {t.plans.proOnlyFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-xs ${
                        isPro ? 'bg-brand-100 dark:bg-brand-950/40 text-brand-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                      }`}>
                        {isPro ? '✓' : '—'}
                      </div>
                      <span className={`text-sm ${isPro ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all ${
                    isPro
                      ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-200 dark:shadow-none'
                      : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                  }`}
                >
                  {t.plans.ctaButton}
                </Link>
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          {t.plans.trialNote}
        </p>

        {/* CORREÇÃO: bloco de migração do cardápio movido pra perto do
            preço — antes só existia no FAQ, escondido no final da página.
            Isso ataca de frente uma das maiores objeções antes da compra:
            "vou ter que cadastrar tudo de novo?". */}
        <div className="max-w-md mx-auto mt-6 rounded-3xl bg-brand-50 dark:bg-brand-950/20 border border-brand-100 dark:border-brand-900/30 p-6 text-center">
          <h4 className="font-bold text-gray-900 dark:text-white">{t.plans.migrationTitle}</h4>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            {t.plans.migrationDesc}
          </p>
        </div>
      </section>

      {/* PERGUNTAS FREQUENTES */}
      <section id="faq" className="py-14 sm:py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              {t.faq.badge}
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {t.faq.title} <span className="text-gradient">{t.faq.titleHighlight}</span>
            </h2>
          </div>

          <div className="space-y-3">
            {t.faq.items.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none font-semibold text-sm text-gray-900 dark:text-white">
                  {q}
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-14 sm:py-24 max-w-5xl mx-auto px-5">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 p-12 sm:p-16 text-center border border-gray-700">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.15)_0%,_transparent_70%)] pointer-events-none" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 bg-brand-500/20 text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">{t.finalCta.badge}</span>
            <h2 className="mt-5 text-2xl sm:text-3xl font-black text-white leading-tight">
              {t.finalCta.title}<br />
              <span className="text-gradient">{t.finalCta.titleHighlight}</span>
            </h2>
            <p className="mt-5 text-gray-400 max-w-lg mx-auto">{t.finalCta.subtitle}</p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              {/* CORREÇÃO: os dois CTAs agora seguem exatamente o padrão do
                  hero — botão sólido + link de texto sublinhado (sem caixa
                  nem borda) como CTA secundário. */}
              <Link href="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 font-bold rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-sm shadow-lg shadow-black/20">
                {t.finalCta.ctaPrimary}
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </Link>
              <Link href={buildDemoMenuHref("pizzaria-do-jose")} className="group inline-flex items-center justify-center gap-1.5 px-4 py-3 text-gray-400 font-semibold hover:text-white transition-colors text-sm underline decoration-gray-600 underline-offset-4 hover:decoration-gray-400">
                {t.finalCta.ctaSecondary}
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </Link>
            </div>
            {/* CORREÇÃO: removida a afirmação "+12 mil restaurantes já usam" */}
            <p className="mt-5 text-xs text-gray-500">{t.finalCta.footer}</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-12">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center relative">
                  <Image
                    src="/logo-icon.png"
                    alt="Meu Cardápio"
                    fill
                    sizes="32px"
                    className="object-contain"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement
                      el.style.display = 'none'
                      el.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                  <span className="hidden text-brand-500 font-black text-sm">M</span>
                </div>
                <span className="font-black text-gray-900 dark:text-white text-base tracking-tight">Meu <span className="text-brand-500">Cardápio</span></span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t.footer.description}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">{t.footer.productHeading}</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><a href="#funcionalidades" className="hover:text-brand-500 transition-colors">{t.footer.productLinks.funcionalidades}</a></li>
                  <li><a href="#como-funciona" className="hover:text-brand-500 transition-colors">{t.footer.productLinks.comoFunciona}</a></li>
                  <li><a href="#planos" className="hover:text-brand-500 transition-colors">{t.footer.productLinks.planos}</a></li>
                  <li><a href="#faq" className="hover:text-brand-500 transition-colors">{t.footer.productLinks.faq}</a></li>
                  <li><Link href={buildDemoMenuHref("pizzaria-do-jose")} className="hover:text-brand-500 transition-colors">{t.footer.productLinks.demo}</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">{t.footer.accountHeading}</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><Link href="/register" className="hover:text-brand-500 transition-colors">{t.footer.accountLinks.cadastro}</Link></li>
                  <li><Link href="/login" className="hover:text-brand-500 transition-colors">{t.footer.accountLinks.entrar}</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">{t.footer.legalHeading}</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><Link href="/termos" className="hover:text-brand-500 transition-colors">{t.footer.legalLinks.termos}</Link></li>
                  <li><Link href="/privacidade" className="hover:text-brand-500 transition-colors">{t.footer.legalLinks.privacidade}</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-400">
            <p>© {new Date().getFullYear()} Meu Cardápio. {t.footer.copyright}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{t.footer.statusText}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
