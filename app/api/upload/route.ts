// app/api/upload/route.ts
// VULN-09 CORRIGIDO: validação por magic bytes (não apenas Content-Type declarado)
// VULN-04 já coberto pelo middleware (limite 6MB para uploads)

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { sanitizeFilename } from '@/lib/security/sanitize'
import { uploadLimiter } from '@/lib/security/rate-limit'

// Magic bytes dos formatos permitidos
// Um atacante pode falsificar o Content-Type mas não os bytes iniciais do arquivo
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
        // Validação extra para WebP: bytes 8-11 devem ser "WEBP"
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

const s3 = new S3Client({
  region:   process.env.S3_REGION ?? 'auto',
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY_ID     ?? 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin123',
  },
  forcePathStyle: true,
})

const BUCKET  = process.env.S3_BUCKET_NAME ?? 'foodsaas-uploads'
const CDN     = process.env.NEXT_PUBLIC_CDN_URL ?? 'http://localhost:9000/foodsaas-uploads'
const MAX_MB  = 5

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

  // VULN-11: verificar Content-Type da requisição
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

  // Ler os primeiros bytes para validação
  const rawBuffer = Buffer.from(await file.arrayBuffer())

  // VULN-09 CORRIGIDO: detectar tipo real pelos magic bytes, não pelo Content-Type
  const detectedMime = detectMimeFromBytes(rawBuffer)
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  if (!detectedMime || !ALLOWED.includes(detectedMime)) {
    return NextResponse.json(
      { error: 'Arquivo inválido. Envie apenas imagens JPG, PNG ou WebP.' },
      { status: 400 }
    )
  }

  // Processar com Sharp (redimensionar e converter para WebP)
  let processed: Buffer
  try {
    const dimensions = type === 'logo' ? { width: 400, height: 400 } : { width: 800, height: 600 }
    processed = await sharp(rawBuffer)
      .resize(dimensions.width, dimensions.height, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Erro ao processar imagem.' }, { status: 400 })
  }

  const fileName = `${session.user.tenantId}/${type}/${nanoid(12)}.webp`

  try {
    await s3.send(new PutObjectCommand({
      Bucket:       BUCKET,
      Key:          fileName,
      Body:         processed,
      ContentType:  'image/webp',
      CacheControl: 'public, max-age=31536000',
    }))
  } catch (err) {
    console.error('[upload] S3 error:', err)
    return NextResponse.json({ error: 'Erro ao salvar imagem.' }, { status: 500 })
  }

  return NextResponse.json({ url: `${CDN}/${fileName}` })
}
