'use client'

// app/(auth)/login/login-form.tsx
// VULN-CRIT-05 CORRIGIDO: adicionada a 2ª etapa de login (código
// TOTP/backup) para contas com MFA ativado — antes o formulário só
// existia com email+senha e o backend nunca pedia o código.

import { useFormState, useFormStatus } from 'react-dom'
import { loginAction, mfaLoginAction } from '@/actions/auth/login'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

// Botão que desabilita automaticamente enquanto o form está enviando
function SubmitButton({ label = 'Entrar' }: { label?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Entrando...
        </>
      ) : (
        label
      )}
    </button>
  )
}

interface LoginFormProps {
  callbackUrl?: string
  urlError?: string
}

export function LoginForm({ callbackUrl, urlError }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cadastroOk = searchParams.get('cadastro') === 'ok'
  const [showPassword, setShowPassword] = useState(false)
  const [state, formAction] = useFormState(loginAction, {})
  const [mfaState, mfaFormAction] = useFormState(mfaLoginAction, {})

  // Fallback: se o signIn retornar success mas não redirecionar (ex: AUTH_TRUST_HOST ausente),
  // forçamos a navegação pelo cliente.
  useEffect(() => {
    if (state.success || mfaState.success) {
      router.push(callbackUrl || '/dashboard')
      router.refresh()
    }
  }, [state.success, mfaState.success, callbackUrl, router])

  const showMfaStep = Boolean(state.mfaRequired || mfaState.mfaRequired)
  const mfaToken = mfaState.mfaToken ?? state.mfaToken

  const generalError = state.errors?.general?.[0] ?? urlError

  // ── Etapa 2: pedir o código TOTP/backup ──────────────────────────
  if (showMfaStep && mfaToken) {
    return (
      <form action={mfaFormAction} className="space-y-4">
        {callbackUrl && (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        )}
        <input type="hidden" name="mfaToken" value={mfaToken} />

        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm text-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span>Digite o código do seu app autenticador (ou um código de backup).</span>
        </div>

        {mfaState.errors?.code && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {mfaState.errors.code[0]}
          </div>
        )}

        <div>
          <label htmlFor="code" className="block text-sm font-medium text-foreground mb-1.5">
            Código de verificação
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
          />
        </div>

        <SubmitButton label="Verificar" />

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Voltar para o login
        </button>
      </form>
    )
  }

  // ── Etapa 1: email + senha ──────────────────────────────────────
  return (
    <form action={formAction} className="space-y-4">
      {/* Campo escondido para redirecionar após login */}
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      {/* Sucesso: veio do cadastro */}
      {cadastroOk && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          ✅ Conta criada com sucesso! Faça login para acessar o painel.
        </div>
      )}

      {/* Erro geral */}
      {generalError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {generalError}
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="voce@exemplo.com"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
          aria-describedby={state.errors?.email ? 'email-error' : undefined}
        />
        {state.errors?.email && (
          <p id="email-error" className="mt-1 text-xs text-destructive">
            {state.errors.email[0]}
          </p>
        )}
      </div>

      {/* Senha */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Senha
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-primary hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
            aria-describedby={state.errors?.password ? 'password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {state.errors?.password && (
          <p id="password-error" className="mt-1 text-xs text-destructive">
            {state.errors.password[0]}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  )
}
