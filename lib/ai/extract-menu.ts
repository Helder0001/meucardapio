// lib/ai/extract-menu.ts
//
// Extração de cardápio (foto ou PDF) via IA com visão. Tenta, nessa
// ordem, xAI (Grok) → Groq → OpenAI → Anthropic — a primeira com chave
// configurada e que devolver um JSON válido "vence". Reaproveita o mesmo
// espírito multi-provedor de app/api/ai/generate-description/route.ts.
//
// PDF: só Grok (via upload + Responses API) e Anthropic (nativamente, sem
// upload) leem PDF de verdade. A Groq só faz visão em imagem (sem PDF), e
// a OpenAI, no Chat Completions, também só aceita imagem — por isso PDF
// exige XAI_API_KEY ou ANTHROPIC_API_KEY.

import {
  importedMenuSchema, importedMenuJsonSchema, EXTRACTION_PROMPT,
  type ImportedMenu,
} from './menu-import-schema'

function extractJson(text: string): unknown {
  // Alguns modelos (principalmente sem Structured Outputs nativo) às
  // vezes embrulham o JSON em ```json ... ``` mesmo instruídos a não
  // fazer isso — removemos as cercas se existirem.
  const cleaned = text.replace(/^```json\s*|```\s*$/g, '').trim()
  return JSON.parse(cleaned)
}

// ── xAI (Grok) ───────────────────────────────────────────────────────────
// Modelo configurável via XAI_MODEL — a xAI atualiza/descontinua modelos
// com frequência (ex.: grok-4-1-fast-non-reasoning foi substituído por
// grok-4.6 como recomendação padrão do catálogo em 2026), então travar um
// nome fixo no código quebraria mais cedo ou mais tarde.
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4.6'

async function extractWithXaiImage(base64: string, mimeType: string): Promise<ImportedMenu | null> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) return null

  // Chat Completions da xAI é compatível com o formato da OpenAI,
  // incluindo image_url em base64 e Structured Outputs (response_format).
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: importedMenuJsonSchema },
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[extract-menu] xAI (imagem) erro:', res.status, data)
    return null
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) return null

  const parsed = importedMenuSchema.safeParse(extractJson(content))
  return parsed.success ? parsed.data : null
}

