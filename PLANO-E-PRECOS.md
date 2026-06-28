# Plano e Preços — Meu Cardápio

## Plano único: PRO

Acesso completo a todos os recursos:
- Cardápio digital + QR Code
- Pedidos em tempo real (kanban)
- Pagamentos PIX + cartão
- WhatsApp + notificações
- **Usuários ilimitados**
- Relatórios e delivery
- Multi-PDV

## Preços atuais (TESTE — alterar antes de ir ao ar)

| Ciclo   | Valor       | Observação                          |
|---------|-------------|-------------------------------------|
| Mensal  | R$ 1,00/mês | `PLAN_PRICE_MONTHLY = 1.00`         |
| Anual   | R$ 10,80/ano | 12 × R$1,00 − 10% = R$10,80        |
|         | ≈ R$ 0,90/mês | equivalente mensal                 |

## Como alterar o preço

Edite **DOIS** arquivos (devem ter o mesmo valor):

1. `app/api/mp/preapproval/route.ts`
   ```ts
   const PLAN_PRICE_MONTHLY = 1.00  // ← alterar aqui
   ```

2. `actions/auth/register.ts`
   ```ts
   const PLAN_PRICE_MONTHLY = 1.00  // ← e aqui
   ```

O valor anual (`PLAN_PRICE_ANNUAL`) é calculado automaticamente:
`mensal × 12 × 0.9` (10% de desconto).

## Formas de pagamento suportadas

- **Cartão de crédito recorrente** — tokenizado via Mercado Pago SDK
- **PIX recorrente** — link de pagamento enviado por e-mail pelo MP a cada ciclo

## Trial

- 7 dias grátis ao criar conta
- Nenhuma cobrança durante o trial
- Cobrança automática após o trial (cartão) ou link PIX por e-mail
