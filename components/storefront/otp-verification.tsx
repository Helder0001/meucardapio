'use client'
// components/storefront/otp-verification.tsx
// Modal de verificação do telefone via OTP antes do primeiro pedido

import { useState, useRef, useEffect } from 'react'
import { Loader2, MessageCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { formatPhone } from '@/lib/utils/format'

interface OtpVerificationProps {
  phone:    string
  tenantId: string
  onVerified: () => void
  onBack:     () => void
}

export function OtpVerification({ phone, tenantId, onVerified, onBack }: OtpVerificationProps) {
  const [step,       setStep]       = useState<'send' | 'verify' | 'done'>('send')
  const [code,       setCode]       = useState(['', '', '', '', '', ''])
  const [isSending,  setIsSending]  = useState(false)
  const [isVerifying,setIsVerifying]= useState(false)
  const [error,      setError]      = useState('')
  const [resendIn,   setResendIn]   = useState(0)
  const [devCode,    setDevCode]    = useState('')  // apenas em desenvolvimento
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  // Countdown para reenvio
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((v) => v - 1), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  const sendOTP = async () => {
    setIsSending(true)
    setError('')
    try {
      const res  = await fetch('/api/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, tenantId }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error ?? 'Erro ao enviar código'); return }

      if (data.alreadyVerified) { onVerified(); return }

      // Dev: mostrar código na tela
      if (data.devCode) setDevCode(data.devCode)

      setStep('verify')
      setResendIn(60)
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsSending(false)
    }
  }

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newCode = [...code]
    newCode[index] = value.slice(-1)
    setCode(newCode)
    setError('')

    // Auto-avançar para próximo campo
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    // Auto-verificar quando completo
    if (value && index === 5) {
      const full = [...newCode.slice(0, 5), value].join('')
      if (full.length === 6) verifyOTP(full)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setCode(pasted.split(''))
      verifyOTP(pasted)
    }
  }

  const verifyOTP = async (fullCode: string) => {
    setIsVerifying(true)
    setError('')
    try {
      const res  = await fetch('/api/otp/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, tenantId, code: fullCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Código incorreto')
        setCode(['', '', '', '', '', ''])
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
        return
      }

      setStep('done')
      setTimeout(onVerified, 1200)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsVerifying(false)
    }
  }

  // ── Tela de sucesso ──────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center">
          <p className="font-bold text-foreground text-lg">Verificado!</p>
          <p className="text-muted-foreground text-sm mt-1">
            Telefone confirmado com sucesso
          </p>
        </div>
      </div>
    )
  }

  // ── Tela de envio ────────────────────────────────────────────────────────
  if (step === 'send') {
    return (
      <div className="p-5 space-y-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="font-bold text-foreground text-lg mb-1">Verificar telefone</h2>
          <p className="text-muted-foreground text-sm">
            Enviaremos um código de 6 dígitos via WhatsApp para
          </p>
          <p className="font-semibold text-foreground mt-1">{formatPhone(phone)}</p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <button
          onClick={sendOTP}
          disabled={isSending}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60"
        >
          {isSending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : '📱 Enviar código'}
        </button>
      </div>
    )
  }

  // ── Tela de inserção do código ────────────────────────────────────────────
  return (
    <div className="p-5 space-y-5">
      <button onClick={() => { setStep('send'); setCode(['','','','','','']); setError('') }}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="text-center">
        <h2 className="font-bold text-foreground text-lg mb-1">Digite o código</h2>
        <p className="text-muted-foreground text-sm">
          Código enviado para <span className="font-medium text-foreground">{formatPhone(phone)}</span>
        </p>
        {devCode && (
          <p className="mt-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
            🔧 Dev: código é <strong>{devCode}</strong>
          </p>
        )}
      </div>

      {/* Inputs de 6 dígitos */}
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl bg-background focus:outline-none transition-all ${
              digit
                ? 'border-primary text-foreground'
                : 'border-input text-muted-foreground'
            } ${isVerifying ? 'opacity-60' : ''}`}
            disabled={isVerifying}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive text-center">
          {error}
        </div>
      )}

      {isVerifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando...
        </div>
      )}

      {/* Reenviar */}
      <div className="text-center">
        {resendIn > 0 ? (
          <p className="text-sm text-muted-foreground">
            Reenviar em {resendIn}s
          </p>
        ) : (
          <button
            onClick={sendOTP}
            disabled={isSending}
            className="text-sm text-primary hover:underline disabled:opacity-60"
          >
            {isSending ? 'Enviando...' : 'Não recebeu? Reenviar código'}
          </button>
        )}
      </div>
    </div>
  )
}
