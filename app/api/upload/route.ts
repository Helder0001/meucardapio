// app/api/upload/route.ts
// Upload para Supabase Storage com validação de segurança e processamento de imagens

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { uploadLimiter } from '@/lib/security/rate-limit'

// Magic bytes dos formatos permitidos
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],  // RIFF header
  'image/gif':  [[0x47, 0x49, 0x46, 0x38]],  // GIF8
}

function detectMimeFromBytes(buffer: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    for (const sig of signatures) {
      if (sig.every((byte, i) => buffer[i] === byte)) {
        if (mime === 'image/webp') {
          const webpMarker = buffer.slice(8, 12).toString('ascii')
          if (webpMarker !== 'WEBP') continue
        }
        return mime
      }
    }
  }
  return null
}

// Cliente Supabase com service role (bypass RLS para upload)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'meucardapio'
const MAX_MB = 5

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Rate limit por tenant
  const { success } = await uploadLimiter.limit(session.user.tenantId)
  if (!success) {
    return NextResponse.json({ error: 'Muitos uploads. Aguarde alguns minutos.' }, { status: 429 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Content-Type inválido' }, { status: 415 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Formulário inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const type = (formData.get('type') as string) ?? 'product'

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${MAX_MB}MB.` }, { status: 413 })
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer())

  const detectedMime = detectMimeFromBytes(rawBuffer)
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  if (!detectedMime || !ALLOWED.includes(detectedMime)) {
    return NextResponse.json(
      { error: 'Arquivo inválido. Envie apenas imagens JPG, PNG ou WebP.' },
      { status: 400 }
    )
  }

  let processed: Buffer
  try {
    if (type === 'logo') {
      // Logo: quadrado 400x400
      processed = await sharp(rawBuffer)
        .resize(400, 400, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toBuffer()
    } else if (type === 'cover') {
      // Banner: 1200x400 (proporção 3:1) sem cortar — reduz proporcional se maior
      processed = await sharp(rawBuffer)
        .resize(1200, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
    } else {
      // Produto e outros: máx 800x800 sem cortar
      processed = await sharp(rawBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
    }
  } catch (err) {
    console.error('[upload] Sharp processing error:', err)
    return NextResponse.json({ error: 'Erro ao processar imagem.' }, { status: 400 })
  }

  const fileName = `${session.user.tenantId}/${type}/${nanoid(12)}.webp`

  // Upload para o Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, processed, {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000',
      upsert: false,
    })

  if (uploadError) {
    console.error('[upload] Supabase storage error:', uploadError)
    return NextResponse.json(
      { error: 'Erro ao salvar imagem no storage. Verifique as permissões do bucket.' },
      { status: 500 }
    )
  }

  // Gera URL pública (bucket público)
  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

  return NextResponse.json({ url: publicUrlData.publicUrl })
}
