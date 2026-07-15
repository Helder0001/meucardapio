// lib/efi/tenant-client.ts
//
// Diferente do lib/efi/client.ts (que é da PLATAFORMA, usado só pra
// cobrança recorrente do plano PRO), este helper valida as credenciais
// que um TENANT cadastra pra receber PIX/cartão dos próprios clientes na
// própria conta Efí dele. A Efí não tem OAuth pra plataformas terceiras
// (diferente do MP/Stripe) — o tenant cola aqui o Client ID e Client
// Secret que ele mesmo gerou no painel da conta Efí dele.

interface ValidateParams {
  clientId: string
  clientSecret: string
  sandbox: boolean
}

/**
 * Tenta autenticar com as credenciais informadas, só pra confirmar que são
 * válidas ANTES de salvar — evita guardar um client_id/secret errado sem o
 * tenant saber, só descobrindo depois quando o primeiro PIX falhar.
 */
export async function validateEfiCredentials(params: ValidateParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = params.sandbox
    ? 'https://cobrancas-h.api.efipay.com.br'
    : 'https://cobrancas.api.efipay.com.br'

  const basicAuth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64')

  try {
    const res = await fetch(`${baseUrl}/v1/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.warn('[efi][tenant] credenciais inválidas na validação', { status: res.status, body: body.slice(0, 300) })
      return {
        ok: false,
        error: res.status === 401
          ? 'Client ID ou Client Secret incorretos.'
          : 'Não foi possível validar as credenciais com a Efí. Tente novamente.',
      }
    }

    return { ok: true }
  } catch (err) {
    console.error('[efi][tenant] erro ao validar credenciais', String(err))
    return { ok: false, error: 'Erro ao conectar com a Efí. Tente novamente.' }
  }
}
