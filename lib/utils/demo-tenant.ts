// lib/utils/demo-tenant.ts
//
// Identifica o tenant usado como "cardápio demo" (links "Ver demonstração" /
// "Ver cardápio demo" na landing page — ver components/marketing/
// home-page-client.tsx e app/app/HomePageClient.tsx), seedado em
// prisma/seed.ts com esse slug fixo.
//
// CORREÇÃO (#1): o visitante pode navegar o cardápio, montar carrinho,
// preencher endereço/dados e chegar até a etapa de pagamento livremente —
// só a CONFIRMAÇÃO da forma de pagamento (botão "Fazer pedido", que de fato
// criaria um pedido real) é bloqueada nesse tenant, afinal é uma
// demonstração e não deve gerar pedido/cobrança de verdade.

export const DEMO_TENANT_SLUG = 'pizzaria-do-jose'

export function isDemoTenantSlug(slug: string | null | undefined): boolean {
  return slug === DEMO_TENANT_SLUG
}
