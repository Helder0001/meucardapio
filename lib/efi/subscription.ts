// lib/efi/subscription.ts
//
// Criação/cancelamento/consulta de assinatura na Efí (API Cobranças) —
// substitui o preapproval do Mercado Pago pra cobrança recorrente do
// plano PRO da própria plataforma.

import { efiRequest, toEfiCents } from './client'
import { getOrCreateEfiPlanId } from './plans'

interface CreateSubscriptionParams {
  billingCycle: 'MONTHLY' | 'ANNUAL'
  amount: number // em reais (R$), convertido pra centavos aqui dentro
  planLabel: string // nome do item na fatura, ex: "Meu Cardápio — Plano PRO Mensal — Nome da Loja"
  customerName: string
  customerCpf: string // só dígitos
  customerEmail: string
  customerPhone: string // OBRIGATÓRIO pra Efí (erro 3500023 "required_property" sem isso)
  paymentToken: string // gerado no frontend via Efí.js a partir dos dados do cartão
  trialDays?: number // dias de teste grátis antes da 1ª cobrança (só existe pra credit_card)
}

interface EfiSubscriptionResponse {
  code: number
  data: {
    subscription_id: number
    status: string // 'new' | 'active' | ...
    plan: { id: number; interval: number; repeats: number | null }
    charge: { id: number; status: string; parcel: number; total: number }
    total: number
  }
}

export async function createEfiCardSubscription(params: CreateSubscriptionParams) {
  const efiPlanId = await getOrCreateEfiPlanId(params.billingCycle)

  const response = await efiRequest<EfiSubscriptionResponse>(
    'POST',
    `/v1/plan/${efiPlanId}/subscription/one-step`,
    {
      items: [
        {
          name: params.planLabel,
          value: toEfiCents(params.amount),
          amount: 1,
        },
      ],
      metadata: {
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/efi`,
      },
      payment: {
        credit_card: {
          customer: {
            name: params.customerName,
            cpf: params.customerCpf,
            email: params.customerEmail,
            phone_number: params.customerPhone,
          },
          payment_token: params.paymentToken,
          ...(params.trialDays ? { trial_days: params.trialDays } : {}),
        },
      },
    }
  )

  return {
    efiPlanId,
    efiSubscriptionId: response.data.subscription_id,
    efiChargeId: response.data.charge.id,
    status: response.data.status, // 'active' geralmente já vem assim, mesmo em trial
    chargeStatus: response.data.charge.status, // 'waiting' | 'paid' | ...
  }
}

/** Cancela a assinatura na Efí — impede qualquer cobrança futura imediatamente. */
export async function cancelEfiSubscription(efiSubscriptionId: number): Promise<void> {
  await efiRequest('PUT', `/v1/subscription/${efiSubscriptionId}/cancel`)
}

interface EfiSubscriptionInfo {
  code: number
  data: {
    subscription_id: number
    status: string
    next_execution: string | null
    next_expire_at: string | null
    plan: { plan_id: number; interval: number; repeats: number | null }
    occurrences: number
  }
}

export async function getEfiSubscription(efiSubscriptionId: number) {
  return efiRequest<EfiSubscriptionInfo>('GET', `/v1/subscription/${efiSubscriptionId}`)
}

interface EfiNotificationEntry {
  id: number
  type: 'subscription' | 'subscription_charge' | 'charge' | 'carnet' | 'carnet_charge'
  custom_id: string | null
  status: { current: string; previous: string | null }
  identifiers: { subscription_id?: number; charge_id?: number }
  created_at: string
  value?: number // em centavos, presente quando o evento é uma confirmação de pagamento
}

/** Consulta o conteúdo de uma notificação (o POST do webhook só manda o token). */
export async function getEfiNotification(token: string): Promise<EfiNotificationEntry[]> {
  const response = await efiRequest<{ code: number; data: EfiNotificationEntry[] }>(
    'GET',
    `/v1/notification/${token}`
  )
  return response.data
}
