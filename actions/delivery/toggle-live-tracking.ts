'use server'

// actions/delivery/toggle-live-tracking.ts
//
// Liga/desliga o rastreamento ao vivo da entrega (mapa com a posição do
// entregador) para o tenant inteiro. Guardado em tenant.settings.liveTrackingEnabled
// (JSON flexível, sem migration) — ausente ou `true` = ligado (comportamento
// atual, default), `false` = desligado.
//
// Efeito em cascata quando desligado:
//   - app/api/delivery/active/route.ts para de listar entregas para o
//     widget do entregador (components/dashboard/courier-location-tracker.tsx),
//     que some sozinho — o navegador do entregador nunca chega a pedir
//     permissão de GPS.
//   - components/dashboard/delivery-tracking-screen.tsx (tela dedicada do
//     entregador) também para de capturar/enviar GPS.
//   - app/api/delivery/location/route.ts ignora qualquer posição recebida
//     mesmo assim, como segunda barreira.
//   - app/api/orders/[id]/status/route.ts para de retornar o bloco
//     `tracking` — o cliente final não vê mais o mapa nem a posição.

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'

export type ToggleLiveTrackingState = { error?: string; success?: boolean; enabled?: boolean }

export async function toggleLiveTrackingAction(enabled: boolean): Promise<ToggleLiveTrackingState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão para alterar essa configuração' }
  }

  const tenantId = session.user.tenantId

  const current = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...currentSettings,
        liveTrackingEnabled: enabled,
      } as any,
    },
  })

  revalidatePath('/dashboard/delivery/tracking')
  return { success: true, enabled }
}
