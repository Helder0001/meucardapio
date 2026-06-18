// app/(legal)/termos/page.tsx

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso — Meu Cardápio',
  description: 'Termos e condições de uso da plataforma Meu Cardápio.',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-5 py-16">
        {/* Voltar */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-500 transition-colors mb-10">
          ← Voltar para o início
        </Link>

        <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">Termos de Uso</h1>
        <p className="text-sm text-gray-400 mb-10">Última atualização: junho de 2025</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-gray-600 dark:text-gray-400">

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou usar a plataforma <strong>Meu Cardápio</strong> ("Plataforma"), você concorda com estes
              Termos de Uso. Se você não concorda com qualquer parte destes termos, não poderá usar a Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">2. Descrição do Serviço</h2>
            <p>
              O Meu Cardápio é uma plataforma SaaS que oferece cardápio digital, gerenciamento de pedidos, integração
              com PIX via Mercado Pago, kanban de cozinha, relatórios e outras funcionalidades para estabelecimentos
              alimentícios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">3. Cadastro e Conta</h2>
            <p>
              Para usar a Plataforma, você deve criar uma conta com informações verdadeiras e precisas. Você é
              responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades
              realizadas sob sua conta.
            </p>
            <p className="mt-2">
              O cadastro está disponível apenas para pessoas físicas ou jurídicas com capacidade legal para celebrar
              contratos. Menores de 18 anos só podem usar a Plataforma com autorização dos responsáveis legais.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">4. Planos e Pagamento</h2>
            <p>
              A Plataforma é oferecida em planos pagos com período de teste gratuito de 7 (sete) dias. Após o período
              de teste, a cobrança é realizada mensalmente no cartão de crédito cadastrado.
            </p>
            <p className="mt-2">
              O cancelamento pode ser feito a qualquer momento pelo painel do usuário. Não há reembolso proporcional
              por fração de período já pago, exceto nos casos previstos no Código de Defesa do Consumidor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">5. Uso Aceitável</h2>
            <p>Você concorda em não utilizar a Plataforma para:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Atividades ilegais ou que violem direitos de terceiros;</li>
              <li>Envio de conteúdo ofensivo, difamatório ou fraudulento;</li>
              <li>Tentativas de acesso não autorizado a sistemas ou dados;</li>
              <li>Revenda ou sublicenciamento da Plataforma sem autorização prévia;</li>
              <li>Uso de scrapers, bots ou automações não autorizadas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">6. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo, código, design e marca da Plataforma são de propriedade exclusiva do Meu Cardápio ou de
              seus licenciadores. Você recebe uma licença limitada, não exclusiva e intransferível para usar a
              Plataforma conforme estes Termos.
            </p>
            <p className="mt-2">
              O conteúdo inserido por você (cardápios, produtos, imagens) permanece de sua propriedade. Ao inseri-lo,
              você concede ao Meu Cardápio uma licença para exibi-lo e processá-lo conforme necessário para o
              funcionamento do serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">7. Limitação de Responsabilidade</h2>
            <p>
              A Plataforma é fornecida "no estado em que se encontra". O Meu Cardápio não garante disponibilidade
              ininterrupta do serviço e não se responsabiliza por danos indiretos, incidentais ou consequenciais
              decorrentes do uso ou da impossibilidade de uso da Plataforma.
            </p>
            <p className="mt-2">
              Nossa responsabilidade máxima em qualquer hipótese fica limitada ao valor pago pelo assinante nos
              últimos 3 (três) meses de serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">8. Integração com Terceiros</h2>
            <p>
              A Plataforma pode integrar serviços de terceiros (Mercado Pago, WhatsApp, etc.). O uso dessas integrações
              está sujeito aos termos e políticas desses terceiros, pelos quais o Meu Cardápio não se responsabiliza.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">9. Cancelamento e Encerramento</h2>
            <p>
              Você pode cancelar sua conta a qualquer momento pelo painel. O Meu Cardápio se reserva o direito de
              suspender ou encerrar contas que violem estes Termos, com aviso prévio quando possível.
            </p>
            <p className="mt-2">
              Após o cancelamento, seus dados serão mantidos por até 90 (noventa) dias antes de serem excluídos
              definitivamente, conforme nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">10. Alterações nos Termos</h2>
            <p>
              O Meu Cardápio pode atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas por
              e-mail ou notificação na Plataforma. O uso continuado após a vigência das alterações constitui aceite.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">11. Lei Aplicável e Foro</h2>
            <p>
              Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de São Paulo/SP para
              resolução de quaisquer conflitos, com renúncia a qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">12. Contato</h2>
            <p>
              Para dúvidas sobre estes Termos, entre em contato pelo e-mail:{' '}
              <a href="mailto:contato@meucardapio.app" className="text-orange-500 hover:underline">
                contato@meucardapio.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-sm text-gray-400">
          <Link href="/privacidade" className="hover:text-orange-500 transition-colors">Política de Privacidade</Link>
          <span>·</span>
          <Link href="/" className="hover:text-orange-500 transition-colors">Início</Link>
        </div>
      </div>
    </div>
  )
}
