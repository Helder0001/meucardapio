// lib/utils/demo-tenant.ts
//
// Marca de "modo demonstração" do cardápio digital, usada pelos links
// "Ver demonstração" / "Ver cardápio demo" da landing page (ver
// components/marketing/home-page-client.tsx e app/app/HomePageClient.tsx).
//
// CORREÇÃO (#1): o visitante pode navegar o cardápio, montar carrinho,
// preencher endereço/dados e chegar até a etapa de pagamento livremente —
// só a CONFIRMAÇÃO da forma de pagamento (botão "Fazer pedido", que de fato
// criaria um pedido real) é bloqueada, afinal é uma demonstração e não deve
// gerar pedido/cobrança de verdade.
//
// CORREÇÃO (#2, ajuste): a primeira versão identificava o modo demo pelo
// slug do tenant (o seed em prisma/seed.ts usa 'pizzaria-do-jose'). Só que
// esse mesmo slug pode acabar sendo o de um tenant real de verdade (ex.: um
// lojista de teste que manteve o slug gerado pelo seed ao renomear só o
// nome do estabelecimento) — nesse caso o bloqueio pegava também o "Ver
// cardápio" do Dashboard e o link do cardápio em Configurações, travando a
// compra pro próprio dono. Agora o modo demo é sinalizado por uma query
// string (?demo=1) que só os links da landing page adicionam — o "Ver
// cardápio" do dashboard e o link de Configurações apontam pra URL limpa,
// sem o parâmetro, e por isso nunca entram em modo demo.

export const DEMO_QUERY_PARAM = 'demo'

/** Lê o valor de `searchParams.demo` (já resolvido) da rota do cardápio. */
export function isDemoRequest(demoParam: string | string[] | undefined): boolean {
  const value = Array.isArray(demoParam) ? demoParam[0] : demoParam
  return value === '1' || value === 'true'
}

/** Monta o href usado pelos botões de demonstração da landing page. */
export function buildDemoMenuHref(slug: string): string {
  return `/menu/${slug}?${DEMO_QUERY_PARAM}=1`
}

