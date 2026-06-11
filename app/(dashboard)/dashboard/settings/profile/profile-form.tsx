'use client'
// app/(dashboard)/dashboard/settings/profile/profile-form.tsx

import { useState, useTransition } from 'react'
import { Loader2, Eye, EyeOff, Save, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils/format'

const ROLE_LABELS: Record<string, string> = {
  MASTER_ADMIN: 'Master Admin',
  TENANT_ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  ATTENDANT: 'Atendente',
  WAITER: 'Garçom',
  DELIVERY_PERSON: 'Entregador',
}

interface ProfileFormProps {
  user: {
    id: string
    name: string
    email: string
    phone: string | null
    role: string
    createdAt: Date
    lastLoginAt: Date | null
  }
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [isPending, start] = useTransition()
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Form fields
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSaveProfile = () => {
    start(async () => {
      try {
        const res = await fetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone }),
        })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error ?? 'Erro ao salvar'); return }
        toast.success('Perfil atualizado!')
      } catch {
        toast.error('Erro ao salvar perfil')
      }
    })
  }

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }
    if (newPassword.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres')
      return
    }
    start(async () => {
      try {
        const res = await fetch('/api/user/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error ?? 'Erro ao alterar senha'); return }
        toast.success('Senha alterada! Faça login novamente.')
        setTimeout(() => signOut({ callbackUrl: '/login' }), 1500)
      } catch {
        toast.error('Erro ao alterar senha')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Info da conta */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-black text-primary">
            {user.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-foreground text-lg">{user.name}</p>
            <span className="inline-block text-xs font-semibold bg-muted text-muted-foreground px-2 py-1 rounded-lg">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground block">Email</span>
            {user.email}
          </div>
          <div>
            <span className="font-medium text-foreground block">Membro desde</span>
            {new Date(user.createdAt).toLocaleDateString('pt-BR')}
          </div>
          {user.lastLoginAt && (
            <div>
              <span className="font-medium text-foreground block">Último acesso</span>
              {new Date(user.lastLoginAt).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      {/* Editar dados */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Dados pessoais</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Telefone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar dados
        </button>
      </div>

      {/* Alterar senha */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Alterar senha</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Senha atual</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar nova senha</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleChangePassword}
          disabled={isPending || !currentPassword || !newPassword}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Alterar senha
        </button>
      </div>

      {/* Sair */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-3">Sessão</h2>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/20 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>
      </div>
    </div>
  )
}
