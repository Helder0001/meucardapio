# Resumo das alterações — Cancelamento automático + Controle de estoque

## 1. Cancelamento automático de pedidos pendentes há mais de 2h

### Bugs corrigidos (a feature já existia no código, mas nunca funcionava)
- `vercel.json` tinha `"crons": []` — o cron **nunca foi registrado** na Vercel,
  então nunca rodava em produção.
- A rota verificava o header `x-cron-secret`, mas a Vercel envia o segredo como
  `Authorization: Bearer <CRON_SECRET>`. A rota agora aceita os dois.
- **O plano Hobby da Vercel só permite cron com frequência de no máximo 1x/dia.**
  Um cron a cada 15 min (necessário para cumprir a janela de 2h com precisão)
  é rejeitado no deploy ("Hobby accounts are limited to daily cron jobs").
  Por isso, a verificação de "pagamento pendente há mais de 2h" agora roda em
  **dois lugares**:
  1. `app/api/orders/[id]/status` — a cada vez que o storefront consulta o
     status do pedido (polling do cliente). Cobre o caso comum: cliente com
     a aba aberta acompanhando o pedido.
  2. `app/api/internal/cron/cleanup` — roda 1x/dia (às 6h) como rede de
     segurança, para pedidos cujo cliente nunca voltou a consultar o status
     (fechou a aba, perdeu o link, etc.).
- **Nenhum dos pontos que cancelam pedido automaticamente devolvia o estoque
  debitado na compra.** Corrigido em todos:
  1. `app/api/orders/[id]/status` — cancelamento por PIX expirado (5 min) OU
     por falta de pagamento geral (2h), no polling do cliente
  2. `app/api/internal/cron/cleanup` — rede de segurança diária
  3. `app/api/webhooks/mercadopago` — cancelamento quando o MP confirma PIX expirado/cancelado
  4. `app/api/orders/[id]/update-status` — cancelamento manual pelo lojista no dashboard

Todo cancelamento agora roda em uma transação atômica: status do pedido + 
histórico + estorno de estoque, tudo junto ou nada.

## 2. Controle de estoque

### Já existia (mantido)
- Model `Stock` (quantidade por produto/PDV).
- Validação de estoque ao montar o pedido (`lib/utils/order-calculator.ts`).
- Decremento de estoque na criação do pedido.
- Alertas de estoque baixo (`lib/utils/stock-alerts.ts`).

### Novo
- **`lib/utils/stock.ts`** — módulo central com:
  - `decrementStockForOrder`: decremento seguro contra concorrência (dois
    pedidos simultâneos não conseguem vender o mesmo último item — usa
    `UPDATE ... WHERE quantity >= X` em vez de "ler e depois escrever").
  - `restockCancelledOrder`: estorna automaticamente ao cancelar, idempotente
    (chamar duas vezes para o mesmo pedido não duplica o crédito).
  - `adjustStockManually`: entrada manual, saída manual, ou correção de saldo.
- **Model `StockMovement`** no schema: histórico completo e auditável de toda
  movimentação (venda, estorno, entrada, saída, ajuste) — quem fez, quando, e
  o saldo resultante.
- **Tela `/dashboard/stock`** (menu "Estoque", visível para Admin/Gerente):
  cadastrar estoque por produto+PDV, ajustar quantidade, definir alerta de
  estoque baixo, ver status (em estoque / baixo / esgotado).
- **Actions** em `actions/stock/`: `create-stock`, `adjust-stock`,
  `update-min-quantity`.

## Passos necessários antes de rodar em produção

```bash
# 1. Gerar a migration do Prisma (cria o model StockMovement)
npx prisma migrate dev --name add_stock_movement

# (ou, se o projeto usa db push em vez de migrations:)
npx prisma db push

# 2. Gerar o client atualizado
npx prisma generate
```

Não foi possível rodar esses dois comandos neste ambiente (sem acesso de rede
aos binários do Prisma), então a migration ainda precisa ser gerada no seu
ambiente local antes do deploy.

## Testes

21 testes novos, todos passando:
- `tests/unit/stock-control.test.ts` (14 testes) — decremento, divisão entre
  PDVs, proteção contra saldo negativo, estorno, idempotência, ajustes manuais.
- `tests/integration/cron-cleanup.test.ts` (7 testes) — autenticação do cron
  (incluindo o header real da Vercel), janela de 2h, estorno atômico,
  proteção contra corrida, resiliência a falhas parciais.

Rode com: `npx vitest run`
