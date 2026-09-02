// lib/messaging/chatbot-engine.ts
//
// Robô de atendimento do WhatsApp ("Automações do Chat").
//
// REGRA DE OURO — nunca conflitar com o operador manual:
//   1. Toda vez que um operador manda mensagem pelo dashboard
//      (app/api/whatsapp/chats/[chatId]/send/route.ts) o chat é marcado com
//      botActive=false. O robô fica mudo nesse chat até ser reativado.
//   2. Se o cliente pedir "falar com atendente" (opção 3), o próprio robô se
//      desativa (botActive=false, awaitingAttendant=true) e notifica o
//      dashboard — quem responde a partir daí é sempre o humano.
//   3. Se a Evolution API entregar um evento de mensagem ENVIADA pelo próprio
//      número do restaurante fora do nosso app (ex.: dono respondeu direto
//      pelo celular), tratamos como intervenção manual e pausamos o robô
//      também (ver app/api/webhooks/evolution/route.ts, msg.key.fromMe).
//   4. O "comando de encerramento" (ex.: "encerrar") é a única coisa que o
//      robô sempre escuta, mesmo pausado — é o jeito do cliente devolver a
//      conversa pro modo automático.
//
// Ou seja: o robô só fala quando NINGUÉM humano (operador OU o próprio
// cliente pedindo atendente) estiver com a "posse" da conversa.

import { prisma } from '@/lib/db/client'
import { buildTemplateVariables, renderTemplate } from './template-variables'

export interface ChatbotSettingsData {
  enabled: boolean
  welcomeActive: boolean
  welcomeMode: 'ALWAYS' | 'NEW_CUSTOMERS_ONLY' | string
  welcomeMessage: string
  menuAutoSendActive: boolean
  menuAutoSendMessage: string
  optionsMessage: string
  fallbackActive: boolean
  fallbackMessage: string
  attendantMessage: string
  blockAutoTransferToAttendant: boolean
  closingCommandActive: boolean
  closingKeyword: string
  closingMessage: string
  outOfHoursActive: boolean
  outOfHoursMessage: string
}

export const DEFAULT_CHATBOT_SETTINGS: ChatbotSettingsData = {
  enabled: false,
  welcomeActive: true,
  welcomeMode: 'ALWAYS',
  welcomeMessage: 'Olá, tudo bem? Bem-vindo(a) à {nome_loja}. Como posso te ajudar hoje? 😊',
  menuAutoSendActive: true,
  menuAutoSendMessage: '📋 Confira nosso cardápio completo aqui:\n{link_cardapio}',
  optionsMessage: 'Você pode escolher uma opção:\n\n1️⃣ Ver cardápio\n2️⃣ Acompanhar pedido\n3️⃣ Falar com atendente\n\nDigite 1, 2 ou 3.',
  fallbackActive: true,
  fallbackMessage: 'Não entendi muito bem 🤔\n\nVocê pode escolher uma opção:\n\n1️⃣ Ver cardápio\n2️⃣ Acompanhar pedido\n3️⃣ Falar com atendente\n\nDigite 1, 2 ou 3.',
  attendantMessage: 'Um atendente irá te atender em breve! 😊',
  blockAutoTransferToAttendant: false,
  closingCommandActive: true,
  closingKeyword: 'encerrar',
  closingMessage: 'Atendimento encerrado! Se precisar de algo, estou por aqui. 😊',
  outOfHoursActive: true,
  outOfHoursMessage: 'Olá! No momento estamos fora do nosso horário de atendimento.\n\nNosso horário é de {horario_abertura} às {horario_fechamento}.\n\nAssim que abrirmos, teremos prazer em te atender! 😊\nSe preferir, pode enviar sua mensagem que respondemos assim que estivermos online.',
}

export async function getChatbotSettings(tenantId: string): Promise<ChatbotSettingsData> {
  try {
    const row = await (prisma as any).chatbotSettings.findUnique({ where: { tenantId } })
    if (!row) return DEFAULT_CHATBOT_SETTINGS
    return row as ChatbotSettingsData
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) return DEFAULT_CHATBOT_SETTINGS
    console.error('[chatbot-engine] Erro ao buscar configurações:', err)
    return DEFAULT_CHATBOT_SETTINGS
  }
}

async function isWithinBusinessHours(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      settings: true,
      businessHours: { select: { dayOfWeek: true, openTime: true, closeTime: true, isOpen: true } },
    },
  })
  if (!tenant) return true

  const settings = tenant.settings as any
  if (settings?.manualOpen === true) return true
  if (settings?.manualOpen === false) return false

  const now         = new Date()
  const brTime      = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const dayOfWeek   = brTime.getDay()
  const currentTime = brTime.toTimeString().slice(0, 5)
  const todayHours  = tenant.businessHours.find((h) => h.dayOfWeek === dayOfWeek)

  if (!todayHours || !todayHours.isOpen) return false
  return currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime
}

interface ChatRef {
  id: string
  botActive: boolean
  awaitingAttendant: boolean
  botState: string | null
  botFallbackCount: number
}

interface HandleIncomingParams {
  tenantId: string
  chat: ChatRef
  phone: string
}

export interface BotResult {
  replies: string[]
  // Atualizações a persistir em WhatsappChat (undefined = não mexer no campo)
  chatUpdate: Partial<{
    botActive: boolean
    awaitingAttendant: boolean
    botState: string | null
    botFallbackCount: number
  }>
  attendantRequested: boolean
}

