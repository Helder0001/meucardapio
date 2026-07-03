// app/(legal)/privacidade/page.tsx

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Meu Cardápio',
  description: 'Como o Meu Cardápio coleta, usa e protege seus dados pessoais.',
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-5 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-500 transition-colors mb-10">
          ← Voltar para o início
        </Link>

        <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-400 mb-10">Última atualização: junho de 2025</p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-600 dark:text-gray-400">

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">1. Quem somos</h2>
            <p>
              O <strong>Meu Cardápio</strong> é uma plataforma de gestão para estabelecimentos alimentícios. Esta
              Política descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais, em
              conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">2. Dados que coletamos</h2>
            <p><strong className="text-gray-800 dark:text-gray-200">Dados dos estabelecimentos (lojistas):</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Nome, e-mail, telefone e CNPJ para cadastro e faturamento;</li>
              <li>Dados do cardápio (produtos, categorias, preços, imagens);</li>
              <li>Dados de pedidos e relatórios de vendas;</li>
              <li>Logs de acesso e auditoria de segurança.</li>
            </ul>
            <p className="mt-4"><strong className="text-gray-800 dark:text-gray-200">Dados dos clientes finais (quem faz pedidos):</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Nome e telefone para identificação do pedido;</li>
              <li>E-mail (quando fornecido voluntariamente);</li>
              <li>Endereço de entrega (apenas quando modalidade Delivery);</li>
              <li>Histórico de pedidos e pontos de fidelidade.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">3. Como usamos seus dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Prestação do serviço contratado e processamento de pedidos;</li>
              <li>Comunicações transacionais (atualizações de pedido via WhatsApp);</li>
              <li>Geração de relatórios analíticos para o lojista;</li>
              <li>Prevenção a fraudes e segurança da plataforma;</li>
              <li>Cumprimento de obrigações legais;</li>
              <li>Melhoria contínua da Plataforma (dados anonimizados).</li>
            </ul>
            <p className="mt-3">
              Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins publicitários.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">4. Compartilhamento de dados</h2>
            <p>Seus dados podem ser compartilhados apenas com:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Mercado Pago</strong> — para processamento de pagamentos PIX;</li>
              <li><strong>Provedores de infraestrutura</strong> (servidores em nuvem) — dados criptografados;</li>
              <li><strong>Autoridades competentes</strong> — quando exigido por lei ou ordem judicial.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">5. Retenção de dados</h2>
            <p>
              Mantemos seus dados pelo tempo necessário à prestação do serviço e ao cumprimento de obrigações legais:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Dados de conta ativa: enquanto durar o vínculo contratual;</li>
              <li>Após cancelamento: até 90 dias para possível reativação;</li>
              <li>Dados fiscais/contábeis: 5 anos conforme legislação tributária;</li>
              <li>Logs de segurança: 6 meses.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">6. Seus direitos (LGPD)</h2>
            <p>Você tem direito a:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Acesso</strong> — saber quais dados temos sobre você;</li>
              <li><strong>Correção</strong> — corrigir dados incompletos ou incorretos;</li>
              <li><strong>Exclusão</strong> — solicitar a remoção de dados desnecessários;</li>
              <li><strong>Portabilidade</strong> — receber seus dados em formato estruturado;</li>
              <li><strong>Revogação</strong> — retirar o consentimento a qualquer momento;</li>
              <li><strong>Oposição</strong> — se opor ao tratamento em certas hipóteses.</li>
            </ul>
            <p className="mt-3">
              Para exercer esses direitos, entre em contato pelo e-mail{' '}
              <a href="mailto:privacidade@meucardapio.app" className="text-brand-500 hover:underline">
                privacidade@meucardapio.app
              </a>. Responderemos em até 15 dias úteis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">7. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Transmissão criptografada via HTTPS/TLS;</li>
              <li>Senhas armazenadas com hash bcrypt (nunca em texto claro);</li>
              <li>Controle de acesso por função (RBAC);</li>
              <li>Logs de auditoria para ações sensíveis;</li>
              <li>Backups criptografados com redundância geográfica.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">8. Cookies</h2>
            <p>
              Utilizamos cookies essenciais para autenticação e funcionamento da Plataforma. Não utilizamos cookies de
              rastreamento publicitário de terceiros. Você pode desativar cookies nas configurações do seu navegador,
              mas isso pode afetar o funcionamento da Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">9. Menores de idade</h2>
            <p>
              A Plataforma não é direcionada a menores de 18 anos. Se você tiver conhecimento de que um menor nos
              forneceu dados pessoais sem consentimento parental, entre em contato para que possamos excluí-los.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">10. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política periodicamente. A versão mais recente estará sempre disponível nesta
              página. Alterações significativas serão comunicadas por e-mail com pelo menos 15 dias de antecedência.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">11. Contato e DPO</h2>
            <p>
              Para questões sobre privacidade ou para exercer seus direitos:{' '}
              <a href="mailto:privacidade@meucardapio.app" className="text-brand-500 hover:underline">
                privacidade@meucardapio.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-sm text-gray-400">
          <Link href="/termos" className="hover:text-brand-500 transition-colors">Termos de Uso</Link>
          <span>·</span>
          <Link href="/" className="hover:text-brand-500 transition-colors">Início</Link>
        </div>
      </div>
    </div>
  )
}
