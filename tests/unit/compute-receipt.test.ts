// tests/unit/compute-receipt.test.ts
// Testa o cálculo de fee/netAmount/expectedReceiptDate — em especial a
// contagem de dias úteis em horário de Brasília (ver CORREÇÃO em
// lib/finance/compute-receipt.ts: getDay()/setDate() nativos do JS usam o
// fuso do servidor — UTC na Vercel — não o de São Paulo).

import { describe, it, expect } from 'vitest'
import { computeReceiptInfo } from '@/lib/finance/compute-receipt'

// "11/09/2026, 23:26" em horário de São Paulo (America/Sao_Paulo, UTC-3)
// corresponde a este instante UTC. Interpretado direto em UTC (o bug
// antigo) essa venda já "é" sábado; em São Paulo ainda é sexta-feira.
const SEXTA_NOITE_SP = new Date('2026-09-12T02:26:00.000Z')

describe('computeReceiptInfo — dias úteis em horário de Brasília', () => {
  it('venda de sexta à noite (SP) com D+1 útil cai na segunda, não no domingo', () => {
    // Sexta 11/09 (SP) + 1 dia útil = pula sáb 12 e dom 13 → segunda 14/09.
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

  it('venda no meio da semana soma dias úteis corridos normalmente', () => {
    // Terça 08/09/2026 12:00 SP (15:00 UTC) + 2 dias úteis = quinta 10/09.
    const tercaSP = new Date('2026-09-08T15:00:00.000Z')
    const result = computeReceiptInfo(
      'CREDIT_CARD_MANUAL', 100, tercaSP,
      { maquininhaCreditoRate: 3.5, maquininhaCreditoDays: 2 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-09-10')
  })

  it('pula feriado nacional fixo (Independência, 07/09) além de sábado/domingo', () => {
    // Sexta 04/09/2026 12:00 SP + 3 dias úteis: sáb 5 e dom 6 (fim de
    // semana) e seg 7 (Independência) não contam → conta ter 8, qua 9,
    // qui 10 → resultado 10/09. Sem pular o feriado daria 09/09.
    const sextaSP = new Date('2026-09-04T15:00:00.000Z')
    const result = computeReceiptInfo(
      'DEBIT_CARD', 100, sextaSP,
      { maquininhaDebitoRate: 1.99, maquininhaDebitoDays: 3 },
    )
    expect(result.expectedReceiptDate?.toISOString().slice(0, 10)).toBe('2026-09-10')
  })

  it('pula feriado móvel (Corpus Christi, calculado a partir da Páscoa)', () => {
    // Corpus Christi 2026 cai em 04/06 (quinta). Quarta 03/06/2026 12:00 SP
    // + 1 dia útil pulando a quinta (feriado) → sexta 05/06.
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
