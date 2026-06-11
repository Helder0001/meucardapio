'use client'
// app/(auth)/forgot-password/forgot-password-form.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { forgotPasswordAction } from '@/actions/auth/forgot-password'
import { Loader2, CheckCircle2 } from 'lucide-react'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Enviando...' : 'Enviar link de recuperação'}
    </button>
  )
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState(forgotPasswordAction, {})

  if (state.success) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Email enviado!</p>
          <p className="text-sm text-muted-foreground">
            Se este email estiver cadastrado, você receberá um link em instantes.
            Verifique também a caixa de spam.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
        <input name="email" type="email" required autoFocus
          placeholder="seu@email.com"
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <SubmitBtn />
    </form>
  )
}
