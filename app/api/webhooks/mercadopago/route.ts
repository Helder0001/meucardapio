// app/api/webhooks/mercadopago/route.ts
// VERSÃO SEGURA — VULN-03 corrigido + ajustes de robustez
//
// CORREÇÃO VULN-03: Removido completamente o bypass de validação em desenvolvimento.
// O webhook SEMPRE valida a assinatura, independente do NODE_ENV.
// Para desenvolvimento: usar ngrok para receber webhooks reais do MP sandbox.
//
// AJUSTES NESTA VERSÃO:
// 1. Race condition: update atômico e condicional (updateMany) para evitar
//    cashback/pontos de fidelidade duplicados em webhooks concorrentes.
// 2. Validação de timestamp (ts) na assinatura — proteção contra replay attack.
// 3. Validação de formato do hash (v1) antes do timingSafeEqual.
// 4. Efeitos colaterais não-críticos (publishOrderEvent, auditLog) movidos
//    para after() — rodam depois da resposta, sem arriscar timeout na Vercel.
//    Cashback e pontos continuam DENTRO da transação (são críticos, precisam
//    ser atômicos com a confirmação do pagamento).

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'
import { restockCancelledOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { resolveTenantMpAccessToken } from '@/lib/mercadopago/resolve-token'
import type { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const runtime = 'nodejs'

// Janela de tolerância para o timestamp da assinatura (segundos).
// Webhooks com 'ts' fora dessa janela são rejeitados (proteção contra replay).
const SIGNATURE_MAX_AGE_SECONDS = 300

// Formato esperado do HMAC SHA-256 em hex: 64 caracteres hexadecimais.
const HEX_SHA256_REGEX = /^[a-f0-9]{64}$/i

async function findPaymentByMpId(mercadoPagoId: string) {
  return prisma.payment.findFirst({
    where: { mercadoPagoId },
    include: {
      order: {
        select: {
          id: true, tenantId: true, orderNumber: true,
          status: true, customerId: true, total: true,
        },
      },
    },
  })
}

// Pagamentos originados de um link (Checkout Pro) ainda não têm
// mercadoPagoId salvo no momento da criação — só sabemos a preference. Por
// isso, quando o webhook chega e não acha pelo mercadoPagoId, usamos o
// campo `user_id` do PRÓPRIO payload do webhook (o MP sempre envia esse
// campo — é o ID da conta MP que recebeu o pagamento) para descobrir de
// qual tenant é, sem precisar adivinhar token nenhum.
async function findConnectionByMpUserId(mpUserId: string | undefined) {
  if (!mpUserId) return null
  return prisma.mercadoPagoConnection.findFirst({
    where: { mpUserId: String(mpUserId), revokedAt: null },
  })
}

async function findPendingPaymentForTenant(tenantId: string, orderId: string | undefined) {
  if (!orderId) return null
  return prisma.payment.findFirst({
    where: { orderId, tenantId, status: { not: 'PAID' } },
    orderBy: { createdAt: 'desc' },
    include: {
      order: {
        select: {
          id: true, tenantId: true, orderNumber: true,
          status: true, customerId: true, total: true,
        },
      },
    },
  })
}

export async function POST(request: Request) {
  try {
    const body      = await request.text()
    const signature = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')

    let event: any
    try {
      event = JSON.parse(body)
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Assinatura de pagamentos PIX/cartão/link é gerada pela conta do
    // ESTABELECIMENTO no Mercado Pago (arquitetura de credenciais duplas),
    // não pela conta da plataforma. Por isso o secret usado pra validar
    // precisa ser o do tenant, não o global. Eventos de assinatura (cobrança
    // do plano) continuam usando o secret da plataforma.
    //
    // Para descobrir QUAL tenant é, usamos o campo `user_id` que o MP sempre
    // inclui no payload do webhook (ID da conta MP que recebeu o pagamento)
    // — não precisamos adivinhar nem consultar a API antes de validar nada.
    let webhookSecret: string | null | undefined = process.env.MERCADOPAGO_WEBHOOK_SECRET

    let payment: Awaited<ReturnType<typeof findPaymentByMpId>> = null
    let connectionTenantId: string | null = null
    let tenantSecretFound = false

    // BUG: só resolvíamos o secret do tenant quando event.type === 'payment'.
    // O Mercado Pago também manda notificações do tipo 'merchant_order'
    // (e possivelmente outras) pro MESMO webhook, assinadas pela MESMA conta
    // do tenant — só que esse formato usa 'resource'/'topic' em vez de
    // 'data.id', então a condição antiga nunca resolvia o secret certo pra
    // elas, caindo no secret da plataforma e sempre retornando 401 (o MP
    // ficava reenviando essas notificações sem parar). Agora a resolução
    // do tenant via user_id roda pra QUALQUER tipo de evento que tenha
    // esse campo — só a busca do Payment em si continua específica de
    // 'payment' mais abaixo.
    // Eventos de ASSINATURA (cobrança do plano PRO da própria plataforma)
    // são sempre da conta da PLATAFORMA — nunca de um tenant. Se a gente
    // deixasse cair na resolução por user_id abaixo, e por acaso a conta MP
    // da plataforma coincidisse com o user_id de algum tenant conectado via
    // OAuth (ex.: mesma conta usada em testes), a validação usaria o secret
    // ERRADO e o webhook de assinatura seria rejeitado (401) silenciosamente.
    const isSubscriptionEvent =
      event.type === 'subscription_preapproval' ||
      event.type === 'subscription_authorized_payment' ||
      event.type === 'subscription_preapproval_plan'

    if (event.type === 'payment' && event.data?.id) {
      payment = await findPaymentByMpId(String(event.data.id))
      if (payment) connectionTenantId = payment.order.tenantId
    }

    if (!isSubscriptionEvent && !connectionTenantId && event.user_id) {
      const connection = await findConnectionByMpUserId(String(event.user_id))
      if (connection) connectionTenantId = connection.tenantId
    }

    if (connectionTenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: { id: connectionTenantId },
        select: { settings: true },
      })
      const tenantSecret = (tenant?.settings as any)?.mercadoPagoWebhookSecret
      if (tenantSecret) {
        webhookSecret = tenantSecret
        tenantSecretFound = true
      }
    }

    // Guarda pra logar fora do if acima (fora do escopo de bloco)
    ;(event as any).__debugConnectionTenantId = connectionTenantId
    ;(event as any).__debugTenantSecretFound = tenantSecretFound

    // LOG TEMPORÁRIO DE DIAGNÓSTICO — agora roda SEMPRE, pra qualquer
    // event.type, não só 'payment'. Não loga o secret em si — só um
    // "fingerprint" (tamanho + primeiro/último caractere) pra dá pra
    // conferir se o valor batendo é mesmo o que foi colado no dashboard,
    // sem expor o segredo nos logs. Remover depois de identificar a causa.
    const secretFingerprint = webhookSecret
      ? `len=${webhookSecret.length} starts=${webhookSecret[0]} ends=${webhookSecret[webhookSecret.length - 1]}`
      : 'none'
    const signatureValid = validateSignature(body, signature, requestId, webhookSecret)
    console.log('[webhook/mp][debug]', {
      eventType: event.type ?? null,
      eventUserId: event.user_id ?? null,
      dataId: event.data?.id ?? null,
      connectionTenantId: (event as any).__debugConnectionTenantId ?? null,
      tenantSecretFound: (event as any).__debugTenantSecretFound ?? false,
      usingSecret: (event as any).__debugConnectionTenantId
        ? ((event as any).__debugTenantSecretFound ? 'tenant' : 'platform-fallback')
        : 'platform-default',
      secretFingerprint,
      signatureValid,
    })

    // VULN-03 CORRIGIDO: sem bypass — SEMPRE valida a assinatura
    if (!signatureValid) {
      console.warn('[webhook/mp] Assinatura inválida rejeitada')
      // Retornar 401 sem revelar detalhes do erro
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Roteamento por tipo de evento
    if (event.type === 'subscription_preapproval') {
      await handleSubscriptionWebhook(event)
      return NextResponse.json({ ok: true })
    }

    // O Mercado Pago manda a cobrança recorrente da assinatura (preapproval)
    // como type: 'payment' — igual a um pagamento normal de pedido —, não só
    // como 'subscription_preapproval' (esse último é só pra mudanças de
    // status da assinatura em si: autorizada/pausada/cancelada). Sem este
    // bloco, essa notificação cairia direto no fluxo de pedido abaixo, não
    // acharia nenhum Payment/Order correspondente (porque não existe: é
    // cobrança de plano, não de cliente final) e retornaria { ok: true } sem
    // atualizar nada. Só entra aqui quando ainda não achamos um Payment de
    // pedido pelo mercadoPagoId (evita custo extra no caminho normal de
    // PIX/cartão/link).
    if (event.type === 'payment' && event.data?.id && !payment) {
      const wasSubscriptionPayment = await handleSubscriptionPaymentEvent(String(event.data.id))
      if (wasSubscriptionPayment) {
        return NextResponse.json({ ok: true })
      }
    }

    // Ignorar eventos que não são de pagamento
    if (event.type !== 'payment' || !event.data?.id) {
      return NextResponse.json({ ok: true })
    }

    const mercadoPagoId = String(event.data.id)

    // Caso do link de pagamento: já sabemos o tenant (via user_id), mas
    // ainda não localizamos QUAL Payment é — consultamos a API do MP (agora
    // sim, com a assinatura já validada e o tenant já confirmado) para obter
    // o external_reference (= orderId) e achar o Payment pendente.
    let mpPaymentLookup: any = null
    if (!payment && connectionTenantId) {
      mpPaymentLookup = await fetchPaymentFromMP(mercadoPagoId, connectionTenantId)
      const externalOrderId = mpPaymentLookup?.external_reference

      const candidate = await findPendingPaymentForTenant(connectionTenantId, externalOrderId)
      if (candidate) {
        payment = await prisma.payment.update({
          where: { id: candidate.id },
          data: { mercadoPagoId },
          include: {
            order: {
              select: {
                id: true, tenantId: true, orderNumber: true,
                status: true, customerId: true, total: true,
              },
            },
          },
        })
      }
    }

    if (!payment) {
      // Pode ser pagamento de assinatura, ou um evento que não conseguimos
      // associar a nenhum pedido — ignorar silenciosamente.
      return NextResponse.json({ ok: true })
    }

    // Reaproveita a consulta já feita acima (caso de link de pagamento);
    // senão, busca agora pela primeira vez.
    const mpPayment = mpPaymentLookup ?? await fetchPaymentFromMP(mercadoPagoId, payment.order.tenantId)
    if (!mpPayment) {
      // Falha ao consultar a API do MP. Mantemos o 500 de propósito: queremos
      // que o MP reenvie o webhook depois. Responder 200 aqui faria o
      // pagamento ficar "perdido" para sempre, sem nenhum retry.
      console.error('[webhook/mp] Não foi possível verificar pagamento na API do MP', { mercadoPagoId })
      return NextResponse.json({ error: 'Could not verify payment' }, { status: 500 })
    }

    const mpStatus = mpPayment.status
    console.log('[WEBHOOK PAYMENT]', {mercadoPagoId,status: mpPayment.status,status_detail: mpPayment.status_detail,payment_type: mpPayment.payment_type_id,method: mpPayment.payment_method_id,orderId: payment.order.id,tenantId: payment.order.tenantId})

    // Processar apenas transições válidas (idempotência)
    if (mpStatus === 'approved' && payment.status !== 'PAID') {
      const paymentMethodLabel =
        mpPayment.payment_type_id === 'credit_card' ? `cartão de crédito${mpPayment.card?.last_four_digits ? ` (final ${mpPayment.card.last_four_digits})` : ''}`
        : mpPayment.payment_type_id === 'debit_card' ? `cartão de débito${mpPayment.card?.last_four_digits ? ` (final ${mpPayment.card.last_four_digits})` : ''}`
        : mpPayment.payment_type_id === 'bank_transfer' ? 'PIX'
        : mpPayment.payment_type_id ?? 'Mercado Pago'

      // VULN/BUG: o link de pagamento (Checkout Pro) aceita qualquer método
      // (PIX, crédito, débito), mas o registro no banco era criado com
      // method: 'CREDIT_CARD' fixo (só por não sabermos ainda o que o
      // cliente ia escolher) — e nunca era corrigido depois. Resultado: um
      // pedido pago via PIX pelo link ficava salvo como "Cartão de Crédito"
      // pra sempre. Agora, ao confirmar, sobrescrevemos com o método real
      // que o Mercado Pago informou.
      const realMethod: string | undefined =
        mpPayment.payment_type_id === 'credit_card' ? 'CREDIT_CARD'
        : mpPayment.payment_type_id === 'debit_card' ? 'DEBIT_CARD'
        : mpPayment.payment_type_id === 'bank_transfer' ? 'PIX'
        : undefined // método desconhecido — preserva o que já estava salvo

      const processed = await prisma.$transaction(async (tx: Tx) => {
        // Update atômico e condicional: garante que, mesmo se dois webhooks
        // chegarem em paralelo (ou o MP reenviar), só um consiga transicionar
        // o pagamento para PAID. O outro recebe count === 0 e sai sem
        // duplicar cashback/pontos de fidelidade.
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'PAID' } },
          data: {
            status: 'PAID',
            mercadoPagoStatus: mpStatus,
            paidAt: new Date(),
            webhookData: mpPayment as any,
            cardLastDigits: mpPayment.card?.last_four_digits ?? undefined,
            cardBrand: mpPayment.payment_method_id ?? undefined,
            installments: mpPayment.installments ?? undefined,
            ...(realMethod ? { method: realMethod as any } : {}),
          },
        })

        if (updated.count === 0) {
          // Outro webhook concorrente já processou este pagamento.
          return false
        }

        await tx.order.update({
          where: { id: payment.order.id },
          data: { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() },
        })

        await tx.orderStatusHistory.create({
          data: {
            orderId: payment.order.id,
            status:  'CONFIRMED',
            notes:   `Pagamento via ${paymentMethodLabel} confirmado automaticamente`,
          },
        })

        if (payment.order.customerId) {
          await applyCashback(tx, payment.order.tenantId, payment.order.customerId, payment.order.id, Number(payment.order.total))
          await applyLoyaltyPoints(tx, payment.order.tenantId, payment.order.customerId, payment.order.id, Number(payment.order.total))
        }

        return true
      })

      if (processed) {
        // Efeitos colaterais não-críticos: não precisam ser atômicos com o
        // pagamento, então rodam depois da resposta ser enviada ao MP — evita
        // arriscar estourar o tempo de execução da function na Vercel.
        after(async () => {
          try {
            await publishOrderEvent(payment.order.tenantId, {
              type: 'ORDER_UPDATED',
              orderId: payment.order.id,
              orderNumber: payment.order.orderNumber,
              status: 'CONFIRMED',
              paymentStatus: 'PAID',
            })

            await auditLog({
              tenantId:   payment.order.tenantId,
              action:     AuditActions.PAYMENT_RECEIVED,
              resource:   'payments',
              resourceId: payment.id,
              newValue:   { method: paymentMethodLabel, amount: Number(payment.amount), status: 'PAID' },
            })
          } catch (err) {
            // Já respondemos ao MP, então só logamos — não há mais como
            // retornar erro pra ninguém aqui.
            console.error('[webhook/mp] Erro em efeito colateral pós-resposta:', err)
          }
        })
      }
    }

    if (mpStatus === 'rejected' && payment.status === 'PENDING') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', mercadoPagoStatus: mpStatus, failedAt: new Date() },
      })
      await prisma.order.update({
        where: { id: payment.order.id },
        data: { paymentStatus: 'FAILED' },
      })
    }

    // CORREÇÃO: quando o PIX expira (5 min), o MP manda o pagamento como
    // "cancelled" — sem tratar isso aqui, o pedido ficava travado pra sempre
    // em "Aguardando confirmação PIX" mesmo depois de expirado.
    if (mpStatus === 'cancelled' && payment.status === 'PENDING') {
      // CORREÇÃO: cancelar o pedido automaticamente quando o PIX expira —
      // só se ainda estiver PENDING (não cancela se a loja já confirmou/avançou
      // o pedido por outro meio, ex.: combinou pagamento em dinheiro na entrega).
      const shouldCancelOrder = payment.order.status === 'PENDING'

      let affectedProductIds: string[] = []
      await prisma.$transaction(async (tx: Tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', mercadoPagoStatus: mpStatus, failedAt: new Date() },
        })
        await tx.order.update({
          where: { id: payment.order.id },
          data: { paymentStatus: 'FAILED' },
        })

        if (shouldCancelOrder) {
          await tx.order.update({
            where: { id: payment.order.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelReason: 'PIX expirado sem pagamento',
            },
          })
          await tx.orderStatusHistory.create({
            data: {
              orderId: payment.order.id,
              status: 'CANCELLED',
              notes: 'Cancelamento automático: PIX expirado sem pagamento (webhook MP)',
            },
          })
          // Devolve ao estoque tudo que foi debitado na criação do pedido
          const result = await restockCancelledOrder(tx, { tenantId: payment.order.tenantId, orderId: payment.order.id })
          affectedProductIds = result.affectedProductIds
        }
      })

      if (affectedProductIds.length > 0) {
        await revalidateStorefrontForTenant(payment.order.tenantId)
      }
    }

    if (mpStatus === 'refunded') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          mercadoPagoStatus: mpStatus,
          refundedAt: new Date(),
          refundAmount: mpPayment.transaction_amount,
        },
      })
      await prisma.order.update({
        where: { id: payment.order.id },
        data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    // VULN-12: nunca expor stacktrace
    console.error('[webhook/mp] Erro interno:', error)
    return NextResponse.json({ ok: true }) // sempre 200 para o MP não retentar
  }
}

