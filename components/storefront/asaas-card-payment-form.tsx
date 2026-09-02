'use client'
// components/storefront/asaas-card-payment-form.tsx
//
// Pagamento com cartão via Asaas. Diferente do MP (Card Payment Brick) e
// da Efí (Efí.js, tokenização 100% no navegador com chave pública), o
// Asaas não tem chave pública — o token só pode ser gerado com a API Key
// privada da conta. Por isso os dados do cartão vão pro NOSSO proxy
// (/api/orders/[id]/asaas-tokenize-card), que repassa na hora pro Asaas e
// devolve só o token — nunca logamos nem gravamos o cartão em si.

import { useState } from 'react'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/utils/cpf'

interface AsaasCardPaymentFormProps {
  orderId: string
  amount: number
  color: string
  statusToken: string
  onSuccess: (result: { status: string; cardLastDigits?: string }) => void
}

type LoadState = 'ready' | 'submitting'

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function AsaasCardPaymentForm({
  orderId,
  amount,
  color,
  statusToken,
  onSuccess,
}: AsaasCardPaymentFormProps) {
  const [state, setState] = useState<LoadState>('ready')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [cep, setCep] = useState('')
  const [addressNumber, setAddressNumber] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    const cardDigits = onlyDigits(cardNumber)
    const [expMonth, expYear] = expiry.split('/')
    const cepDigits = onlyDigits(cep)

    if (cardDigits.length < 13) return setErrorMessage('Número do cartão inválido.')
    if (!expMonth || !expYear || expYear.length < 2) return setErrorMessage('Informe a validade do cartão (MM/AA).')
    if (!cvv || cvv.length < 3) return setErrorMessage('CVV inválido.')
    if (!cardholderName.trim()) return setErrorMessage('Informe o nome impresso no cartão.')
    if (!isValidCpf(cpf)) return setErrorMessage('CPF inválido.')
    if (!email.includes('@')) return setErrorMessage('E-mail inválido.')
    if (cepDigits.length !== 8) return setErrorMessage('CEP inválido — necessário pro Asaas validar o cartão.')
    if (!addressNumber.trim()) return setErrorMessage('Informe o número do endereço de cobrança.')

    setState('submitting')

    try {
      const tokenRes = await fetch(`/api/orders/${orderId}/asaas-tokenize-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: statusToken,
          holderName: cardholderName.trim(),
          number: cardDigits,
          expiryMonth: expMonth.padStart(2, '0'),
          expiryYear: expYear,
          ccv: cvv,
          customerName: cardholderName.trim(),
          customerCpf: onlyDigits(cpf),
          customerEmail: email,
          customerPostalCode: cepDigits,
          customerAddressNumber: addressNumber.trim(),
        }),
      })

      const tokenData = await tokenRes.json()

      if (!tokenRes.ok) {
        setState('ready')
        setErrorMessage(tokenData.error ?? 'Não foi possível validar o cartão. Confira os dados.')
        return
      }

      const res = await fetch(`/api/orders/${orderId}/pay-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: statusToken,
          cardToken: tokenData.creditCardToken,
          installments: 1,
          paymentMethodId: 'asaas', // não usado pelo Asaas, só satisfaz a validação compartilhada com o fluxo do MP/Efí
          customerEmail: email,
          customerCpf: onlyDigits(cpf),
          customerName: cardholderName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setState('ready')
        setErrorMessage(data.error ?? 'Pagamento não autorizado. Verifique os dados do cartão.')
        return
      }

      if (data.status === 'rejected') {
        setState('ready')
        setErrorMessage('Pagamento recusado pela operadora do cartão. Tente outro cartão.')
        return
      }

      onSuccess({ status: data.status, cardLastDigits: data.cardLastDigits })
    } catch (err: any) {
      setState('ready')
      setErrorMessage('Não foi possível processar o pagamento. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Número do cartão</label>
        <input
          value={formatCardNumber(cardNumber)}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="0000 0000 0000 0000"
          inputMode="numeric"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': color } as any}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Validade</label>
          <input
            value={formatExpiry(expiry)}
            onChange={(e) => setExpiry(e.target.value)}
            placeholder="MM/AA"
            inputMode="numeric"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CVV</label>
          <input
            value={cvv}
            onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
            placeholder="000"
            inputMode="numeric"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Nome impresso no cartão</label>
        <input
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          placeholder="Como está no cartão"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CPF</label>
          <input
            value={formatCpf(cpf)}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">E-mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            type="email"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">CEP</label>
          <input
            value={formatCep(cep)}
            onChange={(e) => setCep(e.target.value)}
            placeholder="00000-000"
            inputMode="numeric"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Número</label>
          <input
            value={addressNumber}
            onChange={(e) => setAddressNumber(e.target.value)}
            placeholder="123"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2"
          />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 -mt-1">CEP e número são exigidos pelo Asaas pra validar a cobrança.</p>

      <button
        type="submit"
        disabled={state === 'submitting'}
        className="w-full py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        {state === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {state === 'submitting' ? 'Processando...' : `Pagar ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
      </button>

      <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
        <ShieldCheck className="w-3 h-3" /> Pagamento processado com segurança pelo Asaas
      </p>
    </form>
  )
}
