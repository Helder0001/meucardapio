# Guia de Deploy em Produção

> Tempo estimado: 30–60 minutos na primeira vez

---

## Serviços necessários (todos têm plano gratuito para começar)

| Serviço | Plano gratuito | Para quê |
|---------|---------------|---------|
| [Vercel](https://vercel.com) | ✅ Sim | Hospedagem do Next.js |
| [Neon](https://neon.tech) | ✅ 0.5GB | PostgreSQL serverless |
| [Upstash](https://upstash.com) | ✅ 10k req/dia | Redis |
| [Cloudflare R2](https://cloudflare.com/r2) | ✅ 10GB | Storage de imagens |
| [Resend](https://resend.com) | ✅ 3k emails/mês | Emails transacionais |
| [Mercado Pago](https://mercadopago.com.br/developers) | ✅ Sandbox | Pagamentos PIX |

---

## Passo 1 — Banco de dados (Neon)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta
2. Crie um projeto chamado `foodsaas`
3. Copie as duas strings de conexão:
   - **Connection string** → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL`

```
postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/foodsaas?sslmode=require
```

---

## Passo 2 — Redis (Upstash)

1. Acesse [upstash.com](https://upstash.com) e crie uma conta
2. Crie um banco Redis na região **São Paulo (sa-east-1)**
3. Copie:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## Passo 3 — Storage (Cloudflare R2)

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Crie um bucket chamado `foodsaas-uploads`
3. Configure como público (ou use URL pré-assinada)
4. Em **Manage R2 API Tokens**, crie um token com acesso ao bucket
5. Configure:
   - `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` → do token criado
   - `S3_ENDPOINT` → `https://ACCOUNT_ID.r2.cloudflarestorage.com`
   - `S3_BUCKET_NAME` → `foodsaas-uploads`
   - `S3_REGION` → `auto`

---

## Passo 4 — Mercado Pago

1. Acesse [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers)
2. Crie uma aplicação
3. Copie as credenciais de **Produção**:
   - `MERCADOPAGO_ACCESS_TOKEN` (começa com `APP_USR-...`)
   - `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`
4. Configure o webhook:
   - URL: `https://seudominio.vercel.app/api/webhooks/mercadopago`
   - Evento: `payment`
   - Copie o **Webhook Secret** → `MERCADOPAGO_WEBHOOK_SECRET`

> ⚠️ Para testar, use as credenciais de **Sandbox** primeiro

---

## Passo 5 — Email (Resend)

1. Acesse [resend.com](https://resend.com) e crie uma conta
2. Adicione e verifique seu domínio
3. Crie uma API Key
4. Configure `RESEND_API_KEY` e `EMAIL_FROM`

---

## Passo 6 — Deploy na Vercel

### 6.1 Instalar CLI
```bash
npm install -g vercel
vercel login
```

### 6.2 Inicializar projeto
```bash
cd foodsaas
vercel link
```

### 6.3 Configurar variáveis de ambiente
```bash
# Copiar o arquivo de exemplo e preencher
cp .env.example .env.production

# Subir para a Vercel (uma por vez ou via dashboard)
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add AUTH_SECRET production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add S3_ACCESS_KEY_ID production
vercel env add S3_SECRET_ACCESS_KEY production
vercel env add S3_BUCKET_NAME production
vercel env add S3_REGION production
vercel env add S3_ENDPOINT production
vercel env add MERCADOPAGO_ACCESS_TOKEN production
vercel env add NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY production
vercel env add MERCADOPAGO_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production
vercel env add EMAIL_FROM production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add CRON_SECRET production

# Gerar AUTH_SECRET:
# openssl rand -base64 32

# NEXT_PUBLIC_APP_URL deve ser a URL final da Vercel:
# https://foodsaas.vercel.app  (ou seu domínio customizado)
```

### 6.4 Rodar migrations no banco de produção
```bash
# Configurar DATABASE_URL local apontando para Neon
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."

pnpm prisma migrate deploy
pnpm db:seed   # Opcional: dados de exemplo
```

### 6.5 Deploy
```bash
vercel --prod
```

---

## Passo 7 — Configurar domínio customizado (opcional)

1. No painel da Vercel → Settings → Domains
2. Adicione `seudominio.com.br`
3. Aponte o DNS conforme instrução da Vercel
4. Atualize `NEXT_PUBLIC_APP_URL` para o novo domínio

---

## Passo 8 — Criar o usuário Master Admin

Após o deploy, criar o primeiro usuário master via seed ou diretamente no banco:

```bash
# Via script (recomendado)
DATABASE_URL="postgresql://..." tsx scripts/create-master.ts

# Ou diretamente no Prisma Studio
DATABASE_URL="postgresql://..." pnpm db:studio
```

---

## Verificações pós-deploy

```bash
# Testar webhook do MP (sandbox)
curl -X POST https://seuapp.vercel.app/api/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{"id":"123"}}'

# Verificar cron jobs
curl -H "x-cron-secret: SEU_SECRET" \
  https://seuapp.vercel.app/api/internal/cron/cleanup

# Verificar health geral
curl https://seuapp.vercel.app/api/auth/providers
```

---

## Monitoramento

### Sentry (opcional mas recomendado)
```bash
npx @sentry/wizard@latest -i nextjs
# Seguir o wizard interativo
```

### Vercel Analytics
- Ativar em: Vercel Dashboard → Analytics → Enable

---

## Escalabilidade

O projeto está configurado para escalar automaticamente na Vercel.  
Para 1.000+ tenants ativos simultaneamente, considere:

- **Neon Pro** ($19/mês): mais conexões e branching
- **Upstash Pro** ($10/mês): sem limite de req/dia
- **Vercel Pro** ($20/mês): sem timeout de 60s, mais regiões

Para 10.000+ tenants:
- Migrar para **PlanetScale** ou **Supabase** com connection pooling dedicado
- Adicionar **Vercel KV** para sessões
- Considerar **Cloudflare Workers** para edge caching do cardápio

---

## Backup

O Neon faz backups automáticos. Para backup manual:

```bash
# Exportar banco
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restaurar
psql $DATABASE_URL < backup_20241231.sql
```

---

## Suporte e Manutenção

- Logs em tempo real: `vercel logs --follow`
- Reverter deploy: `vercel rollback`
- Variáveis de ambiente: `vercel env ls`
