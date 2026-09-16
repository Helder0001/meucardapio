// lib/utils/notification-read-state.ts
//
// Controle de "lido/não lido" do sininho de notificações — guardado no
// localStorage do navegador (não no banco), já que os itens em si não são
// um log persistido, são calculados ao vivo (ver app/api/notifications/
// list/route.ts). Cada notificação tem um ID estável (ex.:
// "order-pending-<id>", "stock-out-<productId>") que reaparece igual
// enquanto o fato continuar verdadeiro — por isso guardar o ID marcado
// como lido é suficiente, sem precisar de uma tabela nova.

const STORAGE_KEY = 'meucardapio:read-notifications'
const MAX_STORED = 300 // evita crescer pra sempre — descarta os mais antigos

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function writeSet(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(ids)
    const trimmed = arr.length > MAX_STORED ? arr.slice(arr.length - MAX_STORED) : arr
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage indisponível (modo privado, quota cheia) — ignora
  }
}

export function isNotificationRead(id: string): boolean {
  return readSet().has(id)
}

export function markNotificationRead(id: string) {
  const set = readSet()
  set.add(id)
  writeSet(set)
}

export function markAllNotificationsRead(ids: string[]) {
  const set = readSet()
  for (const id of ids) set.add(id)
  writeSet(set)
}

export function countUnread(ids: string[]): number {
  const set = readSet()
  return ids.filter((id) => !set.has(id)).length
}
