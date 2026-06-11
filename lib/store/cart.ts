// lib/store/cart.ts
// VULN-05 CORRIGIDO: localStorage não persiste dados sensíveis do cliente
// Removidos: customerPhone, customerName, isVerified, tableId (dados que não devem ficar em texto no browser)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartAddon {
  id:    string
  name:  string
  price: number
}

export interface CartItem {
  cartItemId:   string
  productId:    string
  productName:  string
  productPrice: number
  quantity:     number
  notes?:       string
  addons:       CartAddon[]
  totalPrice:   number
}

interface CartState {
  tenantId:     string | null
  items:        CartItem[]
  couponCode:   string | null
  deliveryType: 'DELIVERY' | 'PICKUP' | 'TABLE'
  deliveryBairro: string | null

  // VULN-05 CORRIGIDO: estes campos NÃO são persistidos no localStorage
  // Ficam apenas na memória da sessão atual
  tableId:       string | null
  tableNumber:   number | null
  customerPhone: string | null
  customerName:  string | null
  isVerified:    boolean

  setTenant:      (tenantId: string) => void
  addItem:        (item: Omit<CartItem, 'cartItemId' | 'totalPrice'>) => void
  removeItem:     (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  clearCart:      () => void
  setCoupon:      (code: string | null) => void
  setDeliveryType:(type: 'DELIVERY' | 'PICKUP' | 'TABLE') => void
  setDeliveryBairro: (bairro: string | null) => void
  setTable:       (tableId: string, tableNumber: number) => void
  setCustomer:    (phone: string, name?: string) => void
  setVerified:    (verified: boolean) => void

  totalItems: () => number
  subtotal:   () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      tenantId:      null,
      items:         [],
      couponCode:    null,
      deliveryType:  'DELIVERY',
      deliveryBairro:null,
      tableId:       null,
      tableNumber:   null,
      customerPhone: null,
      customerName:  null,
      isVerified:    false,

      setTenant: (tenantId) => {
        if (get().tenantId && get().tenantId !== tenantId) {
          set({ tenantId, items: [], couponCode: null, tableId: null, tableNumber: null })
        } else {
          set({ tenantId })
        }
      },

      addItem: (item) => {
        const cartItemId = `${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const unitPrice  = item.productPrice + item.addons.reduce((s, a) => s + a.price, 0)
        const totalPrice = unitPrice * item.quantity
        set((state) => ({ items: [...state.items, { ...item, cartItemId, totalPrice }] }))
      },

      removeItem: (cartItemId) =>
        set((state) => ({ items: state.items.filter((i) => i.cartItemId !== cartItemId) })),

      updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) { get().removeItem(cartItemId); return }
        set((state) => ({
          items: state.items.map((i) =>
            i.cartItemId === cartItemId
              ? { ...i, quantity, totalPrice: (i.productPrice + i.addons.reduce((s, a) => s + a.price, 0)) * quantity }
              : i
          ),
        }))
      },

      clearCart: () => set({ items: [], couponCode: null, deliveryBairro: null }),

      setCoupon:       (code) => set({ couponCode: code }),
      setDeliveryType: (type) => set({ deliveryType: type }),
      setDeliveryBairro: (bairro) => set({ deliveryBairro: bairro }),
      setTable:        (tableId, tableNumber) => set({ tableId, tableNumber, deliveryType: 'TABLE' }),
      setCustomer:     (phone, name) => set({ customerPhone: phone, customerName: name ?? null }),
      setVerified:     (verified) => set({ isVerified: verified }),

      totalItems: () => get().items.reduce((s, i) => s + i.quantity, 0),
      subtotal:   () => get().items.reduce((s, i) => s + i.totalPrice, 0),
    }),
    {
      name: 'foodsaas-cart',

      // VULN-05 CORRIGIDO: partialize exclui dados sensíveis do localStorage
      // Apenas itens do carrinho, tipo de entrega e cupom são persistidos
      // Dados do cliente (telefone, nome, verificação) ficam só na memória
      partialize: (state) => ({
        tenantId:      state.tenantId,
        items:         state.items,
        couponCode:    state.couponCode,
        deliveryType:  state.deliveryType,
        deliveryBairro:state.deliveryBairro,
        // NÃO persistir: tableId, tableNumber, customerPhone, customerName, isVerified
      }),
    }
  )
)
