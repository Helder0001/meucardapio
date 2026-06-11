'use client'

// components/dashboard/general-settings-form.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { saveGeneralSettings } from '@/actions/settings/save-general'
import { Loader2, ExternalLink, Clock, Image as ImageIcon, Instagram, MapPin, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

const PAYMENT_OPTIONS = [
  'PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito',
  'Vale Refeição', 'Vale Alimentação', 'Boleto', 'Transferência'
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Salvando...' : 'Salvar alterações'}
    </button>
  )
}

interface BusinessHour {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isOpen: boolean
}

interface SettingsProps {
  tenant: {
    id: string
    name: string
    slug: string
    phone: string | null
    email: string | null
    cnpj: string | null
    logo: string | null
    primaryColor: string | null
    settings: any
    businessHours: BusinessHour[]
  }
}

export function GeneralSettingsForm({ tenant }: SettingsProps) {
  const [state, formAction] = useFormState(saveGeneralSettings, {})
  const settings = tenant.settings as Record<string, any> ?? {}
  const [selectedPayments, setSelectedPayments] = useState<string[]>(
    settings?.acceptedPayments ?? []
  )

  const hours: BusinessHour[] = DAYS.map((_, dayOfWeek) =>
    tenant.businessHours.find((h) => h.dayOfWeek === dayOfWeek) ?? {
      dayOfWeek,
      openTime: '11:00',
      closeTime: '23:00',
      isOpen: dayOfWeek !== 0,
    }
  )

  const togglePayment = (p: string) => {
    setSelectedPayments((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden: pagamentos selecionados */}
      <input type="hidden" name="acceptedPayments" value={JSON.stringify(selectedPayments)} />

      {state.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Configurações salvas com sucesso!
        </div>
      )}

      {/* ── Dados básicos ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Dados do estabelecimento</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Nome do estabelecimento *
          </label>
          <input
            name="name"
            defaultValue={tenant.name}
            required
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Telefone / WhatsApp
            </label>
            <input
              name="phone"
              defaultValue={tenant.phone ?? ''}
              placeholder="(11) 99999-9999"
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={tenant.email ?? ''}
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">CNPJ</label>
            <input
              name="cnpj"
              defaultValue={tenant.cnpj ?? ''}
              placeholder="00.000.000/0001-00"
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Cor principal</label>
            <div className="flex gap-2">
              <input
                name="primaryColor"
                type="color"
                defaultValue={tenant.primaryColor ?? '#f97316'}
                className="w-12 h-10 border border-input rounded-lg cursor-pointer bg-background"
              />
              <input
                name="primaryColorHex"
                defaultValue={tenant.primaryColor ?? '#f97316'}
                placeholder="#f97316"
                className="flex-1 px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Link do cardápio */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Link do cardápio
          </label>
          <div className="flex items-center gap-2 px-3 py-2.5 border border-input rounded-lg bg-muted text-sm text-muted-foreground">
            <span className="truncate">
              {process.env.NEXT_PUBLIC_APP_URL ?? 'https://seudominio.com'}/menu/{tenant.slug}
            </span>
            <a
              href={`/menu/${tenant.slug}`}
              target="_blank"
              className="flex-shrink-0 text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* ── Imagens da loja ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Imagens da loja</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Logo (foto de perfil)
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            URL da imagem do logo. Recomendado: quadrada, 400×400px.
          </p>
          <input
            name="logo"
            defaultValue={tenant.logo ?? ''}
            placeholder="https://exemplo.com/logo.png"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {tenant.logo && (
            <div className="mt-2">
              <img src={tenant.logo} alt="Logo atual" className="w-16 h-16 rounded-xl object-cover border border-input" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Foto de capa (banner)
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            URL da imagem de capa do cardápio. Recomendado: 1200×400px.
          </p>
          <input
            name="coverImage"
            defaultValue={settings?.coverImage ?? ''}
            placeholder="https://exemplo.com/capa.png"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {settings?.coverImage && (
            <div className="mt-2">
              <img src={settings.coverImage} alt="Capa atual" className="w-full h-24 rounded-xl object-cover border border-input" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Slogan / tagline (aparece na capa)
          </label>
          <input
            name="tagline"
            defaultValue={settings?.tagline ?? ''}
            placeholder="Ex: A melhor pizza da cidade! 🍕"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* ── Informações do cardápio (instagram, endereço) ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Informações públicas (Mais informações)</h2>
        <p className="text-xs text-muted-foreground">
          Essas informações aparecem no botão "Mais informações" do cardápio digital.
        </p>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <Instagram className="h-4 w-4" /> Instagram
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">@</span>
            <input
              name="instagram"
              defaultValue={(settings?.instagram ?? '').replace('@', '')}
              placeholder="nomedoperfil"
              className="flex-1 px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ao clicar, o cliente será redirecionado para o seu perfil no Instagram.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> Endereço
          </label>
          <input
            name="address"
            defaultValue={settings?.address ?? ''}
            placeholder="Rua Exemplo, 123 - Bairro, Cidade - UF"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* ── Formas de pagamento ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Formas de pagamento aceitas</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Selecione as formas de pagamento que você aceita. Será exibido no cardápio.
        </p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePayment(p)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all',
                selectedPayments.includes(p)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-foreground hover:border-primary/50'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Status de funcionamento ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Status de funcionamento</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Abertura/Fechamento manual
          </label>
          <select
            name="manualOpen"
            defaultValue={settings.manualOpen === true ? 'true' : settings.manualOpen === false ? 'false' : ''}
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Automático (seguir horários)</option>
            <option value="true">Forçar ABERTO agora</option>
            <option value="false">Forçar FECHADO agora</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Mensagem quando fechado
          </label>
          <input
            name="closedMessage"
            defaultValue={settings.closedMessage ?? ''}
            placeholder="Ex: Voltamos amanhã às 11h! 🍕"
            className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* ── Horários de funcionamento ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Horários de funcionamento</h2>
        </div>

        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
              <input
                type="checkbox"
                name={`day_${h.dayOfWeek}_open`}
                defaultChecked={h.isOpen}
                className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="text-sm text-foreground w-16">{DAYS[h.dayOfWeek]}</span>
            </label>

            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                name={`day_${h.dayOfWeek}_open_time`}
                defaultValue={h.openTime}
                className="px-2 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-muted-foreground text-sm">até</span>
              <input
                type="time"
                name={`day_${h.dayOfWeek}_close_time`}
                defaultValue={h.closeTime}
                className="px-2 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        ))}
      </div>

      <SubmitButton />
    </form>
  )
}
