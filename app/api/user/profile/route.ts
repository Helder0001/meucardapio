// app/api/user/profile/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  name:  z.string().min(2).max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
})

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name:  parsed.data.name,
      phone: parsed.data.phone || null,
    },
  })

  return NextResponse.json({ success: true })
}
