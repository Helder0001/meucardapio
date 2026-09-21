# I18N — arquitetura pronta, roteiro de continuação

## O que já está funcionando

Três escopos de idioma **totalmente independentes** — trocar um nunca afeta
os outros, porque cada um tem seu próprio cookie e seu próprio React Context:

| Escopo | Cookie | Onde mora o dicionário | Provider |
|---|---|---|---|
| Dashboard | `mc_dashboard_locale` | `lib/i18n/dashboard.ts` | `lib/i18n/dashboard-context.tsx` |
| Storefront (cardápio) | `mc_storefront_locale` | `lib/i18n/storefront.ts` | `lib/i18n/storefront-context.tsx` |
| Landing (site) | `mc_landing_locale` | `lib/i18n/landing.ts` | `lib/i18n/landing-context.tsx` |

Idiomas hoje: **pt-BR, en, es** (escolhidos por serem os que cobrem a
esmagadora maioria dos casos reais — turista estrangeiro no cardápio,
possível expansão pra outros países de língua espanhola). "Todos os
idiomas possíveis" não é uma decisão de arquitetura, é conteúdo: adicionar
um idioma novo é só criar mais um objeto no dicionário (`fr`, `de`, `it`...)
e uma linha em `_LOCALES` — não exige tocar em nenhum componente.

Fluxo de troca: usuário clica no seletor (`components/shared/language-switcher.tsx`)
→ chama a server action daquele escopo (`actions/i18n/set-locale.ts`) →
grava só o cookie daquele escopo → `router.refresh()` re-renderiza a árvore
com o dicionário novo.

**Já traduzido de ponta a ponta** (pt-BR/en/es):
- **Dashboard**: navegação lateral inteira (desktop + drawer mobile + barra
  inferior mobile) — `components/dashboard/sidebar.tsx`.
- **Landing**: página inteira — barra de topo, navbar, hero, problema/solução,
  como funciona, Kanban, WhatsApp, cardápio/QR, pagamentos, tecnologia, IA,
  grade de funcionalidades, equipe, tipos de negócio, planos, FAQ, CTA final
  e rodapé — `components/marketing/home-page-client.tsx`.
- **Cardápio (storefront)**: ✅ completo — busca/nav/tema/carrinho, ficha de
  produto (`product-card.tsx`, `product-modal.tsx`), modal "Mais informações"
  (`InfoModal`), checkout inteiro (`cart-drawer.tsx`: entrega/retirada,
  endereço, telefone/nome, cupom, cashback, pontos de fidelidade, formas de
  pagamento, resumo, todos os toasts de erro/sucesso) e a aba "Meus Pedidos"
  + login por WhatsApp/OTP (`CustomerOrdersSection`, `CustomerAuthModal`,
  tudo dentro de `storefront-client.tsx`).

## O que falta (por escopo, para continuar)

O padrão é sempre o mesmo 3 passos — copie de qualquer arquivo já feito:
1. Adicionar as chaves novas nas 3 línguas em `lib/i18n/<escopo>.ts`.
2. No componente: `const t = use<Escopo>Dict()` e trocar o texto fixo por `t.chave`.
3. Se o componente for novo na árvore (fora do que o Provider já envolve),
   nada a fazer — o Provider já está no layout do escopo inteiro.

**Dashboard** (`lib/i18n/dashboard.ts` + `lib/i18n/dashboard-context.tsx` já prontos):
- `components/dashboard/header.tsx` (barra superior)
- Cada página em `app/(dashboard)/dashboard/**` (Pedidos, Kanban, Produtos,
  Configurações etc.) — são dezenas de arquivos, migrar por prioridade de uso.
- Formulários grandes: `general-settings-form.tsx`, `chatbot-automation-settings.tsx` etc.

**Storefront** — ✅ completo (ver acima). Resta só:
- Nomes/descrições de produtos e categorias cadastrados pelo restaurante —
  esses **não são strings de UI**, são dados do banco (`Product.name`,
  `Product.description`). Traduzir isso é um projeto à parte: exigiria um
  campo de tradução por idioma no banco (ex. `Product.nameEn`,
  `Product.nameEs`) e uma tela no dashboard pra cadastrar cada versão — não
  é algo que a arquitetura de dicionário estático resolve.

**Landing** — ✅ completa (ver acima). Resta só:
- Metadata de SEO (`app/page.tsx`) continua só em português de propósito —
  criar `<html lang>`/`hreflang` por idioma pra landing é um projeto de SEO
  à parte (rotas `/en`, `/es` na URL), fora do escopo do cookie de sessão
  usado aqui.

## Por que cookie e não URL (`/en/...`)

Não usei prefixo de idioma na URL (`/en/menu/pizzaria-do-jose`) de propósito:
o link do cardápio já está impresso em QR Code físico nas mesas de cada
restaurante cliente. Mudar a URL quebraria todo QR Code já impresso. Cookie
por navegador resolve sem tocar em nenhuma URL existente. Se um dia SEO em
outros idiomas para a landing virar prioridade, dá pra migrar só a landing
para rotas `/en`, `/es` sem afetar dashboard nem storefront (escopos
continuam independentes).
