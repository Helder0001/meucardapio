// tests/unit/reports-validation.test.ts
// Testa a validação de parâmetros de data nos relatórios (correção SQL Injection).

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Réplica exata do schema usado em app/api/reports/export/route.ts
const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido — use YYYY-MM-DD')
  .nullable()
  .optional()

describe('Validação de parâmetros de data (anti-SQLi)', () => {
  it('aceita data válida YYYY-MM-DD', () => {
    expect(dateParamSchema.safeParse('2024-01-15').success).toBe(true)
    expect(dateParamSchema.safeParse('2025-12-31').success).toBe(true)
  })

  it('rejeita SQL injection clássico', () => {
    expect(dateParamSchema.safeParse("2024-01-01'; DROP TABLE orders;--").success).toBe(false)
    expect(dateParamSchema.safeParse("2024-01-01'--").success).toBe(false)
    expect(dateParamSchema.safeParse("' OR 1=1--").success).toBe(false)
  })

  it('rejeita formato de data inválido', () => {
    expect(dateParamSchema.safeParse('01/15/2024').success).toBe(false)
    expect(dateParamSchema.safeParse('2024-1-5').success).toBe(false)
    expect(dateParamSchema.safeParse('não-é-data').success).toBe(false)
    expect(dateParamSchema.safeParse('').success).toBe(false)
  })

  it('aceita null e undefined (datas opcionais)', () => {
    expect(dateParamSchema.safeParse(null).success).toBe(true)
    expect(dateParamSchema.safeParse(undefined).success).toBe(true)
  })

  it('rejeita strings com espaços ou caracteres especiais', () => {
    expect(dateParamSchema.safeParse('2024-01-01 00:00:00').success).toBe(false)
    expect(dateParamSchema.safeParse('2024-01-01T00:00:00Z').success).toBe(false)
  })
})
