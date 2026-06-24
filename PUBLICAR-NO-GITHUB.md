# Como Publicar no GitHub e Vercel
## Guia para Iniciantes — Sem complicação

---

## Opção A — Script Automático (RECOMENDADO)

Faça tudo com um clique:

1. Abra a pasta `foodsaas`
2. Clique com botão direito em **`publicar.ps1`**
3. Selecione **"Executar com o PowerShell"**
4. Siga as instruções na tela

O script vai:
- Criar o repositório privado no GitHub
- Enviar todo o código
- Fazer login na Vercel
- Configurar as variáveis de ambiente
- Fazer o primeiro deploy

---

## Opção B — Passo a passo manual

Se preferir fazer você mesmo:

### 1. Criar repositório no GitHub

1. Acesse https://github.com/new
2. Repository name: `foodsaas`
3. Marque **Private**
4. NÃO marque "Initialize this repository"
5. Clique em **Create repository**

### 2. Enviar o código

Abra o PowerShell na pasta `foodsaas` e execute:

```powershell
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/foodsaas.git
git push -u origin main
```

Vai pedir seu usuário e senha do GitHub.
**Atenção:** a senha é um **Token**, não sua senha normal.

**Como criar o token:**
1. Acesse https://github.com/settings/tokens/new
2. Note: `foodsaas`
3. Expiration: 90 days
4. Scopes: marque `repo`
5. Clique em **Generate token**
6. Copie o token (ghp_...)
7. Use como "senha" quando o Git pedir

### 3. Conectar com a Vercel

1. Acesse https://vercel.com e crie conta (use o GitHub para entrar)
2. Clique em **Add New Project**
3. Clique em **Import** ao lado do repositório `foodsaas`
4. Em **Framework Preset** selecione **Next.js**
5. **NÃO clique em Deploy ainda** — primeiro configure as variáveis

### 4. Configurar variáveis de ambiente na Vercel

Antes de fazer deploy, clique em **Environment Variables** e adicione:

| Variável | Onde obter |
|----------|-----------|
| `DATABASE_URL` | neon.tech → seu projeto → connection string |
| `DIRECT_URL` | mesma URL do DATABASE_URL |
| `AUTH_SECRET` | gere com: `openssl rand -base64 32` |
| `UPSTASH_REDIS_REST_URL` | upstash.com → seu banco → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | upstash.com → seu banco → REST Token |
| `S3_ACCESS_KEY_ID` | Cloudflare R2 → API Tokens |
| `S3_SECRET_ACCESS_KEY` | Cloudflare R2 → API Tokens |
| `S3_BUCKET_NAME` | `foodsaas-uploads` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | `https://SEU_ID.r2.cloudflarestorage.com` |
| `MERCADOPAGO_ACCESS_TOKEN` | mercadopago.com.br/developers |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | mercadopago.com.br/developers |
| `MERCADOPAGO_WEBHOOK_SECRET` | mercadopago.com.br/developers → Webhooks |
| `NEXT_PUBLIC_APP_URL` | `https://foodsaas.vercel.app` (sua URL da Vercel) |
| `NODE_ENV` | `production` |
| `ENCRYPTION_KEY` | gere com: `openssl rand -hex 32` |
| `OTP_SALT` | gere com: `openssl rand -hex 16` |
| `CRON_SECRET` | qualquer senha longa aleatória |

### 5. Fazer o deploy

Clique em **Deploy** e aguarde 2-3 minutos.

### 6. Configurar o banco de dados de produção

Após o deploy, abra o PowerShell e execute:

```powershell
# Substitua pela sua URL do Neon
$env:DATABASE_URL = "postgresql://usuario:senha@ep-xxx.neon.tech/foodsaas"
$env:DIRECT_URL   = "postgresql://usuario:senha@ep-xxx.neon.tech/foodsaas"

pnpm exec prisma migrate deploy
pnpm db:seed
```

---

## Como enviar atualizações futuras

Toda vez que alterar algo no código, execute o script `atualizar.ps1`:
- Clique com botão direito → "Executar com o PowerShell"
- Digite uma descrição do que mudou
- O Vercel faz novo deploy automaticamente em 2-3 minutos

---

## Serviços gratuitos necessários

| Serviço | Link | Para que serve | Limite grátis |
|---------|------|----------------|---------------|
| **Neon** | neon.tech | Banco de dados | 0.5 GB |
| **Upstash** | upstash.com | Cache e sessões | 10k req/dia |
| **Cloudflare R2** | dash.cloudflare.com | Fotos dos produtos | 10 GB |
| **Vercel** | vercel.com | Hospedagem do site | Uso razoável |
| **Mercado Pago** | mercadopago.com.br/developers | Pagamento PIX | Gratuito (cobra % por venda) |
| **Resend** | resend.com | Emails (recuperar senha) | 3.000/mês |

---

## URL do seu sistema após o deploy

- **Painel:** `https://foodsaas.vercel.app/login`
- **Cardápio demo:** `https://foodsaas.vercel.app/menu/pizzaria-do-jose`

---

## Domínio personalizado (opcional)

Para ter `pedidos.seurestaurante.com.br`:

1. Compre o domínio no Registro.br (~R$ 40/ano) ou HostGator
2. Na Vercel → seu projeto → Settings → Domains
3. Adicione seu domínio e siga as instruções de DNS
4. Atualize `NEXT_PUBLIC_APP_URL` para o novo domínio
5. Execute `atualizar.ps1` para fazer novo deploy

---

## Suporte

Se travar em algum passo, verifique o arquivo `DEPLOY.md` para instruções mais detalhadas.