async function extractWithXaiPdf(buffer: Buffer): Promise<ImportedMenu | null> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) return null

  // 1. Upload do PDF via Files API (POST /v1/files, multipart) — a xAI só
  // lê PDF através de um arquivo referenciado por file_id, não aceita
  // base64 inline no Chat Completions.
  const form = new FormData()
  form.append('purpose', 'assistants')
  form.append('expires_after', '3600') // expira em 1h — é só pra essa análise
  // new Uint8Array(buffer) em vez de usar `buffer` direto: com o
  // @types/node do Node 22, Buffer é tipado como Uint8Array<ArrayBufferLike>
  // (o ArrayBufferLike inclui SharedArrayBuffer), que o TypeScript não aceita
  // como BlobPart (que exige especificamente ArrayBuffer). Copiar para um
  // Uint8Array novo resolve — sem custo real aqui, PDF de cardápio é pequeno.
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'cardapio.pdf')

  const uploadRes = await fetch('https://api.x.ai/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  })
  const uploadData = await uploadRes.json()
  if (!uploadRes.ok || !uploadData?.id) {
    console.error('[extract-menu] xAI upload de PDF erro:', uploadRes.status, uploadData)
    return null
  }
  const fileId = uploadData.id as string

  try {
    // 2. Chat com o arquivo anexado, via Responses API (é onde a xAI
    // documenta o suporte a file_id) + Structured Outputs (text.format).
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: XAI_MODEL,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: EXTRACTION_PROMPT },
              { type: 'input_file', file_id: fileId },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: importedMenuJsonSchema.name,
            schema: importedMenuJsonSchema.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(60000),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[extract-menu] xAI (PDF) erro:', res.status, data)
      return null
    }

    // Resposta da Responses API: array `output`, procuramos o item
    // type:"message" e dentro dele o content type:"output_text".
    const messageItem = (data.output ?? []).find((o: any) => o.type === 'message')
    const text = messageItem?.content?.find((c: any) => c.type === 'output_text')?.text
    if (!text) return null

    const parsed = importedMenuSchema.safeParse(extractJson(text))
    return parsed.success ? parsed.data : null
  } finally {
    // Limpa o arquivo temporário — não precisamos guardá-lo depois da análise.
    fetch(`https://api.x.ai/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {})
  }
}

// ── Groq ─────────────────────────────────────────────────────────────────
// Groq só faz visão em imagem (sem suporte a PDF nativo, diferente da xAI
// e da Anthropic) — por isso só entra na extração por foto.
//
// O catálogo de modelos com visão da Groq muda com frequência (o antigo
// meta-llama/llama-4-scout-17b-16e-instruct, por exemplo, foi
// descontinuado) — por isso o modelo é configurável via GROQ_VISION_MODEL.
// Padrão: qwen/qwen3.6-27b (modelo com visão recomendado pela própria Groq
// atualmente — vale checar https://console.groq.com/docs/models se algo
// mudar).
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b'

async function extractWithGroq(base64: string, mimeType: string): Promise<ImportedMenu | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: importedMenuJsonSchema },
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[extract-menu] Groq erro:', res.status, data)
    return null
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) return null

  const parsed = importedMenuSchema.safeParse(extractJson(content))
  return parsed.success ? parsed.data : null
}

// ── OpenAI ───────────────────────────────────────────────────────────────
async function extractWithOpenAI(base64: string, mimeType: string): Promise<ImportedMenu | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: importedMenuJsonSchema },
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[extract-menu] OpenAI erro:', res.status, data)
    return null
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) return null

  const parsed = importedMenuSchema.safeParse(extractJson(content))
  return parsed.success ? parsed.data : null
}

// ── Anthropic ────────────────────────────────────────────────────────────
async function extractWithAnthropic(base64: string, mimeType: string): Promise<ImportedMenu | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const isPdf = mimeType === 'application/pdf'
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: `${EXTRACTION_PROMPT}\n\nSchema JSON esperado:\n${JSON.stringify(importedMenuJsonSchema.schema)}` },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[extract-menu] Anthropic erro:', res.status, data)
    return null
  }

  const text = data?.content?.[0]?.text
  if (!text) return null

  try {
    const parsed = importedMenuSchema.safeParse(extractJson(text))
    return parsed.success ? parsed.data : null
  } catch (err) {
    console.error('[extract-menu] Anthropic devolveu JSON inválido:', err, text)
    return null
  }
}

export async function extractMenuFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<{ menu: ImportedMenu | null; error?: string }> {
  const base64 = buffer.toString('base64')
  const isPdf = mimeType === 'application/pdf'
  const noProviderConfigured = !process.env.XAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY

  if (noProviderConfigured) {
    return { menu: null, error: 'Nenhuma API de IA está configurada (XAI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY).' }
  }

  if (isPdf) {
    // Só Grok (via upload) e Anthropic (nativamente) leem PDF de verdade.
    try {
      const viaXai = await extractWithXaiPdf(buffer)
      if (viaXai) return { menu: viaXai }
    } catch (err) {
      console.error('[extract-menu] Falha xAI (PDF):', err)
    }

    try {
      const viaAnthropic = await extractWithAnthropic(base64, mimeType)
      if (viaAnthropic) return { menu: viaAnthropic }
    } catch (err) {
      console.error('[extract-menu] Falha Anthropic (PDF):', err)
    }

    if (!process.env.XAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return { menu: null, error: 'Importar PDF exige XAI_API_KEY (Grok) ou ANTHROPIC_API_KEY configurada — a OpenAI não lê PDF nessa integração. Envie uma foto do cardápio, ou configure uma dessas chaves.' }
    }
    return { menu: null, error: 'Não conseguimos ler esse PDF. Tente novamente ou envie uma foto do cardápio.' }
  }

  // Imagem: tenta Grok, depois Groq, depois OpenAI, depois Anthropic
  for (const extract of [
    () => extractWithXaiImage(base64, mimeType),
    () => extractWithGroq(base64, mimeType),
    () => extractWithOpenAI(base64, mimeType),
    () => extractWithAnthropic(base64, mimeType),
  ]) {
    try {
      const menu = await extract()
      if (menu) return { menu }
    } catch (err) {
      console.error('[extract-menu] Falha num provedor:', err)
    }
  }

  return { menu: null, error: 'Não conseguimos identificar produtos nessa imagem. Tente uma foto mais nítida do cardápio.' }
}
