// app/api/user/change-password/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { verifyPassword, hashPassword } from '@/lib/auth/password'
import { z } from 'zod'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  })
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })

  const newHash = await hashPassword(parsed.data.newPassword)
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash:        newHash,
      passwordChangedAt:   new Date(),
      failedLoginCount:    0,
    },
  })

  return NextResponse.json({ success: true })
}
