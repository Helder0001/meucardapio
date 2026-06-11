# Relatório de Segurança — FoodSaaS
## Status das Correções

Última atualização: Todas as 14 vulnerabilidades corrigidas

---

## ✅ CRÍTICAS — Todas corrigidas

### VULN-01 — OTP em texto puro ✅ CORRIGIDO
- **Arquivo:** `lib/utils/otp.ts`
- **Correção:** OTP nunca armazenado no banco. Hash SHA-256 com salt no Redis.
  Comparação timing-safe com `crypto.timingSafeEqual`.
- **Como verificar:** `grep -r "otpCode" prisma/schema.prisma` — campo existe
  apenas como nullable para cleanup, nunca recebe valor direto.

### VULN-02 — API Key WhatsApp em base64 ✅ CORRIGIDO
- **Arquivos:** `lib/security/crypto.ts`, `app/api/whatsapp/connect/route.ts`,
  `lib/messaging/evolution.ts`
- **Correção:** AES-256-GCM com IV aleatório por operação. Chave de 256 bits
  configurada via `ENCRYPTION_KEY` (obrigatória).
- **Como verificar:** `grep "base64" app/api/whatsapp/connect/route.ts` — não
  existe mais. Substituído por `encrypt()`.

### VULN-03 — Bypass de webhook em desenvolvimento ✅ CORRIGIDO
- **Arquivo:** `app/api/webhooks/mercadopago/route.ts`
- **Correção:** Removido completamente o bloco `if (NODE_ENV === 'development')`.
  Webhook SEMPRE valida assinatura HMAC-SHA256. Sem `MERCADOPAGO_WEBHOOK_SECRET`
  → rejeita com 401.
- **Como verificar:** `grep "development" app/api/webhooks/mercadopago/route.ts`
  — não deve aparecer.

### VULN-04 — Sem limite de payload ✅ CORRIGIDO
- **Arquivo:** `middleware.ts`
- **Correção:** Verificação de `content-length` antes de processar.
  1MB para APIs gerais, 6MB para upload de imagens. Retorna 413 se exceder.

---

## ✅ ALTAS — Todas corrigidas

### VULN-05 — localStorage sem sanitização ✅ CORRIGIDO
- **Arquivo:** `lib/store/cart.ts`
- **Correção:** `partialize` remove `customerPhone`, `customerName`, `isVerified`,
  `tableId` e `tableNumber` da persistência. Dados sensíveis ficam apenas na
  memória da sessão.

### VULN-06 — Enumeração de tenants ✅ CORRIGIDO
- **Arquivo:** `app/(storefront)/menu/[slug]/page.tsx`
- **Correção:** Resposta idêntica para slug inexistente e para tenant suspenso.
  Atacante não consegue diferenciar os dois casos.

### VULN-07 — Rate limit OTP burlável por múltiplos IPs ✅ CORRIGIDO
- **Arquivo:** `lib/security/rate-limit.ts`, `lib/utils/otp.ts`
- **Correção:** Rate limit aplicado simultaneamente por IP e por telefone.
  Mesmo com 100 IPs diferentes, o atacante é bloqueado via chave do telefone.

### VULN-08 — Logs de auditoria deletáveis ✅ CORRIGIDO
- **Arquivo:** `prisma/migrations/audit_immutable/migration.sql`
- **Correção:** Políticas RLS no PostgreSQL bloqueiam `DELETE` e `UPDATE`
  na tabela `AuditLog` para todos os usuários.
- **Como aplicar:** `psql $DATABASE_URL -f prisma/migrations/audit_immutable/migration.sql`

### VULN-09 — MIME spoofing no upload ✅ CORRIGIDO
- **Arquivo:** `app/api/upload/route.ts`
- **Correção:** Validação por magic bytes reais do arquivo (não `Content-Type`
  declarado). Um `.php` renomeado para `.jpg` é detectado e rejeitado.

### VULN-10 — Refresh token não invalida após troca de senha ✅ CORRIGIDO
- **Arquivo:** `lib/auth/config.ts`
- **Correção:** Campo `passwordChangedAt` incluído no JWT. Callback `jwt()`
  verifica se o token foi emitido ANTES da troca de senha. Se sim, retorna
  `null` forçando novo login.

---

## ✅ MÉDIAS — Todas corrigidas

### VULN-11 — Sem validação de Content-Type ✅ CORRIGIDO
- **Arquivo:** `lib/security/api-handler.ts`
- **Correção:** Wrapper `secureHandler()` valida `Content-Type: application/json`
  em todas as rotas que exigem JSON. Retorna 415 se inválido.

