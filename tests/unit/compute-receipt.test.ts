// tests/unit/compute-receipt.test.ts
// Testa o cálculo de fee/netAmount/expectedReceiptDate.
//
// Duas correções cobertas aqui (ver CORREÇÃO em lib/finance/compute-receipt.ts):
// 1. O prazo configurado ("Prazo (dias)") é DIAS CORRIDOS, não dias úteis
//    — só a DATA FINAL é que precisa cair em dia útil (ajusta se cair em
//    fim de semana/feriado). Antes o código contava dias úteis um a um,
//    o que inflava bastante prazos longos (parcelado 7-12x etc.).
// 2. getDay()/setDate() nativos do JS usam o fuso do servidor (UTC na
//    Vercel), não o de São Paulo — corrigido extraindo o Y-M-D já em
//    horário de SP antes de qualquer conta.

import { describe, it, expect } from 'vitest'
import { computeReceiptInfo } from '@/lib/finance/compute-receipt'

// "11/09/2026, 23:26" em horário de São Paulo (America/Sao_Paulo, UTC-3)
// corresponde a este instante UTC. Interpretado direto em UTC (o bug
// antigo) essa venda já "é" sábado; em São Paulo ainda é sexta-feira.
const SEXTA_NOITE_SP = new Date('2026-09-12T02:26:00.000Z')

describe('computeReceiptInfo', () => {
  it('venda de sexta à noite (SP) com D+1 cai na segunda, não no domingo', () => {
    // Sexta 11/09 (SP) + 1 dia corrido = sábado 12/09 → cai em fim de
    // semana → empurra pro próximo dia útil → segunda 14/09.
    const result = computeReceiptInfo(
      'DEBIT_CARD', 45.90, SEXTA_NOITE_SP,
      { maquininhaDebitoRate: 1.99, maquininhaDebitoDays: 1 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-09-14')
  })

  it('mantém o mesmo horário (SP) da venda na data de crédito calculada', () => {
    const result = computeReceiptInfo(
      'DEBIT_CARD', 45.90, SEXTA_NOITE_SP,
      { maquininhaDebitoRate: 1.99, maquininhaDebitoDays: 1 },
    )
    // 23:26 em SP (UTC-3) = 02:26 em UTC no dia seguinte.
    expect(result.expectedReceiptDate?.toISOString().slice(11, 16)).toBe('02:26')
  })

  it('quando a data corrida já cai em dia útil, não mexe (não é dia útil "a mais")', () => {
    // Terça 08/09/2026 12:00 SP + 2 dias corridos = quinta 10/09, que já é
    // dia útil — não empurra.
    const tercaSP = new Date('2026-09-08T15:00:00.000Z')
    const result = computeReceiptInfo(
      'CREDIT_CARD_MANUAL', 100, tercaSP,
      { maquininhaCreditoRate: 3.5, maquininhaCreditoDays: 2 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-09-10')
  })

  it('prazo longo (parcelado) soma dias corridos, não dias úteis', () => {
    // Sexta 11/09/2026 12:00 SP + 30 dias corridos = domingo 11/10 → cai
    // em fim de semana → empurra pro próximo dia útil → segunda 12/10.
    // (Contando como dias ÚTEIS, 30 dias renderia bem mais tarde, lá por
    // meados de novembro — esse é exatamente o bug relatado.)
    const sextaSP = new Date('2026-09-11T15:00:00.000Z')
    const result = computeReceiptInfo(
      'CREDIT_CARD', 1000, sextaSP,
      { efiCard7to12Rate: 4.5, efiCard7to12Days: 30 },
      'EFI', 8,
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-10-12')
  })

  it('empurra pro próximo dia útil quando a data corrida cai em feriado nacional fixo', () => {
    // Sexta 04/09/2026 12:00 SP + 3 dias corridos = segunda 07/09
    // (Independência) → empurra → terça 08/09.
    const sextaSP = new Date('2026-09-04T15:00:00.000Z')
    const result = computeReceiptInfo(
      'DEBIT_CARD', 100, sextaSP,
      { maquininhaDebitoRate: 1.99, maquininhaDebitoDays: 3 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-09-08')
  })

  it('empurra pro próximo dia útil quando a data corrida cai em feriado móvel (Corpus Christi)', () => {
    // Corpus Christi 2026 cai em 04/06 (quinta, calculado a partir da
    // Páscoa). Quarta 03/06/2026 12:00 SP + 1 dia corrido = quinta 04/06
    // (feriado) → empurra → sexta 05/06.
    const quartaSP = new Date('2026-06-03T15:00:00.000Z')
    const result = computeReceiptInfo(
      'DEBIT_CARD', 100, quartaSP,
      { maquininhaDebitoRate: 1.99, maquininhaDebitoDays: 1 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-06-05')
  })

  it('PIX_MANUAL e CASH são sempre D+0, sem taxa', () => {
    const result = computeReceiptInfo('PIX_MANUAL', 50, SEXTA_NOITE_SP, {})
    expect(result.fee).toBe(0)
    expect(result.netAmount).toBe(50)
    expect(result.expectedReceiptDate).toEqual(SEXTA_NOITE_SP)
  })

  it('método sem taxa configurada retorna "não configurado" (null), não um número inventado', () => {
    const result = computeReceiptInfo('DEBIT_CARD', 45.90, SEXTA_NOITE_SP, {})
    expect(result.fee).toBeNull()
    expect(result.netAmount).toBeNull()
    expect(result.expectedReceiptDate).toBeNull()
  })
})
