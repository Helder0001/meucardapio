// lib/pix/manual-pix.ts
//
// Gera o "Pix Copia e Cola" (BR Code, padrão EMV do Bacen) e o respectivo
// QR Code a partir da CHAVE PIX do próprio estabelecimento — sem passar
// por nenhum gateway (Mercado Pago/Efí). O pagamento é confirmado
// MANUALMENTE pelo lojista depois de receber o comprovante (ver
// app/api/orders/[id]/mark-paid).
//
// Referência do formato: manual do Bacen "QR Codes do arranjo Pix"
// (BR Code / EMV-MPM).

import QRCode from 'qrcode'

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'

// Monta um campo TLV: ID (2 dígitos) + tamanho (2 dígitos) + valor
function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0')
  return `${id}${length}${value}`
}

// CRC16-CCITT (falso), padrão exigido pelo Bacen no campo final do payload
function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Remove acentos e caracteres que o padrão EMV não aceita em nome/cidade
// (a especificação exige apenas ASCII básico nesses campos)
function sanitizeAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
}

// Normaliza a chave conforme o tipo — o payload exige o valor "cru", sem
// máscara (CPF/CNPJ só dígitos, telefone com +55, etc.)
export function normalizePixKey(key: string, type: PixKeyType): string {
  const digits = key.replace(/\D/g, '')
  switch (type) {
    case 'CPF':
    case 'CNPJ':
      return digits
    case 'PHONE':
      // Formato exigido: +5511999999999
      if (key.trim().startsWith('+')) return key.trim()
      return `+55${digits}`
    case 'EMAIL':
      return key.trim().toLowerCase()
    case 'RANDOM':
    default:
      return key.trim()
  }
}

interface BuildPixPayloadParams {
  key: string
  keyType: PixKeyType
  receiverName: string   // nome do favorecido — máx. 25 chars
  city: string            // cidade do favorecido — máx. 15 chars
  amount: number          // valor do pedido
  txid: string            // identificador (ex.: orderId) — só alfanumérico, máx. 25 chars
}

// Monta o payload completo do Pix Copia e Cola (estático, com valor fixo)
export function buildPixPayload({ key, keyType, receiverName, city, amount, txid }: BuildPixPayloadParams): string {
  const normalizedKey = normalizePixKey(key, keyType)
  const name = sanitizeAscii(receiverName).slice(0, 25) || 'ESTABELECIMENTO'
  const cityName = sanitizeAscii(city).slice(0, 15) || 'BRASIL'
  const referenceLabel = (txid.replace(/[^A-Za-z0-9]/g, '') || '***').slice(0, 25)

  const merchantAccountInfo = tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizedKey))

  let payload =
    tlv('00', '01') +               // Payload Format Indicator
    tlv('01', '11') +               // Point of Initiation Method (11 = estático)
    merchantAccountInfo +
    tlv('52', '0000') +             // Merchant Category Code
    tlv('53', '986') +              // Moeda (BRL)
    tlv('54', amount.toFixed(2)) +  // Valor da transação
    tlv('58', 'BR') +               // País
    tlv('59', name) +               // Nome do favorecido
    tlv('60', cityName) +           // Cidade do favorecido
    tlv('62', tlv('05', referenceLabel)) // Dados adicionais (txid)

  payload += '6304' // ID + tamanho do CRC (o valor em si vem a seguir)
  return payload + crc16(payload)
}

// Gera a imagem do QR Code em base64 (sem o prefixo "data:image/png;base64,",
// pra ficar no mesmo formato que os outros campos `pixQrCodeBase64` já
// salvos no banco pelos fluxos de Mercado Pago/Efí)
export async function generatePixQrCodeBase64(payload: string): Promise<string> {
  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
  })
  return buffer.toString('base64')
}

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Chave aleatória',
}
