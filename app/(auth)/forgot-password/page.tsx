// app/(auth)/forgot-password/page.tsx
import { ForgotPasswordForm } from './forgot-password-form'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Recuperar senha' }

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <span className="font-semibold text-lg text-foreground">FoodSaaS</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-1">Esqueceu a senha?</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Informe seu email e enviaremos um link para redefinir sua senha.
        </p>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Lembrou a senha?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