// VULN-03 CORRIGIDO: função de validação sem bypass
function validateSignature(
  body: string,
  signature: string | null,
  requestId: string | null,
  webhookSecret: string | null | undefined,
): boolean {
  // Se não tiver secret resolvido (nem do tenant, nem o global) → SEMPRE rejeitar
  if (!webhookSecret) {
    console.error('[webhook/mp] Nenhum webhook secret configurado (tenant nem plataforma)!')
    return false
  }

  if (!signature) {
    return false
  }

  try {
    const parts: Record<string, string> = {}
    signature.split(',').forEach((part) => {
      const [k, v] = part.split('=')
      if (k && v) parts[k] = v
    })

    const { ts, v1 } = parts
    if (!ts || !v1) return false

    // Proteção contra replay attack: rejeita assinaturas antigas demais.
    // Um atacante que capture uma requisição válida não pode reenviá-la
    // depois da janela de tolerância.
    const tsNumber = Number(ts)
    if (!Number.isFinite(tsNumber)) return false
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNumber)
    if (ageSeconds > SIGNATURE_MAX_AGE_SECONDS) {
      console.warn('[webhook/mp] Assinatura rejeitada: timestamp fora da janela', { ageSeconds })
      return false
    }

    // Valida o formato do hash ANTES de converter para Buffer — evita
    // comparar buffers de tamanhos diferentes (hex inválido/truncado) no
    // timingSafeEqual.
    if (!HEX_SHA256_REGEX.test(v1)) return false

    let parsedBody: any
    try { parsedBody = JSON.parse(body) } catch { return false }

    const dataId   = parsedBody?.data?.id ?? ''
    const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`

    const hmac    = crypto.createHmac('sha256', webhookSecret)
    hmac.update(manifest)
    const computed = hmac.digest('hex')

    // Comparação timing-safe para prevenir timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(v1,       'hex')
    )
  } catch {
    return false
  }
}

async function fetchPaymentFromMP(mercadoPagoId: string, tenantId: string) {
  const accessToken = await resolveTenantMpAccessToken(tenantId)
  if (!accessToken) return null

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mercadoPagoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      console.error('[MP API] Erro ao consultar pagamento',{paymentId:mercadoPagoId,status:res.status,body:await res.text()})
      return null
    }
    const payment=await res.json()
    console.log('[MP API] Pagamento consultado',{id:payment.id,status:payment.status,status_detail:payment.status_detail,payment_type_id:payment.payment_type_id,payment_method_id:payment.payment_method_id,transaction_amount:payment.transaction_amount,external_reference:payment.external_reference,date_approved:payment.date_approved})
    return payment
  } catch {
    return null
  }
}

// Consulta um pagamento usando as credenciais da PLATAFORMA (não as do
// tenant). Cobranças de assinatura (preapproval) são recebidas pela conta MP
// da plataforma, então só o token da plataforma consegue enxergar esse
// pagamento — o token de um tenant normalmente recebe 404/403 aqui, o que é
// esperado (só loga warn, não error, pra não gerar ruído no caminho comum de
// pedidos via link de pagamento, que também cai nesta checagem).
async function fetchPlatformPayment(mercadoPagoId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return null

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mercadoPagoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      console.warn('[MP API][platform] Pagamento não encontrado com o token da plataforma (esperado se for pagamento de um tenant)', { paymentId: mercadoPagoId, status: res.status })
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('[MP API][platform] Exceção ao consultar pagamento', { paymentId: mercadoPagoId, err: String(err) })
    return null
  }
}

// Trata a notificação type:'payment' quando ela é, na verdade, a cobrança
// recorrente de uma assinatura (preapproval) — e não o pagamento de um
// pedido de cliente final. Retorna `true` quando o evento era de assinatura
// (processado ou não — nesse caso não deve cair no fluxo de pedido de jeito
// nenhum) e `false` quando não é assinatura, pra o caller seguir o fluxo
// normal de pedido.
async function handleSubscriptionPaymentEvent(mercadoPagoId: string): Promise<boolean> {
  const mpPayment = await fetchPlatformPayment(mercadoPagoId)
  if (!mpPayment) return false // provavelmente pagamento de tenant, não de assinatura

  const preapprovalId: string | undefined =
    mpPayment.preapproval_id ?? mpPayment.point_of_interaction?.transaction_data?.subscription_id
  if (!preapprovalId) return false // pagamento da plataforma, mas não é de assinatura

  console.log('[SUBSCRIPTION PAYMENT]', {
    mercadoPagoId,
    preapprovalId,
    status: mpPayment.status,
    status_detail: mpPayment.status_detail,
    transaction_amount: mpPayment.transaction_amount,
    date_approved: mpPayment.date_approved,
  })

  const subscription = await prisma.subscription.findFirst({
    where: { mercadoPagoSubId: preapprovalId },
  })

  if (!subscription) {
    console.warn('[SUBSCRIPTION PAYMENT] Nenhuma Subscription encontrada para este preapproval_id', { preapprovalId })
    return true
  }

  if (mpPayment.status === 'approved') {
    const nextPeriodEnd = new Date(subscription.currentPeriodEnd)
    if (subscription.billingCycle === 'ANNUAL') {
      nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1)
    } else {
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1)
    }

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', currentPeriodEnd: nextPeriodEnd },
      }),
      prisma.tenant.update({
        where: { id: subscription.tenantId },
        data: { subscriptionStatus: 'ACTIVE' },
      }),
    ])
  } else if (mpPayment.status === 'rejected') {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' },
      }),
      prisma.tenant.update({
        where: { id: subscription.tenantId },
        data: { subscriptionStatus: 'PAST_DUE' },
      }),
    ])
  }

  return true
}

// applyCashback e applyLoyaltyPoints agora vêm de lib/loyalty/apply-rewards
// (compartilhado com a rota de confirmação manual de pagamento /api/orders/[id]/mark-paid)

// ── Handler para webhooks de assinatura (preapproval) ────────────────────────
// Usa SEMPRE as credenciais da PLATAFORMA (MERCADOPAGO_ACCESS_TOKEN), nunca as
// credenciais do estabelecimento. Isso está correto por design: a assinatura
// (preapproval) é a cobrança do plano do Meu Cardápio para o tenant — quem
// RECEBE esse dinheiro é a plataforma, não o restaurante. As credenciais do
// estabelecimento (tenant.settings.mercadoPagoAccessToken) servem só para os
// pagamentos PIX dos clientes finais do restaurante. Não trocar isso.

async function handleSubscriptionWebhook(event: any) {
  const subscriptionId = String(event.data?.id)
  if (!subscriptionId) return

  // Buscar no MP
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return

  const res = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!res.ok) return
  const sub = await res.json()
  console.log('[SUBSCRIPTION]',{id:sub.id,status:sub.status,reason:sub.reason,next_payment_date:sub.next_payment_date,payer_email:sub.payer_email})

  // Encontrar o tenant pela subscription
  const { prisma: db } = await import('@/lib/db/client')
  const subscription = await db.subscription.findFirst({
    where: { mercadoPagoSubId: subscriptionId },
  })
  if (!subscription) return

  const mpStatus = sub.status as string
  // authorized → ACTIVE, paused → PAST_DUE, cancelled → CANCELLED
  const statusMap: Record<string, string> = {
    authorized: 'ACTIVE',
    paused:     'PAST_DUE',
    cancelled:  'CANCELLED',
  }
  const newStatus = statusMap[mpStatus]
  if (!newStatus) return

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus as any,
        currentPeriodEnd: sub.next_payment_date ? new Date(sub.next_payment_date) : undefined,
      },
    }),
    db.tenant.update({
      where: { id: subscription.tenantId },
      data: {
        subscriptionStatus: newStatus === 'ACTIVE' ? 'ACTIVE'
          : newStatus === 'PAST_DUE' ? 'PAST_DUE'
          : 'SUSPENDED',
      },
    }),
  ])
}
