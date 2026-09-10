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
import {
  Smartphone, Truck, UtensilsCrossed, Zap, BarChart3, MessageCircle,
  Printer, Sparkles, Check, ArrowRight, Star, ChevronDown, Globe,
  QrCode, CreditCard, Package, TrendingUp, ShieldCheck, Moon, Sun,
} from 'lucide-react'

// CORREÇÃO (#7): a landing page usava a fonte padrão do site (GeistSans,
// definida em app/layout.tsx), enquanto o cardápio digital
// (app/(storefront)/menu/[slug]/layout.tsx) usa Poppins — mesma fonte
// aplicada aqui agora, pra landing page e cardápio ficarem visualmente
// consistentes.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'] })

// CORREÇÃO: ícones de emoji substituídos por ícones lucide-react (visual
// mais profissional e consistente com o resto do produto).
const features = [
  { icon: Smartphone,     title: 'Cardápio Digital', desc: 'PWA instalável com QR Code por mesa. Atualize preços em tempo real, sem reimprimir nada.', color: 'from-brand-500 to-amber-400', bg: 'bg-brand-50 dark:bg-brand-950/20' },
  { icon: Truck,          title: 'Delivery Completo', desc: 'Zonas por bairro, taxa automática e frete grátis acima de valor. Tudo configurável.', color: 'from-blue-500 to-cyan-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
  { icon: UtensilsCrossed,title: 'Sistema de Mesas', desc: 'QR Code exclusivo por mesa. O cliente pede direto pelo celular, sem esperar garçom.', color: 'from-violet-500 to-purple-400', bg: 'bg-violet-50 dark:bg-violet-950/20' },
  { icon: Zap,            title: 'Pagamento PIX', desc: 'QR Code automático com confirmação instantânea via webhook. Zero taxa manual.', color: 'from-emerald-500 to-green-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
  { icon: BarChart3,      title: 'Kanban em Tempo Real', desc: 'Arraste pedidos entre colunas. Atualização instantânea para toda a equipe.', color: 'from-pink-500 to-rose-400', bg: 'bg-pink-50 dark:bg-pink-950/20' },
  { icon: MessageCircle,  title: 'WhatsApp Integrado', desc: 'Notificações automáticas de status do pedido. O cliente sempre sabe onde está o pedido.', color: 'from-green-500 to-emerald-400', bg: 'bg-green-50 dark:bg-green-950/20' },
  { icon: Printer,        title: 'Impressão Automática', desc: 'Envio automático para impressoras térmicas ao confirmar pedido. Sem digitação na cozinha.', color: 'from-slate-500 to-gray-400', bg: 'bg-slate-50 dark:bg-slate-950/20' },
  { icon: Sparkles,       title: 'IA nos Produtos', desc: 'Gere descrições irresistíveis com IA. Mais clique = mais pedido.', color: 'from-fuchsia-500 to-pink-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/20' },
]

// CORREÇÃO: plano Premium removido da oferta — apenas Starter e Pro.
const plans = [
  { name: 'Starter', price: 49, tagline: 'Para quem está começando', highlight: false, features: ['Até 50 produtos', '1 usuário operador', 'Cardápio digital PWA', 'QR Code de mesa', 'Relatórios básicos'], cta: 'Começar grátis' },
  { name: 'Pro', price: 99, tagline: 'O favorito dos restaurantes', highlight: true, features: ['Produtos ilimitados', 'Até 5 usuários (com permissões por função)', 'Delivery completo', 'Cupons e fidelidade', 'WhatsApp integrado', 'Multi-PDV', 'IA para descrições de produtos', 'Suporte prioritário'], cta: 'Assinar Pro' },
]

// CORREÇÃO: pergunta sobre migrar/integrar com outros sistemas removida.
// FoodSaaS → Meu Cardápio nas respostas.
const faqs = [
  { q: 'Preciso de site ou app para usar?', a: 'Não. O Meu Cardápio cria seu cardápio digital como PWA — os clientes acessam por link ou QR Code, sem baixar nada.' },
  { q: 'O período de teste é realmente grátis?', a: 'Sim, 7 dias completos com acesso às funcionalidades do plano escolhido. Precisamos de um cartão para ativar o trial — nenhuma cobrança é feita durante o período gratuito.' },
  { q: 'Funciona em celular e computador?', a: 'Em qualquer dispositivo com navegador — nenhum app para instalar, nem para você, nem para seus clientes.' },
  { q: 'Posso personalizar as cores e logo?', a: 'Sim! Cada restaurante tem sua identidade visual: logo, cor primária e URL no formato /menu/seu-restaurante.' },
  { q: 'Como funciona o pagamento com cartão e dinheiro?', a: 'Além do PIX (confirmado automaticamente pelo Mercado Pago), você aceita cartão de crédito, débito e dinheiro. O atendente confirma o recebimento manualmente no painel quando o cliente paga.' },
  { q: 'Posso criar contas para garçons?', a: 'Sim. Você pode criar contas com permissões reduzidas para garçons — eles acessam apenas o kanban de pedidos para confirmar, cancelar ou marcar pedidos como entregues, sem ver relatórios ou configurações.' },
]

export function HomePageClient() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <div className={`${poppins.className} min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden`}>

      {/* Barra de topo */}
      <div className="bg-gray-900 dark:bg-black text-white text-xs text-center py-2 font-medium">
        🎉 &nbsp;<span className="text-brand-400 font-bold">Cancele quando quiser</span> · Sem contrato de fidelidade
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
            {['#funcionalidades', '#integracoes', '#planos', '#faq'].map((href, i) => (
              <a key={href} href={href} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors">
                {['Funcionalidades', 'Integrações', 'Planos', 'FAQ'][i]}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              Entrar
            </Link>
            {/* Toggle tema */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link href="/register" className="hidden sm:block px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 active:scale-95 transition-all shadow-sm shadow-brand-200 dark:shadow-none">
              Começar grátis
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
            <a href="#funcionalidades" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">Funcionalidades</a>
            <a href="#integracoes" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">Integrações</a>
            <a href="#planos" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">Planos</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2">FAQ</a>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
              <Link href="/login" className="block text-center py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl">Entrar</Link>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl w-full"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              </button>
              <Link href="/register" className="block text-center py-2.5 text-sm font-bold text-white bg-brand-500 rounded-xl">Começar grátis</Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white dark:from-gray-900 dark:via-gray-950 dark:to-gray-950 pt-20 pb-28">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-400/10 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-5 text-center">

          <span className="animate-fade-up inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            ✦ Novo: IA para descrição de produtos
          </span>

          <h1 className="animate-fade-up animate-fade-up-delay-1 mt-6 text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-white leading-[1.1] tracking-tight">
            Seu restaurante{' '}
            <span className="text-gradient">vende mais</span>
            <br className="hidden sm:block" /> no automático
          </h1>

          <p className="animate-fade-up animate-fade-up-delay-2 mt-6 text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Cardápio digital com QR Code, pedidos online, Kanban em tempo real, WhatsApp automático, PIX e muito mais — tudo em uma plataforma só.
          </p>

          <div className="animate-fade-up animate-fade-up-delay-3 mt-10 flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Link href="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-2xl hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-95 transition-all text-sm shadow-lg shadow-gray-300 dark:shadow-black/30">
              Criar conta grátis
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </Link>
            {/* CORREÇÃO: CTA secundário rebaixado para link de texto — antes
                era um botão com borda do mesmo tamanho do CTA principal,
                competindo por atenção. Continua visível e útil (é o link
                mais valioso pra quem quer ver o produto funcionando antes
                de criar conta), só que agora com peso visual claramente
                menor. */}
            <Link href="/menu/pizzaria-do-jose" className="group inline-flex items-center justify-center gap-1.5 px-4 py-3 text-gray-500 dark:text-gray-400 font-semibold hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-sm underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:decoration-brand-400">
              Ver demo ao vivo
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </Link>
          </div>
          <p className="animate-fade-up animate-fade-up-delay-4 mt-4 text-xs text-gray-400">
            Trial com cartão · Sem contrato · Cancele quando quiser
          </p>

          {/* Kanban mock */}
          <div className="animate-fade-up animate-fade-up-delay-4 mt-16 relative mx-auto max-w-3xl">
            <div className="rounded-3xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl shadow-gray-900/10 dark:shadow-black/40 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-lg px-4 py-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
                    meucardapio.app/menu/meu-restaurante
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 p-5">
                {[
                  { col: 'Novos', color: 'bg-blue-500', count: 3, items: ['Pizza Margherita', 'X-Burguer + Batata', 'Açaí 500ml'] },
                  { col: 'Preparando', color: 'bg-amber-500', count: 2, items: ['Lasanha Bolonhesa', 'Combo Família'] },
                  { col: 'Prontos', color: 'bg-emerald-500', count: 4, items: ['Hot-dog Especial', 'Suco Laranja', 'Calzone', '+1'] },
                ].map(({ col, color, count, items }) => (
                  // CORREÇÃO (#3): em telas estreitas, o nome da coluna
                  // ("Preparando") era mais largo que a própria coluna e o
                  // conteúdo vazava por cima da coluna vizinha, fazendo os
                  // contadores parecerem sobrepostos. `min-w-0` permite o
                  // flex encolher de verdade, e `truncate` corta o texto
                  // em vez de estourar a largura da coluna.
                  <div key={col} className="min-w-0 overflow-hidden rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-3">
                    <div className="flex items-center justify-between gap-1 mb-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{col}</span>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full ${color}`}>{count}</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((item, i) => (
                        <div key={i} className="bg-white dark:bg-gray-700 rounded-xl px-2.5 py-2 text-[11px] font-medium text-gray-700 dark:text-gray-300 shadow-sm border border-gray-100 dark:border-gray-600">{item}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* floating notifications */}
            <div className="absolute left-2 sm:-left-4 -top-3 sm:top-1/3 animate-float flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs sm:text-sm">✓</div>
              <div>
                <p className="text-[9px] sm:text-[10px] text-gray-500 leading-none">Pagamento confirmado</p>
                <p className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white">PIX · R$ 54,90</p>
              </div>
            </div>
            <div className="absolute right-2 sm:-right-4 -bottom-3 sm:bottom-1/4 animate-float-delay flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-xs sm:text-sm">💬</div>
              <div>
                <p className="text-[9px] sm:text-[10px] text-gray-500 leading-none">WhatsApp enviado</p>
                <p className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white">Pedido a caminho 🛵</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FUNCIONALIDADES */}
      <section id="funcionalidades" className="py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            ⚡ Funcionalidades
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Tudo que você precisa,{' '}
            <span className="text-gradient">num só lugar</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Do cardápio digital ao kanban de cozinha — uma plataforma conectada de ponta a ponta.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className={`group ${f.bg} rounded-3xl p-5 border border-white/60 dark:border-gray-700/60 cursor-default
                  transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30`}
              >
                <div className={`inline-flex w-11 h-11 rounded-2xl bg-gradient-to-br ${f.color} items-center justify-center mb-4 shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Highlight cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 p-8 text-white border border-gray-700">
            <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/10 rounded-full blur-2xl" />
            <div className="text-3xl mb-4">📱</div>
            <h3 className="text-xl font-black mb-2">QR Code por mesa ou balcão</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Gere um QR único para cada mesa, balcão ou delivery. O cliente escaneia, faz o pedido e paga — sem app, sem cadastro.</p>
            <Link href="/register" className="mt-6 inline-flex items-center gap-2 text-brand-400 text-sm font-semibold group">
              <span>Experimentar grátis</span>
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </Link>
          </div>
          {/* CORREÇÃO (#1): verde/teal muito claro e brilhante — escurecido
              pra um tom mais sóbrio, consistente com o card escuro ao
              lado. */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-800 p-8 text-white">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
            <div className="text-3xl mb-4">💳</div>
            <h3 className="text-xl font-black mb-2">PIX + Cartão na mesma tela</h3>
            <p className="text-white/80 text-sm leading-relaxed">Webhook instantâneo de confirmação, cashback automático no programa de fidelidade e relatório financeiro integrado.</p>
            <div className="mt-6 flex gap-2 flex-wrap">
              {['PIX', 'Crédito', 'Débito', 'Dinheiro'].map(m => (
                <span key={m} className="bg-white/20 backdrop-blur-sm text-xs font-bold px-2.5 py-1 rounded-full">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              🛡 Planos e preços
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              Simples e <span className="text-gradient">transparente</span>
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400">Sem taxas escondidas. Cancele quando quiser.</p>
          </div>
          {/* CORREÇÃO: apenas 2 planos (Premium removido) — grid centralizado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {plans.map((plan) => (
              <div key={plan.name} className={`relative rounded-3xl p-5 flex flex-col transition-all duration-300 ease-out ${plan.highlight ? 'bg-gradient-to-b from-indigo-600 to-violet-700 text-white shadow-2xl shadow-indigo-200 dark:shadow-indigo-950/40 scale-[1.03]' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 dark:hover:shadow-black/30'}`}>
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-white text-indigo-600 text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm tracking-wide uppercase">★ Mais popular</span>
                  </div>
                )}
                <div className="mb-4">
                  <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>{plan.tagline}</p>
                  <h3 className={`text-2xl font-black ${plan.highlight ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className={`text-3xl font-black ${plan.highlight ? 'text-white' : 'text-gray-900 dark:text-white'}`}>R$ {plan.price}</span>
                    <span className={`text-sm ${plan.highlight ? 'text-indigo-100' : 'text-gray-400'}`}>/mês</span>
                  </div>
                </div>
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-xs ${plan.highlight ? 'bg-white/20 text-white' : 'bg-brand-100 dark:bg-brand-950/40 text-brand-500'}`}>✓</div>
                      <span className={`text-sm ${plan.highlight ? 'text-white/90' : 'text-gray-600 dark:text-gray-400'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={`block text-center py-3 rounded-2xl text-sm font-bold active:scale-95 transition-all ${plan.highlight ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-200 dark:shadow-none'}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRAÇÕES */}
      <section id="integracoes" className="py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            🔌 Integrações
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Conectado com quem <span className="text-gradient">você já usa</span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Escolha os parceiros que já fazem parte da sua operação — sem precisar trocar de fornecedor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: 'Pagamentos', icon: CreditCard,
              // CORREÇÃO (#2): antes listava 4 provedores (Mercado Pago,
              // Efí, Asaas, Stripe) como se todos estivessem disponíveis —
              // hoje só a Efí está integrada de fato. Renderizado à parte
              // abaixo, com a logo, em vez de virar um item de lista igual
              // aos outros.
              logo: true,
            },
            {
              title: 'Marketing & Vendas', icon: MessageCircle,
              items: ['WhatsApp automático (confirmação, status do pedido, cobrança)'],
            },
            {
              title: 'Delivery & Marketplace', icon: Truck,
              items: ['iFood', '99Food'],
            },
          ].map(({ title, icon: Icon, items, logo }) => (
            <div key={title} className="rounded-3xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-6">
              <div className="w-10 h-10 rounded-2xl bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-3">{title}</h3>
              {logo ? (
                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3">
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <Image src="/integrations/efi-bank-logo.png" alt="Efí Bank" fill sizes="48px" className="object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Efí Bank</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PIX + cartão parcelado</p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items!.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Check className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* PERGUNTAS FREQUENTES */}
      <section id="faq" className="py-24 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              ❓ Perguntas frequentes
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              Ainda com <span className="text-gradient">dúvidas?</span>
            </h2>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'Preciso instalar algum aplicativo?',
                a: 'Não. O cardápio digital funciona direto no navegador do celular (PWA) — o cliente escaneia o QR Code e já faz o pedido, sem baixar nada. O dashboard também funciona em qualquer navegador, no computador ou celular.',
              },
              {
                q: 'Como funciona o trial de 7 dias?',
                a: 'Você cria a conta, cadastra o cartão (sem cobrança nenhuma nesse momento) e usa a plataforma completa por 7 dias. Se cancelar antes do fim do trial, não é cobrado nada. Sem contrato de fidelidade.',
              },
              {
                q: 'Quais formas de pagamento posso oferecer aos clientes?',
                a: 'No PDV/balcão, o Pix já vem integrado. No cardápio digital, Pix e cartão são integrados via Efí Bank, com confirmação automática. Cartão (na maquineta) e dinheiro na entrega ou presencialmente ficam a critério de cada estabelecimento, fora da plataforma.',
              },
              {
                q: 'Consigo migrar meu cardápio já pronto pra plataforma?',
                a: 'Sim — nosso suporte te ajuda a importar produtos, preços e categorias na hora de começar, sem custo adicional.',
              },
              {
                q: 'Posso cancelar quando quiser?',
                a: 'Sim, sem multa e sem contrato de fidelidade. Você cancela direto pelo painel a qualquer momento.',
              },
            ].map(({ q, a }) => (
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
      <section className="py-24 max-w-5xl mx-auto px-5">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 p-12 sm:p-16 text-center border border-gray-700">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.15)_0%,_transparent_70%)] pointer-events-none" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 bg-brand-500/20 text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full">✦ Comece hoje</span>
            <h2 className="mt-5 text-2xl sm:text-3xl font-black text-white leading-tight">
              Pronto para vender mais<br />
              <span className="text-gradient">no automático?</span>
            </h2>
            <p className="mt-5 text-gray-400 max-w-lg mx-auto">Configure seu cardápio digital em menos de 10 minutos. 7 dias grátis com cartão — sem cobranças no trial.</p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              {/* CORREÇÃO (#5): tamanho (px-6 py-3, text-sm) e cor (fundo
                  claro sólido) agora batem com o botão do topo da página —
                  antes esse aqui era maior (px-8 py-4, text-base) e laranja
                  em vez de escuro/claro sólido. */}
              <Link href="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 font-bold rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-sm shadow-lg shadow-black/20">
                Criar conta grátis
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </Link>
              <Link href="/menu/pizzaria-do-jose" className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-600 text-gray-300 font-bold rounded-2xl hover:border-gray-400 hover:text-white active:scale-95 transition-all text-sm">
                🌐 Ver cardápio demo
              </Link>
            </div>
            {/* CORREÇÃO: removida a afirmação "+12 mil restaurantes já usam" */}
            <p className="mt-5 text-xs text-gray-500">Cancele quando quiser · Suporte em português</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Plataforma completa para restaurantes venderem mais com cardápio digital, delivery e automação.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">Produto</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><a href="#funcionalidades" className="hover:text-brand-500 transition-colors">Funcionalidades</a></li>
                  <li><a href="#integracoes" className="hover:text-brand-500 transition-colors">Integrações</a></li>
                  <li><a href="#planos" className="hover:text-brand-500 transition-colors">Planos</a></li>
                  <li><a href="#faq" className="hover:text-brand-500 transition-colors">FAQ</a></li>
                  <li><Link href="/menu/pizzaria-do-jose" className="hover:text-brand-500 transition-colors">Demo</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">Conta</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><Link href="/register" className="hover:text-brand-500 transition-colors">Cadastro grátis</Link></li>
                  <li><Link href="/login" className="hover:text-brand-500 transition-colors">Entrar</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white mb-3">Legal</p>
                <ul className="space-y-2 text-gray-500 dark:text-gray-400">
                  <li><Link href="/termos" className="hover:text-brand-500 transition-colors">Termos de Uso</Link></li>
                  <li><Link href="/privacidade" className="hover:text-brand-500 transition-colors">Privacidade</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-400">
            <p>© {new Date().getFullYear()} Meu Cardápio. Todos os direitos reservados.</p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Todos os sistemas operacionais</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
