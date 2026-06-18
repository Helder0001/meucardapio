'use client'

// components/dashboard/whatsapp-settings.tsx

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Wifi } from 'lucide-react'
import { toast } from 'sonner'

interface WhatsAppConfig {
  instanceName: string
  status: string
  lastConnectedAt: string | null
}

interface WhatsAppSettingsProps {
  tenantId: string
  config: WhatsAppConfig | null
}

export function WhatsAppSettings({ tenantId, config }: WhatsAppSettingsProps) {
  const [status, setStatus]         = useState(config?.status ?? 'DISCONNECTED')
  const [qrCode, setQrCode]         = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const isConnected = status === 'CONNECTED'

  // Polling enquanto aguarda scan do QR Code
  useEffect(() => {
    if (status !== 'CONNECTING') return
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [status])

  const checkStatus = async () => {
    try {
      const res  = await fetch('/api/whatsapp/status')
      const data = await res.json()
      if (data.status) {
        setStatus(data.status)
        if (data.status === 'CONNECTED') {
          setQrCode(null)
          toast.success('WhatsApp conectado com sucesso! 🎉')
        }
      }
    } catch {}
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const res  = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      if (data.qrCode) {
        setQrCode(data.qrCode)
        setStatus('CONNECTING')
        toast.info('Escaneie o QR Code com seu WhatsApp')
      } else if (data.status === 'CONNECTED') {
        setStatus('CONNECTED')
        toast.success('WhatsApp já estava conectado!')
      }
    } catch {
      toast.error('Erro ao gerar QR Code. Tente novamente.')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      setStatus('DISCONNECTED')
      setQrCode(null)
      toast.success('WhatsApp desconectado')
    } catch {
      toast.error('Erro ao desconectar')
    }
  }

  return (
    <div className="space-y-6">
      {/* Status de conexão */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        isConnected
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
          : status === 'CONNECTING'
          ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
          : 'bg-muted border-border'
      }`}>
        {isConnected ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
        ) : status === 'CONNECTING' ? (
          <Loader2 className="h-5 w-5 text-yellow-500 animate-spin flex-shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isConnected ? 'Conectado' : status === 'CONNECTING' ? 'Aguardando leitura do QR Code...' : 'Desconectado'}
          </p>
          {config?.lastConnectedAt && (
            <p className="text-xs text-muted-foreground">
              Última conexão: {new Date(config.lastConnectedAt).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
        {isConnected && (
          <button
            onClick={handleDisconnect}
            className="text-xs text-red-500 hover:underline"
          >
            Desconectar
          </button>
        )}
        {!isConnected && config && (
          <button onClick={checkStatus} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* QR Code para scan */}
      {qrCode && (
        <div className="bg-card border border-border rounded-xl p-5 text-center">
          <p className="font-semibold text-foreground mb-1">Escaneie com seu WhatsApp</p>
          <p className="text-sm text-muted-foreground mb-4">
            Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
          <div className="inline-block p-3 bg-white rounded-xl border border-gray-200">
            <img
              src={`data:image/png;base64,${qrCode}`}
              alt="QR Code WhatsApp"
              width={220}
              height={220}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aguardando leitura...
          </p>
        </div>
      )}

      {/* Botão conectar */}
      {!isConnected && !qrCode && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-4">
            Conecte o WhatsApp do seu restaurante para enviar notificações automáticas aos clientes sobre o status dos pedidos.
          </p>
          <button
            onClick={handleConnect}
            disabled={isConnecting || status === 'CONNECTING'}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isConnecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Gerando QR Code...</>
            ) : (
              <><Wifi className="h-4 w-4" /> Conectar WhatsApp</>
            )}
          </button>
        </div>
      )}

      {/* Templates de mensagem */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground">Mensagens automáticas</h2>
        <p className="text-sm text-muted-foreground">
          Enviadas automaticamente conforme o status do pedido. Use {'{numero}'} para o número do pedido.
        </p>

        {[
          { event: 'Pedido recebido',  template: '🎉 Olá! Seu pedido #{numero} foi recebido! Em breve confirmaremos.' },
          { event: 'Pedido confirmado', template: '✅ Pedido #{numero} confirmado! Estamos preparando tudo com carinho.' },
          { event: 'Saiu para entrega', template: '🛵 Pedido #{numero} saiu para entrega! Chegará em breve.' },
          { event: 'Entregue',         template: '🎊 Pedido #{numero} entregue! Bom apetite! Avalie: {link}' },
        ].map(({ event, template }) => (
          <div key={event} className="border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{event}</p>
            <p className="text-sm text-foreground font-mono bg-muted rounded px-2 py-1.5 text-xs">
              {template}
            </p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Personalização de templates disponível no plano Premium.
        </p>
      </div>
    </div>
  )
}
