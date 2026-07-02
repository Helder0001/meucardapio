'use client'
// components/dashboard/whatsapp-chat-client.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Send, MessageCircle, RefreshCw, Phone, Clock, Paperclip, X, FileText, Loader2 } from 'lucide-react'
import { formatDate, formatRelative } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Chat {
  id: string
  phone: string
  contactName: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  isOpen: boolean
}

interface Message {
  id: string
  body: string
  fromMe: boolean
  status: string
  createdAt: string
  mediaUrl?: string | null
  mediaType?: string | null
  mediaMimeType?: string | null
  mediaFileName?: string | null
  sentBy: { name: string } | null
}

interface WhatsAppChatClientProps {
  tenantId: string
}

export function WhatsAppChatClient({ tenantId }: WhatsAppChatClientProps) {
  const [chats, setChats]               = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [sendingFile, setSendingFile]   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  // Buscar lista de chats
  const fetchChats = useCallback(async () => {
    try {
      const res  = await fetch('/api/whatsapp/chats')
      const data = await res.json()
      setChats(data.chats ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchChats()
    const interval = setInterval(fetchChats, 5000)
    return () => clearInterval(interval)
  }, [fetchChats])

  // Buscar mensagens do chat selecionado
  const fetchMessages = useCallback(async (chatId: string) => {
    setLoadingMsgs(true)
    try {
      const res  = await fetch(`/api/whatsapp/chats/${chatId}/messages`)
      const data = await res.json()
      setMessages(data.messages ?? [])
      // Mark as read locally
      setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c))
    } catch {}
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (!selectedChat) return
    fetchMessages(selectedChat.id)
    const interval = setInterval(() => fetchMessages(selectedChat.id), 3000)
    return () => clearInterval(interval)
  }, [selectedChat, fetchMessages])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || !selectedChat || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      const res  = await fetch(`/api/whatsapp/chats/${selectedChat.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao enviar mensagem')
        setInput(text)
        return
      }
      setMessages((prev) => [...prev, data.message])
    } catch {
      toast.error('Erro de conexão')
      setInput(text)
    }
    setSending(false)
  }

  const sendFile = async () => {
    if (!attachedFile || !selectedChat || sendingFile) return
    setSendingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', attachedFile)
      if (input.trim()) formData.append('caption', input.trim())

      const res  = await fetch(`/api/whatsapp/chats/${selectedChat.id}/send-media`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao enviar arquivo')
        return
      }
      setMessages((prev) => [...prev, data.message])
      setAttachedFile(null)
      setInput('')
    } catch {
      toast.error('Erro de conexão')
    }
    setSendingFile(false)
  }

  const filteredChats = chats.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.phone.includes(q) ||
      c.contactName?.toLowerCase().includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    )
  })

  const formatPhone = (phone: string) => {
    const d = phone.replace(/\D/g, '')
    if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
    return phone
  }

  return (
    <div className="flex flex-1 overflow-hidden border border-border rounded-xl bg-card">

      {/* ── LISTA DE CHATS ── */}
      <div className={cn(
        'flex flex-col border-r border-border',
        selectedChat ? 'hidden md:flex w-80' : 'flex w-full md:w-80'
      )}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold text-foreground">Conversas</h2>
              {chats.filter((c) => c.unreadCount > 0).length > 0 && (
                <span className="text-xs bg-emerald-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {chats.filter((c) => c.unreadCount > 0).length}
                </span>
              )}
            </div>
            <button onClick={fetchChats} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          )}

          {!loading && filteredChats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Nenhuma conversa ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Quando um cliente mandar mensagem no WhatsApp, aparecerá aqui.
              </p>
            </div>
          )}

          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={cn(
                'w-full flex items-start gap-3 p-4 border-b border-border/50 hover:bg-muted/50 transition-colors text-left',
                selectedChat?.id === chat.id && 'bg-primary/5 border-l-2 border-l-primary'
              )}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-emerald-700 font-bold text-sm">
                {(chat.contactName?.[0] ?? chat.phone.slice(-2)).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {chat.contactName ?? formatPhone(chat.phone)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {chat.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelative(chat.lastMessageAt)}
                      </span>
                    )}
                    {chat.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                {chat.contactName && (
                  <p className="text-xs text-muted-foreground">{formatPhone(chat.phone)}</p>
                )}
                {chat.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{chat.lastMessage}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── ÁREA DO CHAT ── */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
            <button
              onClick={() => setSelectedChat(null)}
              className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              ←
            </button>

            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
              {(selectedChat.contactName?.[0] ?? selectedChat.phone.slice(-2)).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm truncate">
                {selectedChat.contactName ?? formatPhone(selectedChat.phone)}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(selectedChat.phone)}
              </p>
            </div>

            <a
              href={`https://wa.me/${selectedChat.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-muted transition-colors text-emerald-500 text-xs font-medium"
              title="Abrir no WhatsApp"
            >
              Abrir WA
            </a>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
            {loadingMsgs && (
              <div className="flex justify-center py-8 text-muted-foreground text-sm">
                Carregando mensagens...
              </div>
            )}

            {!loadingMsgs && messages.length === 0 && (
              <div className="flex justify-center py-8 text-muted-foreground text-sm">
                Nenhuma mensagem ainda.
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                  msg.fromMe
                    ? 'bg-emerald-500 text-white rounded-br-sm'
                    : 'bg-card text-foreground border border-border rounded-bl-sm'
                )}>
                  {msg.mediaUrl && msg.mediaType === 'image' && (
                    <img src={msg.mediaUrl} alt={msg.mediaFileName ?? 'Imagem'}
                      className="rounded-lg max-w-full max-h-64 mb-1.5 object-cover" />
                  )}
                  {msg.mediaUrl && msg.mediaType === 'video' && (
                    <video src={msg.mediaUrl} controls className="rounded-lg max-w-full max-h-64 mb-1.5" />
                  )}
                  {msg.mediaUrl && msg.mediaType === 'audio' && (
                    <audio src={msg.mediaUrl} controls className="mb-1.5 max-w-full" />
                  )}
                  {msg.mediaUrl && (msg.mediaType === 'document' || msg.mediaType === 'sticker') && (
                    <a href={msg.mediaUrl} download={msg.mediaFileName ?? undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-2 mb-1.5 text-xs font-medium',
                        msg.fromMe ? 'bg-white/15' : 'bg-muted'
                      )}>
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{msg.mediaFileName ?? 'Documento'}</span>
                    </a>
                  )}
                  {msg.mediaType && !msg.mediaUrl && (
                    <p className="text-xs italic opacity-70 mb-1">
                      Mídia recebida — abra no WhatsApp para visualizar
                    </p>
                  )}
                  {(!msg.mediaUrl || !['📷 Foto', '🎥 Vídeo', '🎵 Áudio'].includes(msg.body)) && (
                    <p className="leading-relaxed">{msg.body}</p>
                  )}
                  <div className={cn(
                    'flex items-center gap-1 mt-1',
                    msg.fromMe ? 'justify-end' : 'justify-start'
                  )}>
                    <Clock className={cn('h-2.5 w-2.5', msg.fromMe ? 'text-white/60' : 'text-muted-foreground')} />
                    <span className={cn('text-[10px]', msg.fromMe ? 'text-white/70' : 'text-muted-foreground')}>
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                      {msg.fromMe && msg.sentBy && ` · ${msg.sentBy.name}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card">
            {attachedFile && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-muted text-xs">
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium text-foreground">{attachedFile.name}</span>
                <button onClick={() => setAttachedFile(null)} className="p-1 rounded-md hover:bg-background text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setAttachedFile(f)
                e.target.value = ''
              }}
            />
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sendingFile}
                title="Anexar arquivo"
                className="w-10 h-10 rounded-full hover:bg-muted disabled:opacity-40 flex items-center justify-center text-muted-foreground transition-colors flex-shrink-0"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    attachedFile ? sendFile() : sendMessage()
                  }
                }}
                placeholder={attachedFile ? 'Adicionar legenda (opcional)...' : 'Digite uma mensagem...'}
                rows={1}
                className="flex-1 px-4 py-2.5 text-sm border border-input rounded-2xl bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none max-h-28 overflow-y-auto"
                style={{ minHeight: '42px' }}
              />
              <button
                onClick={attachedFile ? sendFile : sendMessage}
                disabled={attachedFile ? sendingFile : (!input.trim() || sending)}
                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center text-white transition-colors flex-shrink-0"
              >
                {sendingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Enter para enviar · Shift+Enter para nova linha
            </p>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-center p-8">
          <div>
            <MessageCircle className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="font-medium text-muted-foreground">Selecione uma conversa</p>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha um chat à esquerda para ver as mensagens
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
