// lib/utils/payment-labels.ts
//
// Rótulo amigável de forma de pagamento — usado tanto no histórico do
// pedido (gerado no servidor, ex.: add-payment/change-payment-method)
// quanto na tela do dashboard (order-detail.tsx), pra nunca aparecer o
// valor bruto do enum (ex.: "CREDIT_CARD") pro lojista.

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX:                '⚡ PIX',
  PIX_MANUAL:         '⚡ PIX (chave própria)',
  CASH:               '💵 Dinheiro',
  CREDIT_CARD:        '💳 Cartão de Crédito',
  CREDIT_CARD_MANUAL: '💳 Crédito (entrega/retirada)',
  DEBIT_CARD:         '💳 Cartão de Débito',
  VOUCHER:            '🎟️ Voucher',
  CASHBACK:           '💰 Cashback',
  TRANSFER:           '🏦 Transferência',
}

// No Balcão/Mesa o cliente está fisicamente ali passando o cartão na
// maquininha — "entrega/retirada" não faz sentido nesse contexto.
export function paymentMethodLabel(method: string, orderType?: string): string {
  if (method === 'CREDIT_CARD_MANUAL' && (orderType === 'PDV' || orderType === 'TABLE')) {
    return '💳 Crédito'
  }
  return PAYMENT_METHOD_LABELS[method] ?? method
}
