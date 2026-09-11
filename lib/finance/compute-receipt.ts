// lib/finance/compute-receipt.ts
//
// Fluxo de recebimentos — calcula fee (taxa), netAmount (valor líquido) e
// expectedReceiptDate (data prevista) na hora que um pagamento é confirmado.
//
// A fonte do dado muda por provedor:
//
//   Mercado Pago e Asaas → a própria API JÁ devolve o valor líquido real e
//   a data de liberação (transaction_details.net_received_amount +
//   money_release_date no MP; netValue + estimatedCreditDate no Asaas).
//   Isso é extraído DIRETO no webhook de cada provedor — não passa por
//   esta função, porque não tem por que estimar algo que o provedor já
//   está nos dizendo com precisão.
//
//   Efí e maquininha física → nenhum dos dois devolve taxa/data de
//   liberação pra gente (a Efí não manda isso na API de PIX/cartão; a
//   maquininha física nem fala com nosso sistema). Por isso essas taxas
//   e prazos são CONFIGURADOS pelo próprio tenant em
//   /dashboard/financeiro (ver actions/settings/save-finance-rates.ts) —
//   nada fica chumbado no código, porque taxa negociada varia de conta
//   pra conta e muda com o tempo. Se o tenant não configurou a taxa de
//   um método ainda, o cálculo fica null de propósito (melhor mostrar
//   "não configurado" do que inventar um número).
//
//   Pix Chave (PIX_MANUAL) e Dinheiro → nunca passam por gateway nenhum,
//   então não tem taxa de processamento nenhuma pra calcular. D+0 sempre,
//   independente de qualquer configuração.

export interface ReceiptInfo {
  fee: number | null
  netAmount: number | null
  expectedReceiptDate: Date | null
}

// Espelha o shape salvo em tenant.settings.financeRates — ver
// actions/settings/save-finance-rates.ts. Todos os campos são % (rate) e
// dias corridos (days) até o dinheiro cair pra o tenant.
export interface FinanceRatesConfig {
  efiPixRate?: number;           efiPixDays?: number
  efiCard1xRate?: number;        efiCard1xDays?: number
  efiCard2to6Rate?: number;      efiCard2to6Days?: number
  efiCard7to12Rate?: number;     efiCard7to12Days?: number
  maquininhaCreditoRate?: number; maquininhaCreditoDays?: number
  maquininhaDebitoRate?: number;  maquininhaDebitoDays?: number
}

const INSTANT_NO_FEE_METHODS = new Set(['PIX_MANUAL', 'CASH'])
const DAY_MS = 24 * 60 * 60 * 1000
const NOT_CONFIGURED: ReceiptInfo = { fee: null, netAmount: null, expectedReceiptDate: null }

export function computeReceiptInfo(
  method: string,
  amount: number,
  paidAt: Date,
  config: FinanceRatesConfig,
  provider?: string | null,
  installments?: number | null,
): ReceiptInfo {
  if (INSTANT_NO_FEE_METHODS.has(method)) {
    return { fee: 0, netAmount: amount, expectedReceiptDate: paidAt }
  }

  if (provider === 'EFI' && method === 'PIX') {
    return applyRate(amount, paidAt, config.efiPixRate, config.efiPixDays)
  }

  if (provider === 'EFI' && method === 'CREDIT_CARD') {
    const n = installments ?? 1
    if (n <= 1)  return applyRate(amount, paidAt, config.efiCard1xRate,    config.efiCard1xDays)
    if (n <= 6)  return applyRate(amount, paidAt, config.efiCard2to6Rate,  config.efiCard2to6Days)
    return applyRate(amount, paidAt, config.efiCard7to12Rate, config.efiCard7to12Days)
  }

  if (method === 'CREDIT_CARD_MANUAL') {
    return applyRate(amount, paidAt, config.maquininhaCreditoRate, config.maquininhaCreditoDays)
  }
  if (method === 'DEBIT_CARD') {
    return applyRate(amount, paidAt, config.maquininhaDebitoRate, config.maquininhaDebitoDays)
  }

  // MP e Asaas não passam por aqui (resolvidos com dado real no próprio
  // webhook) — e qualquer método/provedor não coberto acima fica
  // "não configurado" em vez de inventar um número.
  return NOT_CONFIGURED
}

function applyRate(amount: number, paidAt: Date, ratePercent?: number, days?: number): ReceiptInfo {
  if (ratePercent === undefined || days === undefined) return NOT_CONFIGURED
  const fee = round2(amount * (ratePercent / 100))
  return {
    fee,
    netAmount: round2(amount - fee),
    expectedReceiptDate: new Date(paidAt.getTime() + days * DAY_MS),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
