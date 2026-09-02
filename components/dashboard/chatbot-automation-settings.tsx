'use client'

// components/dashboard/chatbot-automation-settings.tsx
//
// Tela "Automações do Chat" — configura o robô de atendimento do WhatsApp:
// boas-vindas, cardápio automático, opções (1/2/3), fallback, mensagens de
// status do pedido, comando de encerramento e bloqueio de transferência
// automática para atendente.

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Copy, Loader2, Save, Bot, MessageSquareWarning } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Variáveis dinâmicas disponíveis (ver lib/messaging/template-variables.ts) ─
const VARIABLES = [
  'nome_cliente', 'cliente_nome', 'telefone_cliente', 'nome_loja',
  'numero_pedido', 'valor_pedido', 'itens_pedido', 'forma_pagamento',
  'status_pagamento', 'metodo_pagamento', 'tipo_pedido', 'horario_pedido',
  'endereco_cliente', 'previsao_entrega', 'horario_abertura', 'horario_fechamento',
  'link_cardapio', 'link_pedido', 'link_rastreio',
]

function VariableChips() {
  const copy = (v: string) => {
    navigator.clipboard.writeText(`{${v}}`)
    toast.success(`{${v}} copiado`)
  }
  return (
    <div className="mb-3 p-3 rounded-lg bg-muted/50 border border-border">
      <p className="text-xs font-semibold text-foreground mb-2">Variáveis dinâmicas</p>
      <p className="text-[11px] text-muted-foreground mb-2">
        Clique para copiar. Use nas mensagens para inserir dados automaticamente.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => copy(v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-[11px] font-mono text-foreground hover:bg-muted transition-colors"
          >
            <Copy className="h-2.5 w-2.5" /> {`{${v}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

interface ChatbotSettingsData {
  enabled: boolean
  welcomeActive: boolean
  welcomeMode: 'ALWAYS' | 'NEW_CUSTOMERS_ONLY'
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

interface OrderMessage {
  event: string
  active: boolean
  message: string
}

const ORDER_EVENTS: { event: string; label: string; hint: string; defaultMsg: string }[] = [
  { event: 'CONFIRMED', label: 'Pedido Confirmado', hint: 'Mensagem enviada quando o pedido é confirmado no sistema.',
    defaultMsg: '✅ Pedido #{numero_pedido} confirmado! Estamos preparando tudo com carinho.' },
  { event: 'PREPARING', label: 'Em Preparo', hint: 'Mensagem enviada quando o pedido entra em produção.',
    defaultMsg: 'Seu pedido #{numero_pedido} está sendo preparado com carinho. 👨‍🍳' },
  { event: 'READY', label: 'Pronto para Retirada', hint: 'Mensagem enviada para pedidos de retirada no balcão.',
    defaultMsg: 'Seu pedido #{numero_pedido} está pronto para retirada! 😊' },
  { event: 'OUT_FOR_DELIVERY', label: 'Saiu para Entrega', hint: 'Mensagem enviada para pedidos de entrega/delivery.',
    defaultMsg: 'Seu pedido #{numero_pedido} saiu para entrega e está a caminho! 🛵\n\n📍 Acompanhe em tempo real: {link_rastreio}' },
  { event: 'DELIVERED', label: 'Entregue', hint: 'Mensagem enviada quando o pedido é finalizado.',
    defaultMsg: 'Seu pedido #{numero_pedido} foi entregue. Bom apetite! 😋' },
  { event: 'CANCELLED', label: 'Pedido Cancelado', hint: 'Mensagem enviada quando o pedido é cancelado.',
    defaultMsg: 'Seu pedido #{numero_pedido} foi cancelado. Em caso de dúvidas, entre em contato conosco.' },
]

const DEFAULTS: ChatbotSettingsData = {
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
  outOfHoursMessage: 'Olá! No momento estamos fora do nosso horário de atendimento.\n\nNosso horário é de {horario_abertura} às {horario_fechamento}.\n\nAssim que abrirmos, teremos prazer em te atender! 😊',
}

// ── Bloco colapsável reutilizado em toda a tela (mesmo padrão visual do print) ─
function Section({
  title, description, active, onToggleActive, children, defaultOpen = false,
}: {
  title: string
  description?: string
  active?: boolean
  onToggleActive?: (v: boolean) => void
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <span className="font-semibold text-foreground truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onToggleActive && (
            <>
              <span className={cn('text-xs font-semibold', active ? 'text-emerald-600' : 'text-muted-foreground')}>
                {active ? 'ATIVO' : 'INATIVO'}
              </span>
              <span
                role="switch"
                aria-checked={active}
                onClick={(e) => { e.stopPropagation(); onToggleActive(!active) }}
                className={cn(
                  'w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors',
                  active ? 'bg-emerald-500 justify-end' : 'bg-muted-foreground/30 justify-start'
                )}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </span>
            </>
          )}
        </div>
      </button>
      {open && (
        <div className="p-4 pt-0 space-y-3 border-t border-border">
          {description && <p className="text-sm text-muted-foreground pt-3">{description}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

function Preview({ text }: { text: string }) {
  const sample = text
    .replace(/\{nome_loja\}/g, 'Minha Loja')
    .replace(/\{nome_cliente\}|\{cliente_nome\}/g, 'João Silva')
    .replace(/\{numero_pedido\}/g, '1234')
    .replace(/\{valor_pedido\}/g, 'R$ 45,90')
    .replace(/\{link_cardapio\}/g, 'https://fazopedido.com/cardapio')
    .replace(/\{link_pedido\}|\{link_rastreio\}/g, 'https://fazopedido.com/rastreio/1234')
    .replace(/\{horario_abertura\}/g, '08:00')
    .replace(/\{horario_fechamento\}/g, '22:00')
    .replace(/\{[a-z_]+\}/g, '')
  return (
    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">PREVIEW</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{sample}</p>
    </div>
  )
}

function Textarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full px-3 py-2.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
    />
  )
}

export function ChatbotAutomationSettings() {
  const [settings, setSettings]   = useState<ChatbotSettingsData>(DEFAULTS)
  const [orderMsgs, setOrderMsgs] = useState<Record<string, OrderMessage>>(
    Object.fromEntries(ORDER_EVENTS.map((e) => [e.event, { event: e.event, active: true, message: e.defaultMsg }]))
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [s, m] = await Promise.all([
          fetch('/api/settings/chatbot').then((r) => r.json()),
          fetch('/api/settings/chatbot/order-messages').then((r) => r.json()),
        ])
        if (s?.settings) setSettings({ ...DEFAULTS, ...s.settings })
        if (Array.isArray(m?.messages)) {
          setOrderMsgs((prev) => {
            const next = { ...prev }
            for (const row of m.messages as OrderMessage[]) {
              next[row.event] = { event: row.event, active: row.active, message: row.message }
            }
            return next
          })
        }
      } catch {
        toast.error('Erro ao carregar configurações do robô')
      }
      setLoading(false)
    })()
  }, [])

  const update = <K extends keyof ChatbotSettingsData>(key: K, value: ChatbotSettingsData[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const updateOrderMsg = (event: string, patch: Partial<OrderMessage>) => {
    setOrderMsgs((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const [resSettings, resMsgs] = await Promise.all([
        fetch('/api/settings/chatbot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        }),
        fetch('/api/settings/chatbot/order-messages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: Object.values(orderMsgs) }),
        }),
      ])
      const [dataSettings, dataMsgs] = await Promise.all([resSettings.json(), resMsgs.json()])
      if (!resSettings.ok) { toast.error(dataSettings.error ?? 'Erro ao salvar configurações do robô'); return }
      if (!resMsgs.ok) { toast.error(dataMsgs.error ?? 'Erro ao salvar mensagens de status'); return }
      toast.success('Configurações salvas com sucesso!')
    } catch {
      toast.error('Erro de conexão')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando automações...
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Chave-mestra */}
      <div className={cn(
        'flex items-center gap-3 p-4 rounded-xl border',
        settings.enabled ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-muted border-border'
      )}>
        <Bot className={cn('h-6 w-6 flex-shrink-0', settings.enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
        <div className="flex-1">
          <p className="font-semibold text-foreground">Robô de Atendimento</p>
          <p className="text-xs text-muted-foreground">Ative para automatizar respostas no WhatsApp</p>
        </div>
        <span
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => update('enabled', !settings.enabled)}
          className={cn(
            'w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0',
            settings.enabled ? 'bg-emerald-500 justify-end' : 'bg-muted-foreground/30 justify-start'
          )}
        >
          <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
        </span>
      </div>

      {!settings.enabled && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-400">
          <MessageSquareWarning className="h-4 w-4 flex-shrink-0 mt-0.5" />
          Com o robô desativado, apenas as mensagens automáticas de status do pedido continuam sendo enviadas —
          nenhuma conversa automática acontece no chat.
        </div>
      )}

      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide pt-2">Interações automatizadas</h2>

      <Section
        title="Mensagem de Boas-Vindas"
        description="Defina a mensagem de saudação enviada automaticamente quando o cliente entrar em contato pelo WhatsApp."
        active={settings.welcomeActive}
        onToggleActive={(v) => update('welcomeActive', v)}
      >
        <VariableChips />
        <Textarea value={settings.welcomeMessage} onChange={(v) => update('welcomeMessage', v)} />
        <div className="flex gap-2">
          {([['ALWAYS', 'Enviar sempre', 'Envia para todos os clientes'], ['NEW_CUSTOMERS_ONLY', 'Apenas novos clientes', 'Envia apenas se o cliente nunca comprou']] as const).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => update('welcomeMode', value)}
              className={cn(
                'flex-1 text-left p-3 rounded-lg border transition-colors',
                settings.welcomeMode === value ? 'border-primary bg-primary/5' : 'border-border'
              )}
            >
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </button>
          ))}
        </div>
        <Preview text={settings.welcomeMessage} />
      </Section>

      <Section
        title="Envio automático do cardápio"
        description="Envia o cardápio digital automaticamente logo após a mensagem de boas-vindas."
        active={settings.menuAutoSendActive}
        onToggleActive={(v) => update('menuAutoSendActive', v)}
      >
        <VariableChips />
        <Textarea value={settings.menuAutoSendMessage} onChange={(v) => update('menuAutoSendMessage', v)} />
        <Preview text={settings.menuAutoSendMessage} />
      </Section>

      <Section
        title="Menu de opções"
        description="Enviado após o cardápio — o cliente escolhe 1 (ver cardápio), 2 (acompanhar pedido) ou 3 (falar com atendente)."
      >
        <VariableChips />
        <Textarea value={settings.optionsMessage} onChange={(v) => update('optionsMessage', v)} />
        <Preview text={settings.optionsMessage} />
      </Section>

      <Section
        title="Mensagem quando o cliente não for entendido"
        description="Enviada automaticamente quando o robô não consegue interpretar a resposta do cliente."
        active={settings.fallbackActive}
        onToggleActive={(v) => update('fallbackActive', v)}
      >
        <VariableChips />
        <Textarea value={settings.fallbackMessage} onChange={(v) => update('fallbackMessage', v)} />
        <Preview text={settings.fallbackMessage} />
      </Section>

      <Section
        title="Mensagem enviada ao solicitar atendente"
        description="Enviada quando o cliente escolhe a opção 3 (falar com atendente). O robô fica em silêncio nessa conversa até você reativá-lo no WA Chat, ou até o cliente enviar o comando de encerramento."
      >
        <VariableChips />
        <Textarea value={settings.attendantMessage} onChange={(v) => update('attendantMessage', v)} />
        <Preview text={settings.attendantMessage} />
      </Section>

      <Section
        title="Mensagem Fora do Horário"
        description="Mensagem automática enviada quando o cliente entrar em contato fora do horário de funcionamento."
        active={settings.outOfHoursActive}
        onToggleActive={(v) => update('outOfHoursActive', v)}
      >
        <VariableChips />
        <Textarea value={settings.outOfHoursMessage} onChange={(v) => update('outOfHoursMessage', v)} />
        <Preview text={settings.outOfHoursMessage} />
      </Section>

      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide pt-2">Mensagens automáticas de status do pedido</h2>

      {ORDER_EVENTS.map(({ event, label, hint }) => {
        const row = orderMsgs[event]
        return (
          <Section
            key={event}
            title={label}
            description={hint}
            active={row.active}
            onToggleActive={(v) => updateOrderMsg(event, { active: v })}
          >
            <VariableChips />
            <Textarea value={row.message} onChange={(v) => updateOrderMsg(event, { message: v })} />
            <Preview text={row.message} />
          </Section>
        )
      })}

      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide pt-2">Comando de encerramento</h2>

      <Section
        title="Comando de Encerramento"
        description="Palavra ou comando que o cliente pode enviar a qualquer momento — mesmo em atendimento humano — para reativar o robô e reiniciar o atendimento automático."
        active={settings.closingCommandActive}
        onToggleActive={(v) => update('closingCommandActive', v)}
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Palavra-chave</label>
          <input
            type="text"
            value={settings.closingKeyword}
            onChange={(e) => update('closingKeyword', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            placeholder="encerrar"
          />
        </div>
        <VariableChips />
        <Textarea value={settings.closingMessage} onChange={(v) => update('closingMessage', v)} />
        <Preview text={settings.closingMessage} />
      </Section>

      <Section
        title="Bloquear transferência automática para atendente"
        description="Quando ativado, o robô não transfere a conversa automaticamente após não entender o cliente repetidas vezes — continua tentando ajudar sozinho. A opção manual 'falar com atendente' continua funcionando sempre."
        active={settings.blockAutoTransferToAttendant}
        onToggleActive={(v) => update('blockAutoTransferToAttendant', v)}
      >
        <p className="text-xs text-muted-foreground">Nenhuma configuração adicional necessária.</p>
      </Section>

      {/* Barra de salvar fixa */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 bg-background/95 backdrop-blur border-t border-border flex justify-end z-10">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  )
}