### VULN-12 — Stacktraces expostos ✅ CORRIGIDO
- **Arquivos:** Todos os route handlers e server actions
- **Correção:** Try/catch em todos os handlers. Erros internos logados com
  `console.error` (visível nos logs do servidor), mas cliente recebe apenas
  `"Erro interno. Tente novamente."`.

### VULN-13 — Sem timeout de inatividade ✅ CORRIGIDO
- **Arquivos:** `hooks/use-inactivity-logout.ts`, `components/shared/inactivity-warning.tsx`
- **Correção:** Logout automático após 30 minutos sem atividade. Aviso visual
  2 minutos antes com opção de continuar. Aplicado no layout do dashboard.

### VULN-14 — Clickjacking no cardápio ✅ CORRIGIDO
- **Arquivo:** `middleware.ts`
- **Correção:** `X-Frame-Options: DENY` para dashboard (nunca em iframe),
  `X-Frame-Options: SAMEORIGIN` para cardápio público (mais flexível).
  CSP `frame-ancestors` aplicado em produção.

---

## Novas variáveis de ambiente necessárias

Adicione ao `.env.local` e às variáveis da Vercel:

```bash
# Criptografia AES-256 (obrigatório para WhatsApp)
# Gere com: openssl rand -hex 32
ENCRYPTION_KEY="cole-aqui-64-caracteres-hex"

# Salt para OTPs (obrigatório para verificação de clientes)
# Gere com: openssl rand -hex 16
OTP_SALT="cole-aqui-32-caracteres-hex"
```

O instalador Windows (`instalar.ps1`) já gera essas chaves automaticamente.

---

## Aplicar RLS no banco (após deploy)

```bash
# Produção (Neon)
psql $DATABASE_URL -f prisma/migrations/audit_immutable/migration.sql

# Local (Docker)
docker exec -i foodsaas-postgres psql -U foodsaas -d foodsaas \
  -f /path/to/prisma/migrations/audit_immutable/migration.sql
```

---

## O que o sistema protege agora

| Vetor de ataque | Proteção |
|---|---|
| Manipulação de preços | Order Calculator 100% server-side |
| Roubo de OTP | Hash SHA-256 com salt, nunca texto puro |
| Roubo de API Keys | AES-256-GCM, chave no env |
| PIX falso simulado | Webhook sempre valida HMAC-SHA256 |
| Upload de malware | Magic bytes + Sharp reprocessa tudo |
| Brute force de OTP | Rate limit por IP E por telefone |
| Logs adulterados | RLS no banco (imutável) |
| XSS via produtos | Sanitização de todos os inputs |
| Sessão esquecida aberta | Auto-logout por inatividade (30 min) |
| Iframe malicioso | X-Frame-Options + CSP frame-ancestors |
| Dados do cliente no browser | localStorage sem campos sensíveis |
| Stacktrace vazado | Try/catch com mensagens genéricas |
| Enumeração de tenants | Resposta uniforme para inexistente/suspenso |
| Senha trocada, token antigo | JWT invalidado por passwordChangedAt |
| DoS por payload gigante | Limite 1MB (6MB para upload) no middleware |

---

## ✅ NOVAS — Corrigidas na revisão v2

### VULN-NEW-01 — SQL Injection em `$queryRaw` (Relatórios) ✅ CORRIGIDO
- **Arquivo:** `app/api/reports/export/route.ts`
- **Problema:** `startDate` e `endDate` vindos da URL eram interpolados diretamente
  em queries `$queryRaw`, permitindo SQL Injection por usuários autenticados.
- **Correção:** Parâmetros validados com Zod (`/^\d{4}-\d{2}-\d{2}$/`) antes
  de qualquer uso. Queries reescritas com `Prisma.sql` para parametrização segura.
- **Como verificar:** `grep -n "startDate\|endDate" app/api/reports/export/route.ts`
  — não deve haver template literals com essas variáveis dentro de `$queryRaw`.

### VULN-NEW-02 — Validação ausente de datas em relatórios ✅ CORRIGIDO
- **Arquivo:** `app/api/reports/export/route.ts`
- **Problema:** `new Date(startDate)` sem validação prévia retornava `Invalid Date`
  silenciosamente, podendo causar erros não tratados ou comportamento indefinido.
- **Correção:** Schema Zod com regex `/^\d{4}-\d{2}-\d{2}$/` retorna 400 para
  qualquer formato inválido antes de tocar no banco.

### VULN-NEW-03 — IDOR em `/api/orders/[id]/status` ✅ CORRIGIDO
- **Arquivo:** `app/api/orders/[id]/status/route.ts`, `actions/orders/create-order.ts`
- **Problema:** Endpoint sem autenticação expunha QR Code PIX, status de pagamento
  e timestamps de qualquer pedido para qualquer pessoa com o orderId.
