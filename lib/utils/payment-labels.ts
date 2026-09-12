// lib/utils/payment-labels.ts
//
// Rótulo amigável de forma de pagamento — usado tanto no histórico do
// pedido (gerado no servidor, ex.: add-payment/change-payment-method)
// quanto na tela do dashboard (order-detail.tsx), pra nunca aparecer o
// valor bruto do enum (ex.: "CREDIT_CARD") pro lojista.
//
// CORREÇÃO (#4): regra de nome padronizada em todo lugar (relatórios,
// filtros, pedidos): CREDIT_CARD é SEMPRE o cartão online no checkout do
// cardápio digital (processado pela Efí) → "Crédito (Online)".
// CREDIT_CARD_MANUAL e DEBIT_CARD são SEMPRE a maquininha física — não
// importa se é delivery, retirada ou balcão/PDV, é sempre "(Maquininha)".
// Antes CREDIT_CARD_MANUAL tinha uma exceção que tirava o "(Maquininha)"
// no PDV/mesa, o que só confundia (o pagamento físico é sempre na
// maquininha, em qualquer contexto).

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX:                '⚡ PIX',
  PIX_MANUAL:         '⚡ PIX (chave própria)',
  CASH:               '💵 Dinheiro',
  CREDIT_CARD:        '💳 Crédito (Online)',
  CREDIT_CARD_MANUAL: '💳 Crédito (Maquininha)',
  DEBIT_CARD:         '💳 Débito (Maquininha)',
  VOUCHER:            '🎟️ Voucher',
  CASHBACK:           '💰 Cashback',
  TRANSFER:           '🏦 Transferência',
}

export function paymentMethodLabel(method: string, orderType?: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}