const NO_OP: BotResult = { replies: [], chatUpdate: {}, attendantRequested: false }

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
}

const MENU_KEYWORDS      = ['1', 'cardapio', 'menu', 'ver cardapio']
const TRACKING_KEYWORDS  = ['2', 'acompanhar', 'pedido', 'rastrear', 'rastreio', 'status do pedido']
const ATTENDANT_KEYWORDS = ['3', 'atendente', 'humano', 'pessoa', 'falar com atendente', 'suporte']

/**
 * Decide a resposta do robô para uma mensagem recebida de um cliente.
 * Retorna as mensagens a enviar (em ordem) e o que atualizar no chat.
 * NÃO envia nada nem grava no banco — quem chama decide o que fazer com
 * o resultado (ver app/api/webhooks/evolution/route.ts).
 */
export async function handleIncomingText(params: HandleIncomingParams & { text: string }): Promise<BotResult> {
  const { tenantId, chat, phone, text } = params
  const settings = await getChatbotSettings(tenantId)
  if (!settings.enabled) return NO_OP

  const normalized = normalize(text)

  // ── 1) Comando de encerramento — funciona SEMPRE, mesmo com o robô ────
  //    pausado (operador humano ou "aguardando atendente"). É a forma do
  //    cliente devolver a conversa para o atendimento automático.
  if (settings.closingCommandActive) {
    const keyword = normalize(settings.closingKeyword || 'encerrar')
    if (keyword && normalized === keyword) {
      const vars = await buildTemplateVariables({ tenantId, phone })
      return {
        replies: [renderTemplate(settings.closingMessage, vars)],
        chatUpdate: { botActive: true, awaitingAttendant: false, botState: null, botFallbackCount: 0 },
        attendantRequested: false,
      }
    }
  }

  // ── 2) Conversa sob controle humano — robô fica em silêncio ───────────
  if (!chat.botActive) return NO_OP

  const vars = await buildTemplateVariables({ tenantId, phone })

  // ── 3) Fora do horário de funcionamento ────────────────────────────────
  if (settings.outOfHoursActive) {
    const open = await isWithinBusinessHours(tenantId)
    if (!open) {
      return {
        replies: [renderTemplate(settings.outOfHoursMessage, vars)],
        chatUpdate: {},
        attendantRequested: false,
      }
    }
  }

  // ── 4) Primeira mensagem da "sessão" → boas-vindas + cardápio ─────────
  if (!chat.botState) {
    const replies: string[] = []

    if (settings.welcomeActive) {
      const isNewCustomer = !(await prisma.customer.findFirst({
        where: { tenantId, phone, totalOrders: { gt: 0 } },
        select: { id: true },
      }))
      const shouldGreet = settings.welcomeMode !== 'NEW_CUSTOMERS_ONLY' || isNewCustomer
      if (shouldGreet) replies.push(renderTemplate(settings.welcomeMessage, vars))
    }

    if (settings.menuAutoSendActive) {
      replies.push(renderTemplate(settings.menuAutoSendMessage, vars))
    }

    replies.push(renderTemplate(settings.optionsMessage, vars))

    return {
      replies,
      chatUpdate: { botState: 'MENU_SENT', botFallbackCount: 0 },
      attendantRequested: false,
    }
  }

  // ── 5) Já cumprimentado → interpretar a opção escolhida ────────────────
  if (MENU_KEYWORDS.includes(normalized)) {
    return {
      replies: [renderTemplate(settings.menuAutoSendMessage, vars)],
      chatUpdate: { botFallbackCount: 0 },
      attendantRequested: false,
    }
  }

  if (TRACKING_KEYWORDS.includes(normalized)) {
    const reply = vars.link_rastreio
      ? `🔗 Acompanhe seu pedido aqui: ${vars.link_rastreio}`
      : 'Não encontramos nenhum pedido em andamento no seu telefone. Se acabou de pedir, aguarde a confirmação por aqui. 😊'
    return {
      replies: [reply],
      chatUpdate: { botFallbackCount: 0 },
      attendantRequested: false,
    }
  }

  if (ATTENDANT_KEYWORDS.includes(normalized)) {
    return {
      replies: [renderTemplate(settings.attendantMessage, vars)],
      chatUpdate: { botActive: false, awaitingAttendant: true, botState: 'HANDED_OFF', botFallbackCount: 0 },
      attendantRequested: true,
    }
  }

  // ── 6) Não entendeu ──────────────────────────────────────────────────
  const fallbackCount = chat.botFallbackCount + 1
  const shouldAutoTransfer = fallbackCount >= 2 && !settings.blockAutoTransferToAttendant

  if (shouldAutoTransfer) {
    return {
      replies: [renderTemplate(settings.attendantMessage, vars)],
      chatUpdate: { botActive: false, awaitingAttendant: true, botState: 'HANDED_OFF', botFallbackCount: 0 },
      attendantRequested: true,
    }
  }

  if (settings.fallbackActive) {
    return {
      replies: [renderTemplate(settings.fallbackMessage, vars)],
      chatUpdate: { botFallbackCount: fallbackCount },
      attendantRequested: false,
    }
  }

  return { replies: [], chatUpdate: { botFallbackCount: fallbackCount }, attendantRequested: false }
}
