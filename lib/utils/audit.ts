// lib/utils/audit.ts
// VULN-08 CORRIGIDO: nunca tentar DELETE/UPDATE em AuditLog (enforcement no app também)
// VULN-12 CORRIGIDO: erros internos não propagados para o cliente

import { prisma } from '@/lib/db/client'
import { headers } from 'next/headers'

interface AuditParams {
  tenantId?:   string
  userId?:     string
  action:      string
  resource?:   string
  resourceId?: string
  oldValue?:   unknown
  newValue?:   unknown
  pdvId?:      string
  metadata?:   unknown
}

export async function auditLog(params: AuditParams) {
  try {
    const headersList = await headers()
    const ip        = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const userAgent = headersList.get('user-agent') ?? ''

    // VULN-08: APENAS INSERT — nunca UPDATE ou DELETE
    await prisma.auditLog.create({
      data: {
        tenantId:   params.tenantId,
        userId:     params.userId,
        action:     params.action,
        resource:   params.resource,
        resourceId: params.resourceId,
        oldValue:   params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : undefined,
        newValue:   params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : undefined,
        pdvId:      params.pdvId,
        metadata:   params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
        ip,
        userAgent:  userAgent.slice(0, 500), // limitar tamanho
      },
    })
  } catch (error) {
    // VULN-12: log interno sem expor detalhes
    console.error('[audit] Falha ao registrar log:', error)
    // Não relançar — falha de audit não deve derrubar operação principal
  }
}

export const AuditActions = {
  LOGIN:                 'LOGIN',
  LOGOUT:                'LOGOUT',
  LOGIN_FAILED:          'LOGIN_FAILED',
  PASSWORD_CHANGED:      'PASSWORD_CHANGED',
  ORDER_CREATED:         'ORDER_CREATED',
  ORDER_CONFIRMED:       'ORDER_CONFIRMED',
  ORDER_CANCELLED:       'ORDER_CANCELLED',
  ORDER_STATUS_CHANGED:  'ORDER_STATUS_CHANGED',
  ORDER_REFUNDED:        'ORDER_REFUNDED',
  PRODUCT_CREATED:       'PRODUCT_CREATED',
  PRODUCT_UPDATED:       'PRODUCT_UPDATED',
  PRODUCT_PRICE_CHANGED: 'PRODUCT_PRICE_CHANGED',
  PRODUCT_DELETED:       'PRODUCT_DELETED',
  TABLE_OPENED:          'TABLE_OPENED',
  TABLE_CLOSED:          'TABLE_CLOSED',
  TABLE_TRANSFERRED:     'TABLE_TRANSFERRED',
  USER_CREATED:          'USER_CREATED',
  USER_UPDATED:          'USER_UPDATED',
  USER_DEACTIVATED:      'USER_DEACTIVATED',
  PAYMENT_RECEIVED:      'PAYMENT_RECEIVED',
  CASHFLOW_OPENED:       'CASHFLOW_OPENED',
  CASHFLOW_CLOSED:       'CASHFLOW_CLOSED',
  STOCK_CREATED:         'STOCK_CREATED',
  STOCK_ADJUSTED:        'STOCK_ADJUSTED',
} as const
