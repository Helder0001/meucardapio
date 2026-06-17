'use client'

// components/dashboard/onboarding/onboarding-client.tsx
// Wizard interativo de 4 passos para configuração inicial do tenant.

import { useState } from \'react\'
import { useRouter } from \'next/navigation\'
import { CheckCircle, Circle, ArrowRight, ExternalLink } from \'lucide-react\'

interface Progress {
  hasCategory: boolean
  hasProduct: boolean
  hasHours: boolean
  hasWhatsapp: boolean
}

interface Props {
  tenantId: string
  tenantName: string
  progress: Progress
}

const STEPS = [
  {
    key: \'hasCategory\' as keyof Progress,
    title: \'Crie sua primeira categoria\',
    description: \'Organize seu cardápio em categorias como "Pizzas", "Bebidas", "Sobremesas"...\',
    href: \'/dashboard/menu/categories\',
    emoji: \'📂\',
  },
  {
    key: \'hasProduct\' as keyof Progress,
    title: \'Adicione seu primeiro produto\',
    description: \'Cadastre um produto com nome, preço e foto. Use IA para gerar a descrição!\',
    href: \'/dashboard/menu/products/new\',
    emoji: \'🍕\',
  },
  {
    key: \'hasHours\' as keyof Progress,
    title: \'Configure seu horário de funcionamento\',
    description: \'Defina os dias e horários em que seu estabelecimento aceita pedidos.\',
    href: \'/dashboard/settings\',
    emoji: \'🕐\',
  },
  {
    key: \'hasWhatsapp\' as keyof Progress,
    title: \'Conecte o WhatsApp (opcional)\',
    description: \'Receba notificações de novos pedidos e envie atualizações automáticas de status.\',
    href: \'/dashboard/settings/whatsapp\',
    emoji: \'💬\',
  },
]

async function completeOnboarding(tenantId: string) {
  await fetch(\'/api/onboarding/complete\', {
    method: \'POST\',
    headers: { \'Content-Type\': \'application/json\'  },
    body: JSON.stringify({ tenantId }),
  })
}

export function OnboardingClient({ tenantId, tenantName, progress }: Props) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)

  const completedCount = STEPS.filter((s) => progress[s.key]).length
  const allEssential = progress.hasCategory && progress.hasProduct && progress.hasHours

  const handleFinish = async () => {
    setCompleting(true)
    await completeOnboarding(tenantId)
    router.push(\'/dashboard\')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-gray-900">
            Bem-vindo, {tenantName}!
          </h1>
          <p className="text-gray-500 mt-2">
            Complete esses passos para começar a receber pedidos
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>{completedCount} de {STEPS.length} concluídos</span>
            <span>{Math.round((completedCount / STEPS.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {STEPS.map((step, i) => {
            const done = progress[step.key]
            return (
              <div
                key={step.key}
                className={`bg-white rounded-xl border-2 p-5 flex items-center gap-4 transition-all ${
                  done
                    ? \'border-green-200 bg-green-50\'
                    : \'border-gray-200 hover:border-orange-300\'
                }`}
              >
                <div className="text-3xl">{step.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${done ? \'text-green-700 line-through\' : \'text-gray-900\'}`}>
                      {step.title}
                    </h3>
                    {step.key === \'hasWhatsapp\' && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">opcional</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
                </div>
                {done ? (
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                ) : (
                  <a
                    href={step.href}
                    className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700 flex-shrink-0"
                  >
                    Configurar <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleFinish}
            disabled={completing || !allEssential}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {completing ? \'Finalizando...\' : \'Ir para o Dashboard\'}
            <ArrowRight className="w-4 h-4" />
          </button>
          {!allEssential && (
            <p className="text-sm text-gray-400">
              Complete os 3 primeiros passos para continuar
            </p>
          )}
          <button
            onClick={handleFinish}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Pular e configurar depois
          </button>
        </div>
      </div>
    </div>
  )
}
