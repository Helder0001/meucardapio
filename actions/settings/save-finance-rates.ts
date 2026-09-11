'use server'
// actions/settings/save-finance-rates.ts
//
// Salva as taxas e prazos de recebimento configuráveis pelo tenant — usados
// pelo Fluxo de Recebimentos (lib/finance/compute-receipt.ts) sempre que o
// provedor não devolve essa informação sozinho (Efí não manda taxa/data na
// API; maquininha física não fala com a gente de jeito nenhum). Mercado
// Pago e Asaas NÃO usam essas configurações — eles já mandam o valor
// líquido e a data reais na própria API/webhook.
//
// Ficam salvas em tenant.settings.financeRates (mesmo padrão já usado
// pelas outras configurações de pagamento neste arquivo-irmão
// save-payment-settings.ts).

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const rateSchema = z.coerce.number().min(0).max(100).optional()
const daysSchema  = z.coerce.number().int().min(0).max(90).optional()

const schema = z.object({
  efiPixRate:            rateSchema,
  efiPixDays:             daysSchema,
  efiCard1xRate:          rateSchema,
  efiCard1xDays:          daysSchema,
  efiCard2to6Rate:        rateSchema,
  efiCard2to6Days:        daysSchema,
  efiCard7to12Rate:       rateSchema,
  efiCard7to12Days:       daysSchema,
  maquininhaCreditoRate:  rateSchema,
  maquininhaCreditoDays:  daysSchema,
  maquininhaDebitoRate:   rateSchema,
  maquininhaDebitoDays:   daysSchema,
})

export type FinanceRatesState = { error?: string; success?: boolean }

export async function saveFinanceRates(
  _prev: FinanceRatesState,
  formData: FormData
): Promise<FinanceRatesState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Você não tem permissão para alterar essas configurações' }
  }

  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, formData.get(key) || undefined])
  )
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const tenantId = session.user.tenantId
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  // Remove campos vazios em vez de salvar `undefined`/NaN — assim a tela
  // sabe distinguir "não configurado" (usa null no cálculo, não estima
  // nada) de "configurado com 0".
  const financeRates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined && !Number.isNaN(v))
  )

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...currentSettings, financeRates } },
  })

  revalidatePath('/dashboard/financeiro')
  return { success: true }
}