- **Correção:** Acesso agora requer uma das duas condições:
  (A) sessão JWT de staff autenticado (com verificação de tenantId), ou
  (B) token HMAC-SHA256 gerado pelo servidor no momento do checkout (`statusToken`
  retornado por `createOrderAction`). QR Code só é retornado enquanto não expirado.
- **Nova variável:** `ORDER_TOKEN_SECRET` (obrigatória em produção).

### VULN-NEW-04 — Logs de debug sensíveis em produção ✅ CORRIGIDO
- **Arquivo:** `proxy.ts`
- **Problema:** `console.log` registrava role e path de todas as requisições
  em todos os ambientes, expondo dados nos painéis de log de produção.
- **Correção:** Logs envolvidos em `if (process.env.NODE_ENV === 'development')`.

### VULN-NEW-05 — `cookies.txt` com session token no repositório ✅ CORRIGIDO
- **Arquivo:** `.gitignore`, `cookies.txt`
- **Problema:** `cookies.txt` com JWT de sessão de produção estava incluído no
  repositório e não constava no `.gitignore`.
- **Correção:** `cookies.txt` adicionado ao `.gitignore` e seu conteúdo zerado.
- **Ação manual obrigatória:** Invalidar a sessão exposta trocando `AUTH_SECRET`
  no painel da Vercel. Verificar histórico Git com `git log --all -- cookies.txt`.

---

## Novas variáveis de ambiente necessárias (v2)

```bash
# Token para polling de status de pedido sem login do cliente
# Gere com: openssl rand -hex 32
ORDER_TOKEN_SECRET="cole-aqui-64-caracteres-hex"
```

---

## ✅ Melhorias funcionais aplicadas (v3)

### MELHORIA-01 — Webhook de renovação de assinatura integrado
- **Arquivo:** `app/api/webhooks/mercadopago/route.ts`
- O handler `handleSubscriptionWebhook` existia mas nunca era chamado.
- **Correção:** Adicionado `case 'subscription_preapproval'` no roteador de eventos do POST.
  Tenants pagantes agora têm o status atualizado corretamente em renovações e cancelamentos.

### MELHORIA-02 — Healthcheck endpoint
- **Arquivo:** `app/api/health/route.ts`
- Endpoint GET `/api/health` verifica banco, Redis e variáveis de ambiente.
- Resposta pública: `{ status: "ok" | "degraded" }` com HTTP 200/503.
- Resposta interna (com `x-cron-secret`): latências e detalhes de cada check.
- Adicionado ao cron da Vercel a cada 5 minutos.

### MELHORIA-03 — Estoque integrado ao fluxo de pedidos
- **Arquivos:** `lib/utils/order-calculator.ts`, `actions/orders/create-order.ts`
- `calculateOrder` agora valida estoque disponível antes de aceitar o pedido.
- Retorna erro amigável: "X está esgotado" ou "X tem apenas N unidade(s)".
- `createOrderAction` decrementa o estoque dentro da transação do banco.

### MELHORIA-04 — Notificações sonoras e push no dashboard
- **Arquivos:** `app/api/notifications/stream/route.ts`, `hooks/use-dashboard-notifications.ts`
- SSE stream dedicado para notificações do dashboard (separado do kanban).
- Som de alerta sintético via Web Audio API (sem dependências externas).
- Notificação Push nativa do browser (Notification API) com permissão.
- Badge no título da aba: "(3) FoodSaaS — Dashboard".

### MELHORIA-05 — PWA completo com Service Worker
- **Arquivos:** `public/sw.js`, `components/shared/pwa-register.tsx`
- Service Worker com estratégia Cache First para assets e Network First para páginas.
- `PwaRegister` registra o SW automaticamente no layout.
- Adicionado ao `app/layout.tsx`.

### MELHORIA-06 — Onboarding pós-cadastro
- **Arquivos:** `app/(dashboard)/dashboard/onboarding/`, `app/api/onboarding/complete/`
- Wizard de 4 passos: categoria → produto → horários → WhatsApp.
- Progresso verificado em tempo real com status visual.
- Flag `onboardingCompleted` nas settings do tenant.
- Registro redireciona para `/dashboard/onboarding` em vez de `/dashboard`.

### MELHORIA-07 — MFA (TOTP) implementado
- **Arquivo:** `actions/auth/mfa.ts`
- Geração de secret TOTP + QR Code URI para Google Authenticator / Authy.
- Ativação com verificação do código antes de habilitar.
- 8 backup codes de uso único (armazenados como hashes SHA-256).
- Função `verifyMfaCode` pronta para integração no fluxo de login.
