// app/api/webhooks/efi-pix/route.ts
//
// Webhook da API PIX da Efí (cobrança avulsa dos tenants) — DIFERENTE do
// webhook de Cobranças (app/api/webhooks/efi/route.ts, usado só pela
// assinatura da plataforma): aqui a Efí manda o conteúdo direto no corpo
// do POST, sem token pra consultar depois.
//
// Na prática, a Efí sempre notifica em "{url_cadastrada}/pix" (ver
// comentário em app/api/webhooks/efi-pix/pix/route.ts), então esse
// endpoint aqui (sem o sufixo) não deveria receber tráfego real da Efí —
// mas ele fica registrado e publicamente acessível de qualquer forma, e
// por isso recebe exatamente a mesma correção de segurança do outro.
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
