// lib/i18n/dashboard.ts
//
// Dicionário do escopo DASHBOARD — independente do storefront e da landing
// (cookie próprio, contexto próprio). Hoje cobre a navegação lateral
// (components/dashboard/sidebar.tsx), o maior componente sempre visível no
// painel. Para estender: adicione a chave nas 3 línguas abaixo e troque o
// texto fixo pelo `t.chave` no componente — ver I18N-ROADMAP.md na raiz do
// projeto para o que ainda falta migrar.

export type DashboardLocale = 'pt-BR' | 'en' | 'es'

export const DASHBOARD_LOCALE_COOKIE = 'mc_dashboard_locale'
export const DASHBOARD_DEFAULT_LOCALE: DashboardLocale = 'pt-BR'

export const DASHBOARD_LOCALES: { code: DashboardLocale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

export interface DashboardDict {
  nav: {
    sectionOperacao: string
    dashboard: string
    pedidos: string
    kanban: string
    minhasEntregas: string
    mesas: string
    delivery: string
    sectionCardapio: string
    produtos: string
    categorias: string
    adicionais: string
    estoque: string
    sectionClientes: string
    clientes: string
    cupons: string
    fidelidade: string
    avaliacoes: string
    whatsapp: string
    roboWhatsapp: string
    waChat: string
    sectionConfiguracoes: string
    financeiro: string
    relatorios: string
    impressoras: string
    pagamentos: string
    integracoes: string
    permissoes: string
    configuracoes: string
    menuMobile: string
    inicio: string
    entregas: string
    emBreve: string
    disponivelNoPlano: string
  }
  modes: {
    manager: string
    attendant: string
    staff: string
    deliveryPerson: string
  }
  plan: {
    starter: string
    pro: string
    premium: string
  }
  languageSwitcher: { label: string }
}

const pt: DashboardDict = {
  nav: {
    sectionOperacao: 'Operação', dashboard: 'Dashboard', pedidos: 'Pedidos', kanban: 'Kanban',
    minhasEntregas: 'Minhas Entregas', mesas: 'Mesas', delivery: 'Delivery',
    sectionCardapio: 'Cardápio', produtos: 'Produtos', categorias: 'Categorias', adicionais: 'Adicionais', estoque: 'Estoque',
    sectionClientes: 'Clientes & Marketing', clientes: 'Clientes', cupons: 'Cupons', fidelidade: 'Fidelidade',
    avaliacoes: 'Avaliações', whatsapp: 'WhatsApp', roboWhatsapp: 'Robô WhatsApp', waChat: 'WA Chat',
    sectionConfiguracoes: 'Configurações', financeiro: 'Financeiro', relatorios: 'Relatórios', impressoras: 'Impressoras',
    pagamentos: 'Pagamentos', integracoes: 'Integrações', permissoes: 'Permissões', configuracoes: 'Configurações',
    menuMobile: 'Menu', inicio: 'Início', entregas: 'Entregas', emBreve: 'Em breve', disponivelNoPlano: 'Disponível no plano',
  },
  modes: {
    manager: '👔 Modo Gerente', attendant: '🧾 Modo Atendente', staff: '🍽️ Modo Operador', deliveryPerson: '🛵 Modo Entregador',
  },
  plan: { starter: '🆓 Starter', pro: '⚡ Plano Pro', premium: '👑 Premium' },
  languageSwitcher: { label: 'Idioma' },
}

const en: DashboardDict = {
  nav: {
    sectionOperacao: 'Operations', dashboard: 'Dashboard', pedidos: 'Orders', kanban: 'Kanban',
    minhasEntregas: 'My Deliveries', mesas: 'Tables', delivery: 'Delivery',
    sectionCardapio: 'Menu', produtos: 'Products', categorias: 'Categories', adicionais: 'Add-ons', estoque: 'Inventory',
    sectionClientes: 'Customers & Marketing', clientes: 'Customers', cupons: 'Coupons', fidelidade: 'Loyalty',
    avaliacoes: 'Reviews', whatsapp: 'WhatsApp', roboWhatsapp: 'WhatsApp Bot', waChat: 'WA Chat',
    sectionConfiguracoes: 'Settings', financeiro: 'Finance', relatorios: 'Reports', impressoras: 'Printers',
    pagamentos: 'Payments', integracoes: 'Integrations', permissoes: 'Permissions', configuracoes: 'Settings',
    menuMobile: 'Menu', inicio: 'Home', entregas: 'Deliveries', emBreve: 'Coming soon', disponivelNoPlano: 'Available on the',
  },
  modes: {
    manager: '👔 Manager Mode', attendant: '🧾 Attendant Mode', staff: '🍽️ Staff Mode', deliveryPerson: '🛵 Delivery Mode',
  },
  plan: { starter: '🆓 Starter', pro: '⚡ Pro Plan', premium: '👑 Premium' },
  languageSwitcher: { label: 'Language' },
}

const es: DashboardDict = {
  nav: {
    sectionOperacao: 'Operación', dashboard: 'Panel', pedidos: 'Pedidos', kanban: 'Kanban',
    minhasEntregas: 'Mis Entregas', mesas: 'Mesas', delivery: 'Delivery',
    sectionCardapio: 'Menú', produtos: 'Productos', categorias: 'Categorías', adicionais: 'Adicionales', estoque: 'Inventario',
    sectionClientes: 'Clientes y Marketing', clientes: 'Clientes', cupons: 'Cupones', fidelidade: 'Fidelidad',
    avaliacoes: 'Reseñas', whatsapp: 'WhatsApp', roboWhatsapp: 'Bot de WhatsApp', waChat: 'Chat WA',
    sectionConfiguracoes: 'Configuración', financeiro: 'Finanzas', relatorios: 'Informes', impressoras: 'Impresoras',
    pagamentos: 'Pagos', integracoes: 'Integraciones', permissoes: 'Permisos', configuracoes: 'Configuración',
    menuMobile: 'Menú', inicio: 'Inicio', entregas: 'Entregas', emBreve: 'Próximamente', disponivelNoPlano: 'Disponible en el plan',
  },
  modes: {
    manager: '👔 Modo Gerente', attendant: '🧾 Modo Atendente', staff: '🍽️ Modo Operador', deliveryPerson: '🛵 Modo Repartidor',
  },
  plan: { starter: '🆓 Starter', pro: '⚡ Plan Pro', premium: '👑 Premium' },
  languageSwitcher: { label: 'Idioma' },
}

export const DASHBOARD_DICTIONARIES: Record<DashboardLocale, DashboardDict> = { 'pt-BR': pt, en, es }

export function getDashboardDictionary(locale: string): DashboardDict {
  return DASHBOARD_DICTIONARIES[locale as DashboardLocale] ?? DASHBOARD_DICTIONARIES[DASHBOARD_DEFAULT_LOCALE]
}

export function resolveDashboardLocale(cookieValue: string | null): DashboardLocale {
  return (DASHBOARD_LOCALES.some((l) => l.code === cookieValue) ? cookieValue : DASHBOARD_DEFAULT_LOCALE) as DashboardLocale
}
