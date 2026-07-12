// lib/utils/cpf.ts
//
// Validação e formatação de CPF — usado para coletar o CPF real do
// pagador antes de gerar um PIX direto (API do Mercado Pago), evitando
// a rejeição por compliance do Bacen quando o CPF declarado não bate
// com quem realmente pagou (ver commit "device-id"/discussão sobre
// "Pagamento rejeitado pelo PSP do recebedor").

/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Formata "12345678909" → "123.456.789-09". Aceita entrada parcial (digitando). */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// BUG: todo pagamento PIX da plataforma (qualquer tenant, qualquer
// cliente) mandava pro Mercado Pago o mesmo e-mail fixo de pagador
// ('cliente@meucardapio.app') — só o CPF tinha sido corrigido antes.
// Pro antifraude do MP, ver o mesmíssimo "pagador" fazendo PIX pra
// dezenas de contas recebedoras diferentes é um padrão clássico de
// fraude/lavagem (mula), e tende a aumentar a taxa de recusa conforme
// o volume de tenants/clientes cresce. Como não coletamos e-mail real do
// cliente final (só CPF/telefone), geramos um e-mail único e estável por
// CPF — mesmo cliente sempre cai no mesmo endereço, mas nunca é
// compartilhado entre clientes diferentes.
export function pixPayerEmail(cpf: string): string {
  const digits = onlyDigits(cpf)
  return `pix.${digits || 'sem-cpf'}@meucardapio.app`
}

/**
 * Valida CPF pelos dígitos verificadores (algoritmo oficial da Receita
 * Federal). Rejeita sequências repetidas (000.000.000-00, 111.111.111-11,
 * etc.), que passam no cálculo dos dígitos mas nunca são CPFs reais.
 */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const calcDigit = (base: string, factor: number): number => {
    let sum = 0
    for (const char of base) {
      sum += parseInt(char, 10) * factor
      factor--
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  const digit1 = calcDigit(cpf.slice(0, 9), 10)
  if (digit1 !== parseInt(cpf[9], 10)) return false

  const digit2 = calcDigit(cpf.slice(0, 10), 11)
  if (digit2 !== parseInt(cpf[10], 10)) return false

  return true
}
