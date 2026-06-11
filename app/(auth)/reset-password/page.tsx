// app/(auth)/reset-password/page.tsx
import { ResetPasswordForm } from './reset-password-form'
import { prisma } from '@/lib/db/client'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Redefinir senha' }

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  // Verificar se o token existe e não expirou
  let tokenValid = false
  let userId: string | undefined

  if (token) {
    const record = await prisma.user.findFirst({
      where: {
        refreshTokenHash: token,
        passwordChangedAt: null,
      },
      select: { id: true },
    })
    if (record) {
      tokenValid = true
      userId = record.id
    }
  }

  if (!token || !tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-foreground mb-2">Link inválido ou expirado</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Este link de recuperação não é válido ou já foi utilizado.
          </p>
          <Link href="/forgot-password"
            className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <span className="font-semibold text-lg text-foreground">FoodSaaS</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1">Nova senha</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Escolha uma senha forte com pelo menos 8 caracteres.
        </p>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  )
}