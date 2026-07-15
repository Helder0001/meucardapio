// app/(dashboard)/dashboard/pdv/page.tsx
//
// Multi-PDV foi REMOVIDO como funcionalidade (decisão de produto, 13/07) —
// cada tenant opera com um único PDV. Mantemos o model PDV no schema (dados
// existentes de pedidos/mesas continuam referenciando o PDV que já existe,
// criado automaticamente no cadastro), só a TELA de gerenciar múltiplos
// PDVs foi tirada. Rota mantida como redirect (não removida do roteamento)
// para não quebrar links/favoritos salvos de quem já usava.

import { redirect } from 'next/navigation'

export default function PdvPage() {
  redirect('/dashboard')
}
