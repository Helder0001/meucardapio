// app/api/ai/import-menu/route.ts
//
// Recebe uma foto ou PDF do cardápio, manda pra IA analisar e devolve uma
// PRÉVIA (categorias + produtos identificados) — NÃO grava nada no banco
// ainda. A gravação de verdade só acontece em /api/ai/import-menu/confirm,
// depois que o usuário revisar/editar/desmarcar itens na tela de prévia.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { aiImportLimiter } from '@/lib/security/rate-limit'
import { extractMenuFromFile } from '@/lib/ai/extract-menu'

const MAX_MB = 15
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { success } = await aiImportLimiter.limit(session.user.tenantId)
  if (!success) {
    return NextResponse.json({ error: 'Muitas análises seguidas. Aguarde um pouco e tente de novo.' }, { status: 429 })
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
  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${MAX_MB}MB.` }, { status: 413 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'Envie uma imagem (JPG, PNG, WebP) ou um PDF.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { menu, error } = await extractMenuFromFile(buffer, file.type)

  if (!menu) {
    return NextResponse.json({ error: error ?? 'Não conseguimos analisar esse arquivo.' }, { status: 502 })
  }

  const totalProducts = menu.categories.reduce((sum, c) => sum + c.products.length, 0)

  return NextResponse.json({ menu, totalProducts })
}
