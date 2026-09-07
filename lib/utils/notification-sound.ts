// lib/utils/notification-sound.ts
//
// CORREÇÃO (#2 — som do Kanban não funcionava): o AudioContext só toca som
// depois de um gesto do usuário (clique/tecla) NA MESMA página onde ele foi
// criado — é uma trava de autoplay do navegador. O código antigo criava o
// AudioContext e escutava esse gesto só dentro do componente do Kanban, mas
// se o primeiro pedido chegasse antes de qualquer clique NAQUELA tela
// específica (ex.: o Kanban fica aberto numa TV/monitor sem ninguém tocar
// nele, ou a pessoa entrou direto pelo link sem clicar em nada antes), o som
// nunca desbloqueava — silêncio, sem erro nenhum.
//
// Esse módulo é um singleton compartilhado: o desbloqueio é registrado uma
// vez, no layout do dashboard inteiro (não só no Kanban), então qualquer
// clique em QUALQUER página do dashboard (entrar, navegar pela sidebar,
// etc.) já desbloqueia o áudio antes mesmo da pessoa abrir o Kanban.

let ctx: AudioContext | null = null
let unlockListenerAttached = false

const SOUND_PREF_KEY = 'meucardapio:notification-sound-enabled'

/** Preferência de som persistida — controlada pelo botão de mudo do
 *  Kanban, mas lida pelo listener global (notification-listener.tsx)
 *  também, pra manter uma única fonte de verdade sem duplicar toggle. */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(SOUND_PREF_KEY) !== 'false'
}

export function setSoundEnabledPref(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false')
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  return ctx
}

/** Registra (uma única vez por sessão) o listener que desbloqueia o áudio
 *  no primeiro clique/toque/tecla — deve ser chamado o quanto antes,
 *  idealmente no layout raiz do dashboard. */
export function ensureAudioUnlocked() {
  if (unlockListenerAttached || typeof document === 'undefined') return
  unlockListenerAttached = true

  const unlock = () => {
    const c = getContext()
    if (c?.state === 'suspended') c.resume().catch(() => {})
  }
  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
}

/** Toca o beep de notificação de novo pedido. Silencioso (sem erro) se o
 *  áudio ainda não foi desbloqueado ou o AudioContext não está disponível. */
export function playNotificationBeep() {
  const c = getContext()
  if (!c) return
  try {
    if (c.state === 'suspended') c.resume().catch(() => {})
    const oscillator = c.createOscillator()
    const gainNode = c.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(c.destination)
    oscillator.frequency.setValueAtTime(800, c.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.1)
    gainNode.gain.setValueAtTime(0.3, c.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.3)
    oscillator.start(c.currentTime)
    oscillator.stop(c.currentTime + 0.3)
  } catch {
    // AudioContext pode não estar disponível — ignora silenciosamente
  }
}
