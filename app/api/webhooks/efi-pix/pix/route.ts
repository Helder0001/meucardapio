// app/api/webhooks/efi-pix/pix/route.ts
//
// Handler REAL do webhook Pix da Efí. Path com /pix no final não é
// escolha nossa — é convenção do próprio padrão Pix do Banco Central
// (https://github.com/bacen/pix-api): toda PSP notifica em
// "{url_cadastrada}/pix", sempre. A gente registra
// "{NEXT_PUBLIC_APP_URL}/api/webhooks/efi-pix" (sem sufixo — ver
// lib/efi/tenant-pix-client.ts configurePixWebhook) e a Efí soma o "/pix"
// sozinha na hora de notificar, batendo com esse arquivo aqui.
//
// Webhook de Cobranças (app/api/webhooks/efi/route.ts, usado só pela
// assinatura da plataforma) é uma API diferente e não segue essa
// convenção — lá a Efí manda só um token e a gente consulta os detalhes
// depois; aqui o conteúdo já vem completo no corpo do POST.
//
// Registrado com x-skip-mtls-checking: true (ver lib/efi/tenant-pix-client.ts
// configurePixWebhook), então chega como POST HTTPS normal, sem exigir
// certificado cliente do nosso lado — ou seja, o corpo do POST recebido
// aqui NÃO é autenticado de forma alguma.
//
// VULN-CRIT-01 CORRIGIDO: como o corpo do POST não é autenticado, ele
// nunca é usado como fonte de verdade pra marcar um pagamento como PAID
// — serve só de sinal pra saber qual txid consultar. A confirmação real
// (status + valor pago) é sempre buscada com uma chamada autenticada à
// API da Efí. Ver lib/efi/pix-webhook-handler.ts.

import { NextRequest, NextResponse } from 'next/server'
import { processEfiPixWebhookEntries, type PixWebhookEntry } from '@/lib/efi/pix-webhook-handler'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const entries: PixWebhookEntry[] = body?.pix ?? []

  if (entries.length) {
    await processEfiPixWebhookEntries(entries)
  }

  return NextResponse.json({ ok: true })
}
