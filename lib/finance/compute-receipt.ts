// lib/finance/compute-receipt.ts
//
// Fluxo de recebimentos — calcula fee (taxa), netAmount (valor líquido) e
// expectedReceiptDate (data prevista) na hora que um pagamento é confirmado.
//
// A fonte do dado muda por provedor:
//
//   Mercado Pago e Asaas → a própria API JÁ devolve o valor líquido real e
//   a data de liberação (transaction_details.net_received_amount +
//   money_release_date no MP; netValue + estimatedCreditDate no Asaas).
//   Isso é extraído DIRETO no webhook de cada provedor — não passa por
//   esta função, porque não tem por que estimar algo que o provedor já
//   está nos dizendo com precisão.
//
//   Efí e maquininha física → nenhum dos dois devolve taxa/data de
//   liberação pra gente (a Efí não manda isso na API de PIX/cartão; a
//   maquininha física nem fala com nosso sistema). Por isso essas taxas
//   e prazos são CONFIGURADOS pelo próprio tenant em
//   /dashboard/financeiro (ver actions/settings/save-finance-rates.ts) —
//   nada fica chumbado no código, porque taxa negociada varia de conta
//   pra conta e muda com o tempo. Se o tenant não configurou a taxa de
//   um método ainda, o cálculo fica null de propósito (melhor mostrar
//   "não configurado" do que inventar um número).
//
//   Pix Chave (PIX_MANUAL) e Dinheiro → nunca passam por gateway nenhum,
//   então não tem taxa de processamento nenhuma pra calcular. D+0 sempre,
//   independente de qualquer configuração.

export interface ReceiptInfo {
  fee: number | null
  netAmount: number | null
  expectedReceiptDate: Date | null
}

// Espelha o shape salvo em tenant.settings.financeRates — ver
// actions/settings/save-finance-rates.ts. Todos os campos são % (rate) e
// dias corridos (days) até o dinheiro cair pra o tenant.
export interface FinanceRatesConfig {
  efiPixRate?: number;           efiPixDays?: number
  efiCard1xRate?: number;        efiCard1xDays?: number
  efiCard2to6Rate?: number;      efiCard2to6Days?: number
  efiCard7to12Rate?: number;     efiCard7to12Days?: number
  maquininhaCreditoRate?: number; maquininhaCreditoDays?: number
  maquininhaDebitoRate?: number;  maquininhaDebitoDays?: number
}

const INSTANT_NO_FEE_METHODS = new Set(['PIX_MANUAL', 'CASH'])
const NOT_CONFIGURED: ReceiptInfo = { fee: null, netAmount: null, expectedReceiptDate: null }

export function computeReceiptInfo(
  method: string,
  amount: number,
  paidAt: Date,
  config: FinanceRatesConfig,
  provider?: string | null,
  installments?: number | null,
): ReceiptInfo {
  if (INSTANT_NO_FEE_METHODS.has(method)) {
    return { fee: 0, netAmount: amount, expectedReceiptDate: paidAt }
  }

  if (provider === 'EFI' && method === 'PIX') {
    return applyRate(amount, paidAt, config.efiPixRate, config.efiPixDays)
  }

  if (provider === 'EFI' && method === 'CREDIT_CARD') {
    const n = installments ?? 1
    if (n <= 1)  return applyRate(amount, paidAt, config.efiCard1xRate,    config.efiCard1xDays)
    if (n <= 6)  return applyRate(amount, paidAt, config.efiCard2to6Rate,  config.efiCard2to6Days)
    return applyRate(amount, paidAt, config.efiCard7to12Rate, config.efiCard7to12Days)
  }

  if (method === 'CREDIT_CARD_MANUAL') {
    return applyRate(amount, paidAt, config.maquininhaCreditoRate, config.maquininhaCreditoDays)
  }
  if (method === 'DEBIT_CARD') {
    return applyRate(amount, paidAt, config.maquininhaDebitoRate, config.maquininhaDebitoDays)
  }

  // MP e Asaas não passam por aqui (resolvidos com dado real no próprio
  // webhook) — e qualquer método/provedor não coberto acima fica
  // "não configurado" em vez de inventar um número.
  return NOT_CONFIGURED
}

