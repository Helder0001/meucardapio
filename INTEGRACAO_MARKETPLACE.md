# Integração iFood + 99Food — Resumo da implementação

## O que já está pronto no código

**Banco de dados** (`prisma/schema.prisma` + migration manual em
`prisma/migrations/20260628_marketplace_integrations/migration.sql`):
- `MarketplaceConnection` — conexão de cada loja com iFood/99Food (tokens
  sempre criptografados, nunca em texto plano)
- `MarketplaceProductMapping` — vínculo entre produto do cardápio e item do
  marketplace (necessário pra baixa de estoque automática)
- `MarketplaceOrder` — registro de cada pedido recebido, com payload bruto
  preservado para auditoria/suporte

**Lógica de integração** (`lib/marketplace/`):
- `ifood-client.ts` / `ninety-nine-food-client.ts` — clientes de cada API
- `token-manager.ts` — renovação automática de token antes de expirar
- `process-order.ts` — transforma pedido do marketplace em `Order` interno
  (aparece no Kanban, na impressão de cozinha, nos relatórios — tudo igual a
  um pedido feito pelo cardápio próprio)
- `poll-events.ts` — busca novos pedidos/eventos de todas as lojas conectadas

**Rotas de API** (`app/api/marketplace/`):
- Conectar, callback de autorização, desconectar, sincronizar agora
- Listar conexões e pedidos pendentes de confirmação manual
- Confirmar/recusar pedido manualmente

**Dashboard** (`/dashboard/settings/integrations`):
- Cards de iFood e 99Food com botão "Conectar"
- Toggle de "aceitar pedidos automaticamente" e "loja aberta"
- Lista de pedidos aguardando confirmação (quando auto-aceitar está desligado)
- Botão "Atualizar agora" (sincronização manual sob demanda)

**Cron** (`vercel.json`): polling a cada 1 minuto — requer plano Vercel Pro
(Hobby só permite cron diário; nesse caso use "Atualizar agora" manualmente).

## O que falta para funcionar de verdade

Nenhuma quantidade de código resolve isso — depende de homologação externa:

1. **Virar parceiro homologado no iFood** (developer.ifood.com.br) e obter
   `IFOOD_APP_ID`, `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` de produção.
2. **Conseguir o slot de integração Open Delivery da 99Food**
   (developer-food.99app.com) — processo comercial, não self-service.
3. Rodar a migration no banco e `npx prisma generate`.
4. Configurar as variáveis de ambiente (ver `.env.example` atualizado).
5. Testar em sandbox antes de liberar para lojas reais.

Veja o passo a passo completo na seção "Passo 5.1" do `DEPLOY.md`.

## Pontos de atenção / decisões tomadas

- **Não recalculamos preços** dos pedidos de marketplace — o iFood/99Food já
  cobrou o cliente, então usamos os valores que a plataforma envia como fonte
  da verdade (só validamos consistência: subtotal + entrega − desconto ≈ total).
- **Itens sem mapeamento de produto** ainda entram no pedido (nome/preço
  salvos como snapshot), mas usam um produto "placeholder" internamente e não
  baixam estoque — até o lojista mapear o item em
  `MarketplaceProductMapping`. Vale evoluir a UI de mapeamento de catálogo
  como próximo passo.
- **Cancelamento na origem** propaga para o `Order` interno automaticamente.
- **Confirmação automática é opt-in** (`autoAcceptOrders`) — por padrão o
  lojista confirma manualmente, para evitar aceitar pedidos com a cozinha
  sobrecarregada. Ative apenas quando a operação estiver testada.
