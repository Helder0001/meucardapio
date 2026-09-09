// lib/finance/compute-receipt.ts
//
// Fluxo de recebimentos — calcula, na hora que um pagamento é confirmado,
// os 3 campos usados pela tela financeira: fee (taxa), netAmount (valor
// líquido) e expectedReceiptDate (data prevista de recebimento).
//
// Regras definidas com o dono do produto:
//
//   PIX (qualquer variante — via gateway ou chave direta) e Dinheiro
//     → entram no caixa na hora (D+0) e não têm taxa.
//
//   Cartão de Crédito e Débito — tanto o pago na maquininha física
//   (CREDIT_CARD_MANUAL / DEBIT_CARD) quanto o pago online via gateway
//   (CREDIT_CARD) — ficam DE PROPÓSITO sem taxa nem data prevista
//   calculadas automaticamente aqui:
//
//     • Maquininha física: a transação não passa pela nossa API de jeito
//       nenhum — acontece inteiramente na rede da adquirente da
//       maquininha (Cielo, Stone, a própria da Efí, etc). Não temos
//       nenhum dado dela.
//     • Cartão online (Efí/MP/Asaas): a taxa varia por parcelamento e
//       por negociação comercial de cada tenant com o provedor, e o
//       prazo de repasse (D+1, D+30...) também varia — inventar um
//       número aqui seria apresentar uma taxa/data falsas numa tela que
//       lida com dinheiro de verdade.
//
//   Por isso, cartão (nas duas formas) some no fluxo de recebimentos com
//   fee=null e expectedReceiptDate=null — a tela financeira mostra esses
//   casos numa seção separada, só com o valor bruto, sem data prevista.
//   Se no futuro o tenant configurar a taxa real negociada com o
//   provedor, dá pra estender esta função pra usar esse valor.

export interface ReceiptInfo {
  fee: number | null
  netAmount: number | null
  expectedReceiptDate: Date | null
}

const INSTANT_NO_FEE_METHODS = new Set(['PIX', 'PIX_MANUAL', 'CASH'])

export function computeReceiptInfo(method: string, amount: number, paidAt: Date): ReceiptInfo {
  if (INSTANT_NO_FEE_METHODS.has(method)) {
    return { fee: 0, netAmount: amount, expectedReceiptDate: paidAt }
  }

  // CREDIT_CARD, CREDIT_CARD_MANUAL, DEBIT_CARD (e qualquer método futuro
  // não listado acima) — sem taxa/previsão automática, ver justificativa
  // no comentário do topo do arquivo.
  return { fee: null, netAmount: null, expectedReceiptDate: null }
}
