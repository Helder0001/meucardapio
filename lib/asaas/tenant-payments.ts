// lib/asaas/tenant-payments.ts
//
// Cria cobranças Pix no Asaas em nome de um tenant. Fluxo (doc oficial):
//   1. POST /v3/customers          → garante um "cliente" no Asaas pro pagador
//   2. POST /v3/payments           → cria a cobrança (billingType: PIX)
//   3. GET  /v3/payments/{id}/pixQrCode → busca a imagem do QR + copia-e-cola
//
// https://docs.asaas.com/docs/pix

import { asaasRequest } from './client'

interface CreateAsaasPixChargeParams {
  tenantId: string
  orderId: string
  amount: number
  customerName?: string
  customerCpf?: string
  customerPhone?: string
}

interface AsaasCustomer {
  id: string
}

interface AsaasPayment {
  id: string
  status: string
}

interface AsaasPixQrCode {
  encodedImage: string  // base64 (sem prefixo "data:image/png;base64,")
  payload: string       // copia e cola
  expirationDate: string
}

// Encontra (por CPF) ou cria um cliente Asaas pra registrar o pagador da
// cobrança. Asaas exige um customerId em toda cobrança — não dá pra criar
// avulsa só com nome/telefone.
async function findOrCreateAsaasCustomer(
  tenantId: string,
  { customerName, customerCpf, customerEmail }: { customerName?: string; customerCpf?: string; customerEmail?: string }
): Promise<string> {
  const cpfCnpj = (customerCpf ?? '').replace(/\D/g, '')

  if (cpfCnpj) {
    const existing = await asaasRequest<{ data: AsaasCustomer[] }>(
      tenantId,
      `/customers?cpfCnpj=${cpfCnpj}`
    )
    if (existing.data?.length > 0) return existing.data[0].id
  }

  const created = await asaasRequest<AsaasCustomer>(tenantId, '/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: customerName?.trim() || 'Cliente',
      cpfCnpj: cpfCnpj || undefined,
      email: customerEmail || undefined,
    }),
  })
  return created.id
}

export async function createAsaasPixCharge(params: CreateAsaasPixChargeParams) {
  const customerId = await findOrCreateAsaasCustomer(params.tenantId, {
    customerName: params.customerName,
    customerCpf: params.customerCpf,
  })

  // Vencimento hoje — cobrança Pix é liquidada na hora, a data serve só
  // pra satisfazer o campo obrigatório da API.
  const today = new Date().toISOString().slice(0, 10)

  const payment = await asaasRequest<AsaasPayment>(params.tenantId, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value: params.amount,
      dueDate: today,
      description: `Pedido #${params.orderId.slice(-8).toUpperCase()}`,
      externalReference: params.orderId,
    }),
  })

  const qrCode = await asaasRequest<AsaasPixQrCode>(
    params.tenantId,
    `/payments/${payment.id}/pixQrCode`
  )

  return {
    asaasPaymentId: payment.id,
    pixQrCode: qrCode.payload,
    pixQrCodeBase64: qrCode.encodedImage,
    pixExpiresAt: qrCode.expirationDate ? new Date(qrCode.expirationDate) : undefined,
  }
}

// ─── Cartão via Asaas ───────────────────────────────────────────────────────
//
// O Asaas não tem SDK de tokenização client-side (chave pública), como o
// MP Bricks ou a Efí.js — o endpoint /creditCard/tokenizeCreditCard exige
// a API Key privada da conta. Por isso o token é gerado num PROXY mínimo
// no nosso servidor (ver app/api/orders/[id]/asaas-tokenize-card), que só
// repassa os dados pro Asaas e devolve o token — nunca loga nem persiste
// o cartão. Esta função é chamada por essa rota.

interface TokenizeAsaasCardParams {
  tenantId: string
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
  customerName: string
  customerCpf: string
  customerEmail?: string
  customerPostalCode: string
  customerAddressNumber: string
  customerPhone?: string
  remoteIp: string
}

interface AsaasTokenizeResponse {
  creditCardToken: string
  creditCardNumber: string // últimos 4 dígitos
  creditCardBrand: string
}

export async function tokenizeAsaasCard(params: TokenizeAsaasCardParams) {
  const result = await asaasRequest<AsaasTokenizeResponse>(params.tenantId, '/creditCard/tokenizeCreditCard', {
    method: 'POST',
    body: JSON.stringify({
      creditCard: {
        holderName: params.holderName,
        number: params.number,
        expiryMonth: params.expiryMonth,
        expiryYear: params.expiryYear,
        ccv: params.ccv,
      },
      creditCardHolderInfo: {
        name: params.customerName,
        email: params.customerEmail || 'cliente@meucardapio.app',
        cpfCnpj: params.customerCpf,
        postalCode: params.customerPostalCode,
        addressNumber: params.customerAddressNumber,
        phone: params.customerPhone,
      },
      remoteIp: params.remoteIp,
    }),
  })

  return {
    creditCardToken: result.creditCardToken,
    cardLastDigits: result.creditCardNumber,
    cardBrand: result.creditCardBrand,
  }
}

interface CreateAsaasCardChargeParams {
  tenantId: string
  orderId: string
  amount: number
  creditCardToken: string
  remoteIp: string
  customerName?: string
  customerCpf?: string
  customerEmail?: string
}

export async function createAsaasCardCharge(params: CreateAsaasCardChargeParams) {
  const customerId = await findOrCreateAsaasCustomer(params.tenantId, {
    customerName: params.customerName,
    customerCpf: params.customerCpf,
    customerEmail: params.customerEmail,
  })

  const today = new Date().toISOString().slice(0, 10)

  const payment = await asaasRequest<{ id: string; status: string; creditCard?: { creditCardNumber?: string } }>(
    params.tenantId,
    '/payments',
    {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'CREDIT_CARD',
        value: params.amount,
        dueDate: today,
        creditCardToken: params.creditCardToken,
        remoteIp: params.remoteIp,
        description: `Pedido #${params.orderId.slice(-8).toUpperCase()}`,
        externalReference: params.orderId,
      }),
    }
  )

  // Asaas devolve o status já na criação — CONFIRMED/RECEIVED = aprovado
  // na hora, PENDING = em análise (raro em cartão), e cobrança recusada
  // normalmente vem como erro HTTP (capturado como AsaasError por quem chamar).
  const isApproved = payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'

  return {
    asaasPaymentId: payment.id,
    status: isApproved ? 'approved' : 'pending',
    cardLastDigits: payment.creditCard?.creditCardNumber,
  }
}
