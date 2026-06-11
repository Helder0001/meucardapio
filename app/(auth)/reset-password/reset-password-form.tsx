'use client'
// app/(auth)/reset-password/reset-password-form.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { resetPasswordAction } from '@/actions/auth/reset-password'
import { useState } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Salvando...' : 'Definir nova senha'}
    </button>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [showPwd, setShowPwd] = useState(false)
  const [state, action]       = useFormState(resetPasswordAction, {})

  if (state.success) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Senha redefinida!</p>
          <p className="text-sm text-muted-foreground mb-4">
            Sua senha foi alterada com sucesso.
          </p>
          <Link href="/login"
            className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            Fazer login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
        <div className="relative">
          <input name="password" type={showPwd ? 'text' : 'password'} required minLength={8}
            placeholder="Mínimo 8 caracteres"
            className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {state.errors?.password && (
          <p className="mt-1 text-xs text-destructive">{state.errors.password[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar senha</label>
        <input name="confirmPassword" type={showPwd ? 'text' : 'password'} required
          placeholder="Repita a nova senha"
          className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        {state.errors?.confirmPassword && (
          <p className="mt-1 text-xs text-destructive">{state.errors.confirmPassword[0]}</p>
        )}
      </div>

      <SubmitBtn />
    </form>
  )
}