function applyRate(amount: number, paidAt: Date, ratePercent?: number, days?: number): ReceiptInfo {
  if (ratePercent === undefined || days === undefined) return NOT_CONFIGURED
  const fee = round2(amount * (ratePercent / 100))
  return {
    fee,
    netAmount: round2(amount - fee),
    // CORREÇÃO: o prazo configurado (ex.: "31 dias") é sempre em DIAS
    // ÚTEIS — antes isso somava dias corridos direto (paidAt + days*24h),
    // o que adianta a data prevista sempre que o intervalo cruza um fim de
    // semana ou feriado nacional. addBusinessDays pula sábado, domingo e
    // feriado nacional ao contar.
    expectedReceiptDate: addBusinessDays(paidAt, days),
  }
}

// --- Feriados nacionais ---------------------------------------------
// CORREÇÃO: addBusinessDays só pulava sábado/domingo — um D+1 caindo em
// feriado (ex.: sexta véspera de feriado na segunda) contava normalmente,
// adiantando a Data do Crédito em relação ao que o gateway/maquininha
// real credita. Cobre só feriados NACIONAIS (fixos + móveis, calculados a
// partir da Páscoa) — feriados estaduais/municipais e pontos facultativos
// variam por cidade/ano e ficam fora do escopo (não tem fonte confiável
// única pra isso sem depender de um serviço externo por tenant).

// Domingo de Páscoa do ano (algoritmo de Meeus/Jones/Butcher, calendário
// gregoriano) — a partir dele derivamos Carnaval, Sexta-feira Santa e
// Corpus Christi, que mudam de data todo ano.
function easterUTC(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day)
}

const DAY_MS = 24 * 60 * 60 * 1000
const holidayCache = new Map<number, Set<string>>()

function ymd(utcMs: number): string {
  const d = new Date(utcMs)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function nationalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const set = new Set<string>()
  const addFixed = (m: number, d: number) => set.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  addFixed(1, 1)   // Confraternização Universal
  addFixed(4, 21)  // Tiradentes
  addFixed(5, 1)   // Dia do Trabalho
  addFixed(9, 7)   // Independência do Brasil
  addFixed(10, 12) // Nossa Senhora Aparecida
  addFixed(11, 2)  // Finados
  addFixed(11, 15) // Proclamação da República
  addFixed(11, 20) // Consciência Negra — feriado nacional desde 2024 (Lei 14.759/2023)
  addFixed(12, 25) // Natal

  const easter = easterUTC(year)
  set.add(ymd(easter - 47 * DAY_MS)) // Carnaval (terça-feira)
  set.add(ymd(easter - 2 * DAY_MS))  // Sexta-feira Santa
  set.add(ymd(easter + 60 * DAY_MS)) // Corpus Christi

  holidayCache.set(year, set)
  return set
}

function isNationalHoliday(year: number, month: number, day: number): boolean {
  return nationalHolidays(year).has(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

// Soma `days` DIAS ÚTEIS a partir de `start` (pula sábado, domingo e
// feriado nacional).
//
// CORREÇÃO: getDay()/setDate() do JS operam no fuso do SERVIDOR (UTC na
// Vercel), não no horário de Brasília. Uma venda feita à noite em SP já
// virou o dia seguinte em UTC — ex.: sexta 23:26 em SP é sábado 02:26 em
// UTC — então o loop começava contando a partir de sábado (quando pro
// negócio/cliente ainda era sexta), adiantando ou atrasando a Data do
// Crédito em 1 dia perto da virada. Agora extraímos o Y-M-D já em horário
// de SP antes de começar a contar, e só remontamos o Date final (com o
// mesmo horário original, também em SP) depois de achar o dia útil certo.
function addBusinessDays(start: Date, days: number): Date {
  const SP_TZ = 'America/Sao_Paulo'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(start)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const y = Number(get('year')), m = Number(get('month')), d = Number(get('day'))
  const hh = get('hour'), mm = get('minute'), ss = get('second')

  // Data.UTC aqui é só uma calculadora de calendário (Y-M-D civil de SP)
  // — não representa nenhum instante real; por isso getUTCDay/setUTCDate,
  // pra não sofrer o mesmo problema de fuso que este código está corrigindo.
  const cursor = new Date(Date.UTC(y, m - 1, d))
  let remaining = days
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const weekday = cursor.getUTCDay() // 0 = domingo, 6 = sábado
    const isWeekend = weekday === 0 || weekday === 6
    const isHoliday = !isWeekend && isNationalHoliday(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())
    if (!isWeekend && !isHoliday) remaining--
  }

  const yy = cursor.getUTCFullYear()
  const mo = String(cursor.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(cursor.getUTCDate()).padStart(2, '0')
  return new Date(`${yy}-${mo}-${dd}T${hh}:${mm}:${ss}-03:00`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
