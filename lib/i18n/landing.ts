// lib/i18n/landing.ts
//
// Dicionário do escopo LANDING (site de marketing, app/page.tsx +
// components/marketing/home-page-client.tsx) — cookie e contexto
// independentes do dashboard e do storefront. Cobre a página inteira:
// barra de topo, nav, hero, problema/solução, como funciona, Kanban,
// WhatsApp, cardápio/QR, pagamentos, tecnologia, IA, funcionalidades,
// equipe, tipos de negócio, planos, FAQ, CTA final e rodapé.

export type LandingLocale = 'pt-BR' | 'en' | 'es'

export const LANDING_LOCALE_COOKIE = 'mc_landing_locale'
export const LANDING_DEFAULT_LOCALE: LandingLocale = 'pt-BR'

export const LANDING_LOCALES: { code: LandingLocale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

interface FeatureItem { title: string; desc: string }
interface StepItem { n?: string; title: string; desc: string }
interface RoleItem { role: string; desc: string }
interface BizTypeItem { emoji: string; label: string }
interface FaqItem { q: string; a: string }

export interface LandingDict {
  topBar: { trialBadge: string; rest: string }
  nav: {
    funcionalidades: string; comoFunciona: string; planos: string; faq: string
    entrar: string; comecarGratis: string
  }
  theme: { light: string; dark: string; toggleAria: string }
  hero: {
    badge: string; titleStart: string; titleHighlight: string; subtitle: string
    ctaPrimary: string; ctaSecondary: string; trustBadges: string[]
    floatingPaymentConfirmed: string; floatingWhatsappSent: string; floatingOrderOnWay: string
  }
  languageSwitcher: { label: string }
  problemSolution: {
    title: string; titleHighlight: string; subtitle: string
    beforeLabel: string; beforeItems: string[]
    afterLabel: string; afterItems: string[]
  }
  howItWorks: { badge: string; title: string; titleHighlight: string; steps: StepItem[] }
  kanban: { title: string; titleHighlight: string; subtitle: string; caption: string }
  whatsapp: {
    badge: string; title: string; titleHighlight: string; subtitle: string
    greeting: string; confirmed: string; items: string; total: string; preparing: string
  }
  menuQr: {
    badge: string; title: string; titleHighlight: string; subtitle: string
    steps: FeatureItem[]; footer: string
  }
  payments: { badge: string; title: string; titleHighlight: string; subtitle: string; methods: string[] }
  tech: { badge: string; title: string; titleHighlight: string; subtitle: string; captions: Record<string, string> }
  ai: {
    badge: string; title: string; titleHighlight: string; subtitle: string
    beforeLabel: string; beforeExample: string; afterLabel: string; afterExample: string
  }
  featuresSection: { badge: string; title: string; titleHighlight: string; items: FeatureItem[] }
  team: { badge: string; title: string; titleHighlight: string; subtitle: string; roles: RoleItem[] }
  businessTypes: { title: string; titleHighlight: string; items: BizTypeItem[]; footer1: string; footer2: string }
  plans: {
    badge: string; title: string; titleHighlight: string; subtitle: string
    monthly: string; annual: string; mostComplete: string; perMonth: string; billedOnce: string
    normalTagline: string; proTagline: string; ctaButton: string; trialNote: string
    migrationTitle: string; migrationDesc: string
    normalFeatures: string[]; proOnlyFeatures: string[]
  }
  faq: { badge: string; title: string; titleHighlight: string; items: FaqItem[] }
  finalCta: { badge: string; title: string; titleHighlight: string; subtitle: string; ctaPrimary: string; ctaSecondary: string; footer: string }
  footer: {
    description: string
    productHeading: string; productLinks: { funcionalidades: string; comoFunciona: string; planos: string; faq: string; demo: string }
    accountHeading: string; accountLinks: { cadastro: string; entrar: string }
    legalHeading: string; legalLinks: { termos: string; privacidade: string }
    copyright: string; statusText: string
  }
}

const pt: LandingDict = {
  topBar: { trialBadge: '7 dias grátis', rest: 'Sem fidelidade · Cancele quando quiser' },
  nav: { funcionalidades: 'Funcionalidades', comoFunciona: 'Como funciona', planos: 'Planos', faq: 'FAQ', entrar: 'Entrar', comecarGratis: 'Começar grátis' },
  theme: { light: 'Modo claro', dark: 'Modo escuro', toggleAria: 'Alternar tema' },
  hero: {
    badge: '✦ Novo: IA para descrição de produtos',
    titleStart: 'Seu restaurante no controle.',
    titleHighlight: 'Seus pedidos organizados.',
    subtitle: 'Cardápio digital + pedidos + Kanban + WhatsApp + pagamentos em uma única plataforma. Seu cliente pede pelo celular e sua equipe acompanha tudo, do pedido até a entrega.',
    ctaPrimary: 'Começar grátis',
    ctaSecondary: 'Ver demonstração',
    trustBadges: ['✓ 7 dias grátis', '✓ Sem fidelidade', '✓ Cancele quando quiser'],
    floatingPaymentConfirmed: 'Pagamento confirmado',
    floatingWhatsappSent: 'WhatsApp enviado',
    floatingOrderOnWay: 'Pedido a caminho 🛵',
  },
  languageSwitcher: { label: 'Idioma' },
  problemSolution: {
    title: 'Chega de pedidos',
    titleHighlight: 'espalhados',
    subtitle: 'Quando o movimento aumenta, fica fácil perder pedido, esquecer uma observação ou deixar o cliente esperando. O Meu Cardápio coloca sua operação em um só lugar.',
    beforeLabel: 'Antes',
    beforeItems: [
      'Pedidos espalhados no WhatsApp',
      'Cliente perguntando pelo status',
      'Cozinha sem saber o que preparar',
      'Cardápio desatualizado',
      'Controle manual da operação',
    ],
    afterLabel: 'Com o Meu Cardápio',
    afterItems: [
      'Pedidos organizados',
      'Status do pedido em tempo real',
      'Kanban para toda a equipe',
      'Cardápio atualizado instantaneamente',
      'Operação centralizada',
    ],
  },
  howItWorks: {
    badge: '🧭 Como funciona',
    title: 'Do cliente ao pedido em',
    titleHighlight: '4 passos',
    steps: [
      { n: '01', title: 'Seu cliente acessa', desc: 'Pelo QR Code, Instagram, WhatsApp ou link do seu restaurante.' },
      { n: '02', title: 'Escolhe o que quer', desc: 'Visualiza produtos, adicionais, observações e opções de entrega ou retirada.' },
      { n: '03', title: 'Faz o pedido', desc: 'O pedido chega organizado diretamente para sua equipe.' },
      { n: '04', title: 'Sua equipe acompanha', desc: 'Gerencie cada pedido do início ao fim: Novo → Confirmado → Preparando → Pronto → Entregue.' },
    ],
  },
  kanban: {
    title: 'Do pedido à entrega,',
    titleHighlight: 'todo mundo sabe o que fazer',
    subtitle: 'Seu atendimento, cozinha e operação acompanham o mesmo pedido em tempo real.',
    caption: 'Menos confusão no horário de pico. Mais controle para sua equipe.',
  },
  whatsapp: {
    badge: 'WhatsApp',
    title: 'Seu cliente não precisa ficar',
    titleHighlight: 'perguntando pelo pedido',
    subtitle: 'Com as atualizações de status, você pode manter o cliente informado durante o processo. Mais transparência para o cliente, menos interrupções para sua equipe.',
    greeting: 'Olá, João! 👋',
    confirmed: 'foi confirmado.',
    items: '🍔 2x X-Burguer<br />🍟 1x Batata',
    total: '💰 Total: R$ 54,90',
    preparing: '👨‍🍳 Seu pedido está sendo preparado!',
  },
  menuQr: {
    badge: '📱 Cardápio digital',
    title: 'Seu cardápio está',
    titleHighlight: 'sempre atualizado',
    subtitle: 'Altere produtos, preços, fotos, descrições e disponibilidade sem precisar reimprimir o cardápio. Sem aplicativo para o cliente baixar.',
    steps: [
      { title: 'QR Code', desc: 'O cliente escaneia.' },
      { title: 'Cardápio', desc: 'Escolhe os produtos.' },
      { title: 'Pedido', desc: 'Confirma a compra.' },
      { title: 'Restaurante', desc: 'Recebe e organiza.' },
    ],
    footer: 'Atualize uma vez. Seus clientes veem a mudança imediatamente.',
  },
  payments: {
    badge: 'Pagamentos',
    title: 'Ofereça as formas de pagamento',
    titleHighlight: 'que fazem sentido para sua operação',
    subtitle: 'PIX e cartão online integrados. Dinheiro e cartão na maquineta também podem fazer parte da operação.',
    methods: ['PIX', 'Cartão', 'Dinheiro'],
  },
  tech: {
    badge: '⚙️ Tecnologia',
    title: 'Tecnologia que faz',
    titleHighlight: 'tudo funcionar',
    subtitle: 'O Meu Cardápio utiliza tecnologias confiáveis para manter sua operação rápida, segura e conectada.',
    captions: {
      'Efí Bank': 'PIX e pagamentos',
      'Groq': 'IA para descrições',
      'Resend': 'E-mails automáticos',
      'OpenCage': 'Localização e endereços',
      'Neon': 'Banco de dados PostgreSQL',
      'Upstash': 'Cache, sessões e rate limit',
      'Supabase': 'Armazenamento de imagens',
      'Sentry': 'Monitoramento de erros',
      'Railway': 'Hospeda o WhatsApp',
      'GitHub': 'Versionamento de código',
      'Vercel': 'Hospeda o frontend',
    },
  },
  ai: {
    badge: 'Bônus: IA',
    title: 'Deixe seus produtos mais',
    titleHighlight: 'atrativos com IA',
    subtitle: 'Não sabe como descrever aquele produto novo? A IA ajuda você a criar descrições mais interessantes em poucos segundos.',
    beforeLabel: 'Antes',
    beforeExample: 'Hambúrguer com carne, queijo e molho.',
    afterLabel: 'Depois',
    afterExample: 'Hambúrguer artesanal preparado com carne suculenta, queijo cremoso e molho especial da casa.',
  },
  featuresSection: {
    badge: '⚡ E muito mais',
    title: 'Tudo que seu',
    titleHighlight: 'restaurante precisa',
    items: [
      { title: 'Cardápio digital', desc: 'Seu cardápio online, responsivo e personalizado.' },
      { title: 'QR Code', desc: 'Um QR Code para cada mesa, balcão ou divulgação.' },
      { title: 'Pedidos online', desc: 'Receba e acompanhe os pedidos em tempo real.' },
      { title: 'Kanban', desc: 'Organize cada pedido por etapa, do novo ao entregue.' },
      { title: 'WhatsApp', desc: 'Mantenha o cliente informado sobre o pedido.' },
      { title: 'Pagamentos', desc: 'Organize as formas de pagamento da sua operação.' },
      { title: 'Delivery', desc: 'Configure sua operação de entrega e retirada.' },
      { title: 'Cupons', desc: 'Crie promoções e incentive novos pedidos.' },
      { title: 'Fidelidade', desc: 'Crie motivos para seus clientes voltarem.' },
      { title: 'Relatórios', desc: 'Acompanhe as informações da sua operação.' },
      { title: 'IA', desc: 'Crie descrições melhores para seus produtos.' },
      { title: 'Equipe', desc: 'Defina permissões para cada funcionário.' },
      { title: 'Impressão', desc: 'Recursos para integrar a impressão à operação.' },
    ],
  },
  team: {
    badge: 'Equipe',
    title: 'Um sistema para',
    titleHighlight: 'toda a sua equipe',
    subtitle: 'Cada pessoa com acesso ao que realmente precisa.',
    roles: [
      { role: 'Gerente', desc: 'Tem visão completa da operação.' },
      { role: 'Atendente', desc: 'Foca no atendimento e nos pedidos.' },
      { role: 'Operador', desc: 'Ajuda no controle dos pedidos e pagamentos.' },
      { role: 'Entregador', desc: 'Acessa apenas os pedidos destinados à entrega.' },
    ],
  },
  businessTypes: {
    title: 'Feito para diferentes',
    titleHighlight: 'tipos de negócio',
    items: [
      { emoji: '🍕', label: 'Pizzarias' }, { emoji: '🍔', label: 'Hamburguerias' },
      { emoji: '🥤', label: 'Açaíterias' }, { emoji: '🍱', label: 'Restaurantes' },
      { emoji: '🌮', label: 'Lanchonetes' }, { emoji: '🍰', label: 'Docerias' },
      { emoji: '🍗', label: 'Espetarias' }, { emoji: '☕', label: 'Cafeterias' },
      { emoji: '🥡', label: 'Delivery' },
    ],
    footer1: 'Se você vende comida, o Meu Cardápio pode ajudar a organizar sua operação.',
    footer2: 'Feito para pequenos e médios restaurantes que querem vender mais e organizar a operação.',
  },
  plans: {
    badge: '🛡 Planos simples, sem pegadinha',
    title: 'Simples e',
    titleHighlight: 'transparente',
    subtitle: 'Sem taxas escondidas. Sem fidelidade. Cancele quando quiser.',
    monthly: 'Mensal',
    annual: 'Anual',
    mostComplete: 'Mais completo',
    perMonth: '/mês',
    billedOnce: 'cobrado uma vez por ano',
    normalTagline: 'Tudo, exceto WhatsApp automático',
    proTagline: 'Tudo do Normal + WhatsApp automático',
    ctaButton: 'Começar 7 dias grátis',
    trialNote: 'O teste grátis de 7 dias é sempre no plano Normal — mude pro Pro quando quiser.',
    migrationTitle: 'Já tem cardápio?',
    migrationDesc: 'Nós ajudamos você a migrar seus produtos para o Meu Cardápio. Sem precisar começar do zero.',
    normalFeatures: [
      'Cardápio digital', 'QR Code', 'Pedidos online', 'Kanban',
      'Delivery', 'PIX', 'Cupons', 'Fidelidade', 'Relatórios',
      'IA para produtos', 'Gestão de equipe',
    ],
    proOnlyFeatures: ['WhatsApp automático (confirmação, status, cobrança)'],
  },
  faq: {
    badge: '❓ Perguntas frequentes',
    title: 'Ainda com',
    titleHighlight: 'dúvidas?',
    items: [
      { q: 'Preciso instalar algum aplicativo?', a: 'Não. O cardápio digital funciona direto no navegador do celular (PWA) — o cliente escaneia o QR Code e já faz o pedido, sem baixar nada. O dashboard também funciona em qualquer navegador, no computador ou celular.' },
      { q: 'O cliente precisa criar uma conta?', a: 'Não. O objetivo é tornar o pedido rápido e simples, sem cadastro nem senha.' },
      { q: 'Como funciona o trial de 7 dias?', a: 'Você cria a conta, cadastra o cartão (sem cobrança nenhuma nesse momento) e usa o plano Normal por 7 dias. Se cancelar antes do fim do trial, não é cobrado nada. Sem contrato de fidelidade. Quer o plano Pro (com WhatsApp automático)? É só falar com o suporte.' },
      { q: 'Posso usar QR Code nas mesas?', a: 'Sim. Você pode gerar um QR Code exclusivo para cada mesa, balcão ou divulgação.' },
      { q: 'Funciona no celular e computador?', a: 'Sim, em qualquer dispositivo com navegador — nenhum app para instalar, nem para você, nem para seus clientes.' },
      { q: 'Posso cadastrar funcionários com permissões diferentes?', a: 'Sim. Você pode criar contas para garçom, atendente ou entregador com permissões reduzidas — cada um acessa só o que precisa pra sua função, sem ver relatórios ou configurações se não for o caso.' },
      { q: 'Posso trabalhar com delivery e retirada?', a: 'Sim. A plataforma foi pensada pra diferentes formas de operação.' },
      { q: 'Quais formas de pagamento posso oferecer aos clientes?', a: 'No PDV/balcão, o Pix já vem integrado. No cardápio digital, Pix e cartão são integrados via Efí Bank, com confirmação automática. Cartão (na maquineta) e dinheiro na entrega ou presencialmente ficam a critério de cada estabelecimento, fora da plataforma.' },
      { q: 'Preciso ter uma impressora?', a: 'Não. A impressão é um recurso opcional para sua operação.' },
      { q: 'Posso cancelar quando quiser?', a: 'Sim, sem multa e sem contrato de fidelidade. Você cancela direto pelo painel a qualquer momento.' },
      { q: 'Consigo migrar meu cardápio já pronto pra plataforma?', a: 'Sim — nosso suporte te ajuda a importar produtos, preços e categorias na hora de começar, sem custo adicional.' },
    ],
  },
  finalCta: {
    badge: '✦ Comece hoje',
    title: 'Seu restaurante merece uma',
    titleHighlight: 'operação mais simples',
    subtitle: 'Coloque seu cardápio online, organize seus pedidos e tenha mais controle da sua operação. Comece agora.',
    ctaPrimary: 'Começar meu teste grátis',
    ctaSecondary: 'Ver cardápio demo',
    footer: 'Sem fidelidade · Cancele quando quiser · Suporte em português',
  },
  footer: {
    description: 'Plataforma completa para restaurantes venderem mais com cardápio digital, delivery e automação.',
    productHeading: 'Produto',
    productLinks: { funcionalidades: 'Funcionalidades', comoFunciona: 'Como funciona', planos: 'Planos', faq: 'FAQ', demo: 'Demonstração' },
    accountHeading: 'Conta',
    accountLinks: { cadastro: 'Cadastro grátis', entrar: 'Entrar' },
    legalHeading: 'Legal',
    legalLinks: { termos: 'Termos de Uso', privacidade: 'Privacidade' },
    copyright: 'Todos os direitos reservados.',
    statusText: 'Todos os sistemas operacionais',
  },
}

const en: LandingDict = {
  topBar: { trialBadge: '7-day free trial', rest: 'No contract · Cancel anytime' },
  nav: { funcionalidades: 'Features', comoFunciona: 'How it works', planos: 'Pricing', faq: 'FAQ', entrar: 'Log in', comecarGratis: 'Start free' },
  theme: { light: 'Light mode', dark: 'Dark mode', toggleAria: 'Toggle theme' },
  hero: {
    badge: '✦ New: AI for product descriptions',
    titleStart: 'Your restaurant in control.',
    titleHighlight: 'Your orders organized.',
    subtitle: 'Digital menu + orders + Kanban + WhatsApp + payments in a single platform. Your customer orders from their phone and your team tracks everything, from order to delivery.',
    ctaPrimary: 'Start free',
    ctaSecondary: 'See a demo',
    trustBadges: ['✓ 7-day free trial', '✓ No contract', '✓ Cancel anytime'],
    floatingPaymentConfirmed: 'Payment confirmed',
    floatingWhatsappSent: 'WhatsApp sent',
    floatingOrderOnWay: 'Order on the way 🛵',
  },
  languageSwitcher: { label: 'Language' },
  problemSolution: {
    title: 'No more',
    titleHighlight: 'scattered orders',
    subtitle: "When things get busy, it's easy to lose an order, miss a note, or keep a customer waiting. Meu Cardápio puts your whole operation in one place.",
    beforeLabel: 'Before',
    beforeItems: [
      'Orders scattered across WhatsApp',
      'Customers asking about status',
      "Kitchen doesn't know what to prepare",
      'Outdated menu',
      'Manual control of the operation',
    ],
    afterLabel: 'With Meu Cardápio',
    afterItems: [
      'Organized orders',
      'Real-time order status',
      'Kanban for the whole team',
      'Menu updated instantly',
      'Centralized operation',
    ],
  },
  howItWorks: {
    badge: '🧭 How it works',
    title: 'From customer to order in',
    titleHighlight: '4 steps',
    steps: [
      { n: '01', title: 'Your customer accesses it', desc: 'Via QR Code, Instagram, WhatsApp, or your restaurant link.' },
      { n: '02', title: 'Picks what they want', desc: 'Browses products, add-ons, notes, and delivery or pickup options.' },
      { n: '03', title: 'Places the order', desc: 'The order arrives organized directly to your team.' },
      { n: '04', title: 'Your team tracks it', desc: 'Manage every order from start to finish: New → Confirmed → Preparing → Ready → Delivered.' },
    ],
  },
  kanban: {
    title: 'From order to delivery,',
    titleHighlight: 'everyone knows what to do',
    subtitle: 'Your front desk, kitchen, and operations follow the same order in real time.',
    caption: 'Less confusion during rush hour. More control for your team.',
  },
  whatsapp: {
    badge: 'WhatsApp',
    title: "Your customer doesn't need to keep",
    titleHighlight: 'asking about their order',
    subtitle: 'With status updates, you can keep the customer informed throughout the process. More transparency for the customer, fewer interruptions for your team.',
    greeting: 'Hi, John! 👋',
    confirmed: 'has been confirmed.',
    items: '🍔 2x Cheeseburger<br />🍟 1x Fries',
    total: '💰 Total: $12.90',
    preparing: '👨‍🍳 Your order is being prepared!',
  },
  menuQr: {
    badge: '📱 Digital menu',
    title: 'Your menu is',
    titleHighlight: 'always up to date',
    subtitle: "Update products, prices, photos, descriptions, and availability without reprinting the menu. No app for customers to download.",
    steps: [
      { title: 'QR Code', desc: 'The customer scans it.' },
      { title: 'Menu', desc: 'They pick the products.' },
      { title: 'Order', desc: 'They confirm the purchase.' },
      { title: 'Restaurant', desc: 'Receives and organizes it.' },
    ],
    footer: 'Update once. Your customers see the change instantly.',
  },
  payments: {
    badge: 'Payments',
    title: 'Offer the payment methods',
    titleHighlight: 'that make sense for your operation',
    subtitle: 'PIX and online card payments built in. Cash and card machines can also be part of your operation.',
    methods: ['PIX', 'Card', 'Cash'],
  },
  tech: {
    badge: '⚙️ Technology',
    title: 'Technology that makes',
    titleHighlight: 'everything work',
    subtitle: 'Meu Cardápio relies on trusted technologies to keep your operation fast, secure, and connected.',
    captions: {
      'Efí Bank': 'PIX and payments',
      'Groq': 'AI for descriptions',
      'Resend': 'Automated emails',
      'OpenCage': 'Location and addresses',
      'Neon': 'PostgreSQL database',
      'Upstash': 'Cache, sessions and rate limiting',
      'Supabase': 'Image storage',
      'Sentry': 'Error monitoring',
      'Railway': 'Hosts WhatsApp',
      'GitHub': 'Code versioning',
      'Vercel': 'Hosts the frontend',
    },
  },
  ai: {
    badge: 'Bonus: AI',
    title: 'Make your products more',
    titleHighlight: 'appealing with AI',
    subtitle: "Don't know how to describe that new product? AI helps you write more compelling descriptions in seconds.",
    beforeLabel: 'Before',
    beforeExample: 'Burger with meat, cheese and sauce.',
    afterLabel: 'After',
    afterExample: 'Artisan burger made with juicy meat, creamy cheese and our house special sauce.',
  },
  featuresSection: {
    badge: '⚡ And much more',
    title: 'Everything your',
    titleHighlight: 'restaurant needs',
    items: [
      { title: 'Digital menu', desc: 'Your menu online, responsive and personalized.' },
      { title: 'QR Code', desc: 'One QR Code for each table, counter, or promo.' },
      { title: 'Online orders', desc: 'Receive and track orders in real time.' },
      { title: 'Kanban', desc: 'Organize each order by stage, from new to delivered.' },
      { title: 'WhatsApp', desc: 'Keep customers informed about their order.' },
      { title: 'Payments', desc: "Organize your operation's payment methods." },
      { title: 'Delivery', desc: 'Set up your delivery and pickup operation.' },
      { title: 'Coupons', desc: 'Create promotions and encourage new orders.' },
      { title: 'Loyalty', desc: 'Give your customers reasons to come back.' },
      { title: 'Reports', desc: "Track your operation's data." },
      { title: 'AI', desc: 'Create better descriptions for your products.' },
      { title: 'Team', desc: 'Set permissions for each team member.' },
      { title: 'Printing', desc: 'Tools to integrate printing into your operation.' },
    ],
  },
  team: {
    badge: 'Team',
    title: 'One system for',
    titleHighlight: 'your entire team',
    subtitle: 'Each person has access to exactly what they need.',
    roles: [
      { role: 'Manager', desc: 'Has full visibility of the operation.' },
      { role: 'Front desk', desc: 'Focuses on service and orders.' },
      { role: 'Operator', desc: 'Helps control orders and payments.' },
      { role: 'Delivery', desc: 'Only accesses orders assigned for delivery.' },
    ],
  },
  businessTypes: {
    title: 'Built for different',
    titleHighlight: 'types of businesses',
    items: [
      { emoji: '🍕', label: 'Pizzerias' }, { emoji: '🍔', label: 'Burger joints' },
      { emoji: '🥤', label: 'Juice & açaí bars' }, { emoji: '🍱', label: 'Restaurants' },
      { emoji: '🌮', label: 'Snack bars' }, { emoji: '🍰', label: 'Bakeries' },
      { emoji: '🍗', label: 'Skewer houses' }, { emoji: '☕', label: 'Coffee shops' },
      { emoji: '🥡', label: 'Delivery' },
    ],
    footer1: 'If you sell food, Meu Cardápio can help organize your operation.',
    footer2: 'Built for small and medium restaurants that want to sell more and stay organized.',
  },
  plans: {
    badge: '🛡 Simple plans, no catch',
    title: 'Simple and',
    titleHighlight: 'transparent',
    subtitle: 'No hidden fees. No contract. Cancel anytime.',
    monthly: 'Monthly',
    annual: 'Annual',
    mostComplete: 'Most complete',
    perMonth: '/mo',
    billedOnce: 'billed once a year',
    normalTagline: 'Everything except automatic WhatsApp',
    proTagline: 'Everything in Normal + automatic WhatsApp',
    ctaButton: 'Start 7-day free trial',
    trialNote: 'The 7-day free trial is always on the Normal plan — switch to Pro whenever you want.',
    migrationTitle: 'Already have a menu?',
    migrationDesc: 'We help you migrate your products to Meu Cardápio. No need to start from scratch.',
    normalFeatures: [
      'Digital menu', 'QR Code', 'Online orders', 'Kanban',
      'Delivery', 'PIX', 'Coupons', 'Loyalty', 'Reports',
      'AI for products', 'Team management',
    ],
    proOnlyFeatures: ['Automatic WhatsApp (confirmation, status, billing)'],
  },
  faq: {
    badge: '❓ Frequently asked questions',
    title: 'Still have',
    titleHighlight: 'questions?',
    items: [
      { q: 'Do I need to install an app?', a: "No. The digital menu works directly in the phone's browser (PWA) — the customer scans the QR Code and orders right away, nothing to download. The dashboard also works in any browser, on computer or phone." },
      { q: 'Does the customer need to create an account?', a: 'No. The goal is to make ordering fast and simple, with no sign-up or password.' },
      { q: 'How does the 7-day trial work?', a: 'You create your account, register a card (no charge at this point), and use the Normal plan for 7 days. If you cancel before the trial ends, nothing is charged. No lock-in contract. Want the Pro plan (with automatic WhatsApp)? Just contact support.' },
      { q: 'Can I use QR Codes on tables?', a: 'Yes. You can generate a unique QR Code for each table, counter, or promotion.' },
      { q: 'Does it work on phone and computer?', a: 'Yes, on any device with a browser — no app to install, for you or your customers.' },
      { q: 'Can I add staff with different permissions?', a: 'Yes. You can create accounts for waiters, front desk staff, or delivery drivers with limited permissions — each one only accesses what they need for their role, without seeing reports or settings unless they should.' },
      { q: 'Can I offer delivery and pickup?', a: 'Yes. The platform was built to support different types of operations.' },
      { q: 'What payment methods can I offer customers?', a: 'At the counter/POS, PIX comes built in. On the digital menu, PIX and card are integrated via Efí Bank, with automatic confirmation. Card machines and cash on delivery or in person are up to each business, outside the platform.' },
      { q: 'Do I need a printer?', a: 'No. Printing is an optional feature for your operation.' },
      { q: 'Can I cancel whenever I want?', a: 'Yes, no fees and no lock-in contract. You can cancel directly from the dashboard at any time.' },
      { q: 'Can I migrate my existing menu to the platform?', a: 'Yes — our support team helps you import products, prices, and categories when you get started, at no extra cost.' },
    ],
  },
  finalCta: {
    badge: '✦ Start today',
    title: 'Your restaurant deserves a',
    titleHighlight: 'simpler operation',
    subtitle: 'Put your menu online, organize your orders, and get more control over your operation. Start now.',
    ctaPrimary: 'Start my free trial',
    ctaSecondary: 'See a demo menu',
    footer: 'No contract · Cancel anytime · Support in Portuguese',
  },
  footer: {
    description: 'A complete platform for restaurants to sell more with a digital menu, delivery, and automation.',
    productHeading: 'Product',
    productLinks: { funcionalidades: 'Features', comoFunciona: 'How it works', planos: 'Pricing', faq: 'FAQ', demo: 'Demo' },
    accountHeading: 'Account',
    accountLinks: { cadastro: 'Free sign-up', entrar: 'Log in' },
    legalHeading: 'Legal',
    legalLinks: { termos: 'Terms of Use', privacidade: 'Privacy' },
    copyright: 'All rights reserved.',
    statusText: 'All systems operational',
  },
}

const es: LandingDict = {
  topBar: { trialBadge: '7 días gratis', rest: 'Sin fidelidad · Cancela cuando quieras' },
  nav: { funcionalidades: 'Funciones', comoFunciona: 'Cómo funciona', planos: 'Planes', faq: 'FAQ', entrar: 'Iniciar sesión', comecarGratis: 'Empezar gratis' },
  theme: { light: 'Modo claro', dark: 'Modo oscuro', toggleAria: 'Cambiar tema' },
  hero: {
    badge: '✦ Nuevo: IA para descripción de productos',
    titleStart: 'Tu restaurante bajo control.',
    titleHighlight: 'Tus pedidos organizados.',
    subtitle: 'Menú digital + pedidos + Kanban + WhatsApp + pagos en una sola plataforma. Tu cliente pide desde el celular y tu equipo acompaña todo, del pedido a la entrega.',
    ctaPrimary: 'Empezar gratis',
    ctaSecondary: 'Ver demostración',
    trustBadges: ['✓ 7 días gratis', '✓ Sin fidelidad', '✓ Cancela cuando quieras'],
    floatingPaymentConfirmed: 'Pago confirmado',
    floatingWhatsappSent: 'WhatsApp enviado',
    floatingOrderOnWay: 'Pedido en camino 🛵',
  },
  languageSwitcher: { label: 'Idioma' },
  problemSolution: {
    title: 'Basta de pedidos',
    titleHighlight: 'dispersos',
    subtitle: 'Cuando aumenta el movimiento, es fácil perder un pedido, olvidar una observación o hacer esperar al cliente. Meu Cardápio pone tu operación en un solo lugar.',
    beforeLabel: 'Antes',
    beforeItems: [
      'Pedidos dispersos en WhatsApp',
      'Cliente preguntando por el estado',
      'Cocina sin saber qué preparar',
      'Menú desactualizado',
      'Control manual de la operación',
    ],
    afterLabel: 'Con Meu Cardápio',
    afterItems: [
      'Pedidos organizados',
      'Estado del pedido en tiempo real',
      'Kanban para todo el equipo',
      'Menú actualizado al instante',
      'Operación centralizada',
    ],
  },
  howItWorks: {
    badge: '🧭 Cómo funciona',
    title: 'Del cliente al pedido en',
    titleHighlight: '4 pasos',
    steps: [
      { n: '01', title: 'Tu cliente accede', desc: 'Por QR, Instagram, WhatsApp o el enlace de tu restaurante.' },
      { n: '02', title: 'Elige lo que quiere', desc: 'Ve productos, adicionales, observaciones y opciones de entrega o retiro.' },
      { n: '03', title: 'Hace el pedido', desc: 'El pedido llega organizado directamente a tu equipo.' },
      { n: '04', title: 'Tu equipo lo sigue', desc: 'Gestiona cada pedido de principio a fin: Nuevo → Confirmado → En preparación → Listo → Entregado.' },
    ],
  },
  kanban: {
    title: 'Del pedido a la entrega,',
    titleHighlight: 'todos saben qué hacer',
    subtitle: 'Tu atención al cliente, cocina y operación siguen el mismo pedido en tiempo real.',
    caption: 'Menos confusión en horas pico. Más control para tu equipo.',
  },
  whatsapp: {
    badge: 'WhatsApp',
    title: 'Tu cliente no necesita estar',
    titleHighlight: 'preguntando por su pedido',
    subtitle: 'Con las actualizaciones de estado, mantienes al cliente informado durante todo el proceso. Más transparencia para el cliente, menos interrupciones para tu equipo.',
    greeting: '¡Hola, Juan! 👋',
    confirmed: 'fue confirmado.',
    items: '🍔 2x Hamburguesa<br />🍟 1x Papas',
    total: '💰 Total: $54,90',
    preparing: '👨‍🍳 ¡Tu pedido se está preparando!',
  },
  menuQr: {
    badge: '📱 Menú digital',
    title: 'Tu menú está',
    titleHighlight: 'siempre actualizado',
    subtitle: 'Cambia productos, precios, fotos, descripciones y disponibilidad sin reimprimir el menú. Sin aplicación que el cliente deba descargar.',
    steps: [
      { title: 'Código QR', desc: 'El cliente lo escanea.' },
      { title: 'Menú', desc: 'Elige los productos.' },
      { title: 'Pedido', desc: 'Confirma la compra.' },
      { title: 'Restaurante', desc: 'Recibe y organiza.' },
    ],
    footer: 'Actualiza una vez. Tus clientes ven el cambio al instante.',
  },
  payments: {
    badge: 'Pagos',
    title: 'Ofrece las formas de pago',
    titleHighlight: 'que tienen sentido para tu operación',
    subtitle: 'PIX y tarjeta online integrados. Efectivo y tarjeta en terminal también pueden formar parte de tu operación.',
    methods: ['PIX', 'Tarjeta', 'Efectivo'],
  },
  tech: {
    badge: '⚙️ Tecnología',
    title: 'Tecnología que hace',
    titleHighlight: 'que todo funcione',
    subtitle: 'Meu Cardápio utiliza tecnologías confiables para mantener tu operación rápida, segura y conectada.',
    captions: {
      'Efí Bank': 'PIX y pagos',
      'Groq': 'IA para descripciones',
      'Resend': 'Correos automáticos',
      'OpenCage': 'Ubicación y direcciones',
      'Neon': 'Base de datos PostgreSQL',
      'Upstash': 'Caché, sesiones y límite de solicitudes',
      'Supabase': 'Almacenamiento de imágenes',
      'Sentry': 'Monitoreo de errores',
      'Railway': 'Aloja el WhatsApp',
      'GitHub': 'Control de versiones',
      'Vercel': 'Aloja el frontend',
    },
  },
  ai: {
    badge: 'Bono: IA',
    title: 'Haz tus productos más',
    titleHighlight: 'atractivos con IA',
    subtitle: '¿No sabes cómo describir ese producto nuevo? La IA te ayuda a crear descripciones más atractivas en segundos.',
    beforeLabel: 'Antes',
    beforeExample: 'Hamburguesa con carne, queso y salsa.',
    afterLabel: 'Después',
    afterExample: 'Hamburguesa artesanal preparada con carne jugosa, queso cremoso y salsa especial de la casa.',
  },
  featuresSection: {
    badge: '⚡ Y mucho más',
    title: 'Todo lo que tu',
    titleHighlight: 'restaurante necesita',
    items: [
      { title: 'Menú digital', desc: 'Tu menú online, responsivo y personalizado.' },
      { title: 'Código QR', desc: 'Un código QR para cada mesa, mostrador o promoción.' },
      { title: 'Pedidos online', desc: 'Recibe y sigue los pedidos en tiempo real.' },
      { title: 'Kanban', desc: 'Organiza cada pedido por etapa, del nuevo al entregado.' },
      { title: 'WhatsApp', desc: 'Mantén al cliente informado sobre su pedido.' },
      { title: 'Pagos', desc: 'Organiza las formas de pago de tu operación.' },
      { title: 'Delivery', desc: 'Configura tu operación de entrega y retiro.' },
      { title: 'Cupones', desc: 'Crea promociones e incentiva nuevos pedidos.' },
      { title: 'Fidelidad', desc: 'Dale motivos a tus clientes para volver.' },
      { title: 'Informes', desc: 'Sigue la información de tu operación.' },
      { title: 'IA', desc: 'Crea mejores descripciones para tus productos.' },
      { title: 'Equipo', desc: 'Define permisos para cada empleado.' },
      { title: 'Impresión', desc: 'Recursos para integrar la impresión a la operación.' },
    ],
  },
  team: {
    badge: 'Equipo',
    title: 'Un sistema para',
    titleHighlight: 'todo tu equipo',
    subtitle: 'Cada persona con acceso a lo que realmente necesita.',
    roles: [
      { role: 'Gerente', desc: 'Tiene visión completa de la operación.' },
      { role: 'Encargado de atención', desc: 'Se enfoca en la atención y los pedidos.' },
      { role: 'Operador', desc: 'Ayuda con el control de pedidos y pagos.' },
      { role: 'Repartidor', desc: 'Solo accede a los pedidos destinados a entrega.' },
    ],
  },
  businessTypes: {
    title: 'Hecho para diferentes',
    titleHighlight: 'tipos de negocio',
    items: [
      { emoji: '🍕', label: 'Pizzerías' }, { emoji: '🍔', label: 'Hamburgueserías' },
      { emoji: '🥤', label: 'Casas de açaí' }, { emoji: '🍱', label: 'Restaurantes' },
      { emoji: '🌮', label: 'Fondas' }, { emoji: '🍰', label: 'Pastelerías' },
      { emoji: '🍗', label: 'Espeterías' }, { emoji: '☕', label: 'Cafeterías' },
      { emoji: '🥡', label: 'Delivery' },
    ],
    footer1: 'Si vendes comida, Meu Cardápio puede ayudarte a organizar tu operación.',
    footer2: 'Hecho para restaurantes pequeños y medianos que quieren vender más y organizar la operación.',
  },
  plans: {
    badge: '🛡 Planes simples, sin trampas',
    title: 'Simple y',
    titleHighlight: 'transparente',
    subtitle: 'Sin tarifas ocultas. Sin fidelidad. Cancela cuando quieras.',
    monthly: 'Mensual',
    annual: 'Anual',
    mostComplete: 'Más completo',
    perMonth: '/mes',
    billedOnce: 'cobrado una vez al año',
    normalTagline: 'Todo, excepto WhatsApp automático',
    proTagline: 'Todo lo del Normal + WhatsApp automático',
    ctaButton: 'Empezar 7 días gratis',
    trialNote: 'La prueba gratis de 7 días siempre es en el plan Normal — cambia a Pro cuando quieras.',
    migrationTitle: '¿Ya tienes un menú?',
    migrationDesc: 'Te ayudamos a migrar tus productos a Meu Cardápio. Sin necesidad de empezar de cero.',
    normalFeatures: [
      'Menú digital', 'Código QR', 'Pedidos online', 'Kanban',
      'Delivery', 'PIX', 'Cupones', 'Fidelidad', 'Informes',
      'IA para productos', 'Gestión de equipo',
    ],
    proOnlyFeatures: ['WhatsApp automático (confirmación, estado, cobro)'],
  },
  faq: {
    badge: '❓ Preguntas frecuentes',
    title: '¿Aún tienes',
    titleHighlight: 'dudas?',
    items: [
      { q: '¿Necesito instalar alguna aplicación?', a: 'No. El menú digital funciona directo en el navegador del celular (PWA) — el cliente escanea el código QR y hace el pedido sin descargar nada. El panel también funciona en cualquier navegador, en computadora o celular.' },
      { q: '¿El cliente necesita crear una cuenta?', a: 'No. El objetivo es hacer el pedido rápido y simple, sin registro ni contraseña.' },
      { q: '¿Cómo funciona la prueba de 7 días?', a: 'Creas la cuenta, registras la tarjeta (sin ningún cobro en ese momento) y usas el plan Normal durante 7 días. Si cancelas antes de que termine la prueba, no se cobra nada. Sin contrato de fidelidad. ¿Quieres el plan Pro (con WhatsApp automático)? Solo contacta al soporte.' },
      { q: '¿Puedo usar código QR en las mesas?', a: 'Sí. Puedes generar un código QR exclusivo para cada mesa, mostrador o promoción.' },
      { q: '¿Funciona en celular y computadora?', a: 'Sí, en cualquier dispositivo con navegador — ninguna app para instalar, ni para ti ni para tus clientes.' },
      { q: '¿Puedo registrar empleados con permisos diferentes?', a: 'Sí. Puedes crear cuentas para mesero, encargado de atención o repartidor con permisos reducidos — cada uno accede solo a lo que necesita para su función, sin ver informes ni configuraciones si no corresponde.' },
      { q: '¿Puedo trabajar con delivery y retiro?', a: 'Sí. La plataforma fue pensada para diferentes formas de operación.' },
      { q: '¿Qué formas de pago puedo ofrecer a los clientes?', a: 'En el punto de venta/mostrador, PIX ya viene integrado. En el menú digital, PIX y tarjeta se integran vía Efí Bank, con confirmación automática. Tarjeta (en terminal) y efectivo en la entrega o en persona quedan a criterio de cada negocio, fuera de la plataforma.' },
      { q: '¿Necesito tener una impresora?', a: 'No. La impresión es un recurso opcional para tu operación.' },
      { q: '¿Puedo cancelar cuando quiera?', a: 'Sí, sin multas y sin contrato de fidelidad. Cancelas directo desde el panel en cualquier momento.' },
      { q: '¿Puedo migrar mi menú ya armado a la plataforma?', a: 'Sí — nuestro soporte te ayuda a importar productos, precios y categorías al empezar, sin costo adicional.' },
    ],
  },
  finalCta: {
    badge: '✦ Empieza hoy',
    title: 'Tu restaurante merece una',
    titleHighlight: 'operación más simple',
    subtitle: 'Pon tu menú online, organiza tus pedidos y ten más control de tu operación. Empieza ahora.',
    ctaPrimary: 'Empezar mi prueba gratis',
    ctaSecondary: 'Ver menú demo',
    footer: 'Sin fidelidad · Cancela cuando quieras · Soporte en portugués',
  },
  footer: {
    description: 'Plataforma completa para que los restaurantes vendan más con menú digital, delivery y automatización.',
    productHeading: 'Producto',
    productLinks: { funcionalidades: 'Funciones', comoFunciona: 'Cómo funciona', planos: 'Planes', faq: 'FAQ', demo: 'Demostración' },
    accountHeading: 'Cuenta',
    accountLinks: { cadastro: 'Registro gratis', entrar: 'Iniciar sesión' },
    legalHeading: 'Legal',
    legalLinks: { termos: 'Términos de Uso', privacidade: 'Privacidad' },
    copyright: 'Todos los derechos reservados.',
    statusText: 'Todos los sistemas operativos',
  },
}

export const LANDING_DICTIONARIES: Record<LandingLocale, LandingDict> = { 'pt-BR': pt, en, es }

export function getLandingDictionary(locale: string): LandingDict {
  return LANDING_DICTIONARIES[locale as LandingLocale] ?? LANDING_DICTIONARIES[LANDING_DEFAULT_LOCALE]
}

export function resolveLandingLocale(cookieValue: string | null): LandingLocale {
  return (LANDING_LOCALES.some((l) => l.code === cookieValue) ? cookieValue : LANDING_DEFAULT_LOCALE) as LandingLocale
}
