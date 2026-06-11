// lib/security/sanitize.ts
//
// Sanitização de dados de entrada.
// Previne XSS, Path Traversal, e injeção de caracteres perigosos.
//
// Regra: sanitizar na entrada, escapar na saída.
// O Prisma já previne SQL injection com queries parametrizadas.
// Aqui focamos em XSS e outros vetores.

/**
 * Remove tags HTML e caracteres perigosos de strings.
 * Usar em todos os campos de texto livre (nomes, descrições, observações).
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '')                    // remove < e > (tags HTML)
    .replace(/javascript:/gi, '')            // remove javascript: URIs
    .replace(/on\w+\s*=/gi, '')             // remove event handlers (onclick=, etc.)
    .replace(/data:/gi, '')                  // remove data: URIs
    .replace(/\0/g, '')                      // remove null bytes
    .trim()
    .slice(0, 1000)                          // limite de tamanho
}

/**
 * Sanitiza campos de observações de pedidos (texto livre do cliente).
 * Mais permissivo que sanitizeText mas ainda remove vetores perigosos.
 */
export function sanitizeNotes(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, 200)                           // limite do schema
}

/**
 * Valida e normaliza número de telefone.
 * Aceita apenas dígitos, retorna no formato internacional.
 */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')

  // Aceitar apenas 10-13 dígitos (Brasil: 55 + DDD + número)
  if (digits.length < 10 || digits.length > 13) return null

  // Adicionar prefixo 55 se não tiver
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11 || digits.length === 10) return `55${digits}`

  return digits
}

/**
 * Valida código de cupom (apenas letras maiúsculas e números).
 * Previne injection via código de cupom.
 */
export function sanitizeCouponCode(code: string): string | null {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30)
  return clean.length >= 3 ? clean : null
}

/**
 * Valida que uma URL é segura (apenas http/https, sem javascript:).
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Sanitiza o nome de arquivo para upload.
 * Previne path traversal ('../../../etc/passwd').
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:*?"<>|]/g, '_')   // remove caracteres inválidos
    .replace(/\.\./g, '_')            // remove path traversal
    .replace(/^\./, '_')              // não começar com ponto
    .slice(0, 255)
}

/**
 * Valida que um CUID tem o formato correto.
 * Previne IDOR com IDs manipulados.
 */
export function isValidCuid(id: string): boolean {
  return /^c[a-z0-9]{20,30}$/.test(id)
}

/**
 * Valida cor hexadecimal.
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color)
}
