# publicar.ps1
# Sobe o projeto para o GitHub (privado) e conecta com a Vercel
# Execute com: clique direito → "Executar com o PowerShell"

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "FoodSaaS — Publicar no GitHub"

function Write-Header { param([string]$t)
  Write-Host ""; Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan; Write-Host ""
}
function Write-OK   { param([string]$t) Write-Host "  ✓ $t" -ForegroundColor Green }
function Write-Step { param([string]$t) Write-Host "  ▶ $t" -ForegroundColor Yellow }
function Write-Info { param([string]$t) Write-Host "  $t"   -ForegroundColor Gray }

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║   FoodSaaS — Publicar no GitHub + Vercel        ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── Verificar pasta do projeto ──────────────────────────────
if (-not (Test-Path "$PSScriptRoot\package.json")) {
  Write-Host "  ERRO: Execute dentro da pasta foodsaas" -ForegroundColor Red
  Read-Host "  Pressione ENTER para sair"; exit 1
}
Set-Location $PSScriptRoot

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 1 — Suas informações do GitHub"
# ─────────────────────────────────────────────────────────────

Write-Host "  Você precisa de um Token do GitHub para continuar." -ForegroundColor White
Write-Host ""
Write-Host "  Como criar o token (1 minuto):" -ForegroundColor Yellow
Write-Host "  1. Acesse: https://github.com/settings/tokens/new" -ForegroundColor White
Write-Host "  2. Em 'Note' escreva: foodsaas" -ForegroundColor White
Write-Host "  3. Em 'Expiration' escolha: 90 days" -ForegroundColor White
Write-Host "  4. Em 'Select scopes' marque: " -ForegroundColor White
Write-Host "     [x] repo  (a primeira opção da lista)" -ForegroundColor White
Write-Host "  5. Clique em 'Generate token'" -ForegroundColor White
Write-Host "  6. Copie o token (começa com ghp_...)" -ForegroundColor White
Write-Host ""

$openBrowser = Read-Host "  Abrir o GitHub agora para criar o token? (s/n)"
if ($openBrowser -eq 's') {
  Start-Process "https://github.com/settings/tokens/new?description=foodsaas&scopes=repo"
  Write-Host ""
  Write-Host "  Aguardando você criar o token..." -ForegroundColor Gray
  Start-Sleep 3
}

Write-Host ""
$githubToken    = Read-Host "  Cole o token do GitHub aqui (ghp_...)"
$githubUsername = Read-Host "  Digite seu usuário do GitHub (ex: joaosilva)"
$repoName       = Read-Host "  Nome do repositório (ENTER para 'foodsaas')"
if (-not $repoName) { $repoName = "foodsaas" }

# Validar token
Write-Host ""
Write-Step "Validando token do GitHub..."
try {
  $headers = @{ Authorization = "token $githubToken"; "User-Agent" = "FoodSaaS-Deploy" }
  $user    = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
  Write-OK "Token válido! Olá, $($user.login)"
} catch {
  Write-Host "  ERRO: Token inválido. Verifique e tente novamente." -ForegroundColor Red
  Read-Host "  Pressione ENTER para sair"; exit 1
}

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 2 — Criando repositório privado no GitHub"
# ─────────────────────────────────────────────────────────────

Write-Step "Criando repositório '$repoName' (privado)..."

# Verificar se já existe
$repoExists = $false
try {
  $existingRepo = Invoke-RestMethod -Uri "https://api.github.com/repos/$githubUsername/$repoName" -Headers $headers
  $repoExists   = $true
  Write-Host "  ⚠ Repositório já existe. Usando o existente." -ForegroundColor Yellow
} catch { }

if (-not $repoExists) {
  $body = @{
    name        = $repoName
    private     = $true
    description = "FoodSaaS — Plataforma de cardápio digital e delivery"
    auto_init   = $false
  } | ConvertTo-Json

  try {
    $newRepo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method POST -Headers $headers `
      -ContentType "application/json" -Body $body
    Write-OK "Repositório criado: $($newRepo.html_url)"
  } catch {
    Write-Host "  ERRO ao criar repositório: $_" -ForegroundColor Red
    Read-Host "  Pressione ENTER para sair"; exit 1
  }
}

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 3 — Enviando código para o GitHub"
# ─────────────────────────────────────────────────────────────

# Verificar se Git está instalado
try {
  git --version | Out-Null
  Write-OK "Git encontrado"
} catch {
  Write-Host "  Git não encontrado. Instalando..." -ForegroundColor Yellow
  winget install --id Git.Git -e --source winget --silent 2>$null
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
  Start-Sleep 2
}

# Configurar Git (nome e email mínimos)
git config --global user.email "$githubUsername@users.noreply.github.com" 2>$null
git config --global user.name  "$githubUsername" 2>$null

Write-Step "Inicializando repositório Git local..."

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

# Verificar .gitignore — criar se não existir
if (-not (Test-Path ".gitignore")) {
  @"
node_modules/
.next/
.env
.env.local
.env.production
dist/
"@ | Set-Content ".gitignore"
}

# Garantir que .env.local não vai para o repo
if (Select-String -Path ".gitignore" -Pattern "\.env\.local" -Quiet -ErrorAction SilentlyContinue) {
  Write-OK ".env.local já está no .gitignore"
} else {
  Add-Content ".gitignore" "`n.env.local`n.env.production.local"
  Write-OK ".env.local adicionado ao .gitignore (suas senhas ficam seguras)"
}

Write-Step "Adicionando arquivos ao commit..."
git add .

$commitMsg = "feat: FoodSaaS — plataforma completa de cardapio digital e delivery"
git commit -m $commitMsg 2>$null
if ($LASTEXITCODE -ne 0) {
  # Pode já estar commitado
  Write-Info "Nada novo para commitar ou já commitado."
}

Write-Step "Enviando para o GitHub..."

# Configurar remote com autenticação no token
$remoteUrl = "https://$($githubToken)@github.com/$githubUsername/$repoName.git"

# Remover remote antigo se existir
git remote remove origin 2>$null

git remote add origin $remoteUrl
git push -u origin main --force 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
  Write-OK "Código enviado com sucesso!"
  # Remover token da URL do remote por segurança
  git remote set-url origin "https://github.com/$githubUsername/$repoName.git"
} else {
  Write-Host "  ERRO ao enviar código. Verifique sua conexão." -ForegroundColor Red
  Read-Host "Pressione ENTER para sair"; exit 1
}

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 4 — Conectando com a Vercel"
# ─────────────────────────────────────────────────────────────

Write-Host "  Verificando se a Vercel CLI está instalada..." -ForegroundColor Gray
$vercelOk = $false
try { vercel --version | Out-Null; $vercelOk = $true } catch { }

if (-not $vercelOk) {
  Write-Step "Instalando Vercel CLI..."
  npm install -g vercel --silent
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
}

Write-Host ""
Write-Host "  Agora vamos conectar com a Vercel." -ForegroundColor White
Write-Host "  Uma janela do navegador vai abrir para você fazer login." -ForegroundColor Yellow
Write-Host ""
Read-Host "  Pressione ENTER para continuar"

Write-Step "Fazendo login na Vercel..."
vercel login

if ($LASTEXITCODE -ne 0) {
  Write-Host "  ERRO ao fazer login na Vercel." -ForegroundColor Red
  Read-Host "Pressione ENTER para sair"; exit 1
}

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 5 — Configurar variáveis de ambiente na Vercel"
# ─────────────────────────────────────────────────────────────

Write-Host "  Antes de fazer o deploy, você precisa configurar os serviços:" -ForegroundColor White
Write-Host ""
Write-Host "  ┌──────────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  SERVIÇOS NECESSÁRIOS (todos têm plano gratuito)    │" -ForegroundColor Cyan
Write-Host "  │                                                      │" -ForegroundColor Cyan
Write-Host "  │  1. Neon (banco de dados):  https://neon.tech        │" -ForegroundColor Cyan
Write-Host "  │  2. Upstash (Redis):        https://upstash.com      │" -ForegroundColor Cyan
Write-Host "  │  3. Cloudflare R2 (fotos):  https://dash.cloudflare.com │" -ForegroundColor Cyan
Write-Host "  │  4. Mercado Pago:           https://mercadopago.com.br/developers │" -ForegroundColor Cyan
Write-Host "  └──────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Consulte o arquivo DEPLOY.md para instruções detalhadas" -ForegroundColor Yellow
Write-Host "  de como obter cada chave." -ForegroundColor Yellow
Write-Host ""

$configurarAgora = Read-Host "  Você já tem as chaves e quer configurar agora? (s/n)"

if ($configurarAgora -eq 's') {
  Write-Host ""
  Write-Host "  Cole as informações abaixo (ENTER para pular itens opcionais):" -ForegroundColor White
  Write-Host ""

  $vars = [ordered]@{}

  $vars["DATABASE_URL"]  = Read-Host "  DATABASE_URL (Neon)"
  $vars["DIRECT_URL"]    = Read-Host "  DIRECT_URL (Neon, geralmente igual ao DATABASE_URL)"

  $authSecret = [System.Convert]::ToBase64String(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  )
  $vars["AUTH_SECRET"] = $authSecret
  Write-Info "  AUTH_SECRET gerado automaticamente"

  $vars["UPSTASH_REDIS_REST_URL"]   = Read-Host "  UPSTASH_REDIS_REST_URL"
  $vars["UPSTASH_REDIS_REST_TOKEN"] = Read-Host "  UPSTASH_REDIS_REST_TOKEN"

  $vars["S3_ACCESS_KEY_ID"]     = Read-Host "  S3_ACCESS_KEY_ID (Cloudflare R2)"
  $vars["S3_SECRET_ACCESS_KEY"] = Read-Host "  S3_SECRET_ACCESS_KEY (Cloudflare R2)"
  $vars["S3_BUCKET_NAME"]       = Read-Host "  S3_BUCKET_NAME (ex: foodsaas-uploads)"
  $vars["S3_ENDPOINT"]          = Read-Host "  S3_ENDPOINT (ex: https://xxx.r2.cloudflarestorage.com)"
  $vars["S3_REGION"]            = "auto"

  $vars["MERCADOPAGO_ACCESS_TOKEN"]            = Read-Host "  MERCADOPAGO_ACCESS_TOKEN"
  $vars["NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"]  = Read-Host "  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"
  $vars["MERCADOPAGO_WEBHOOK_SECRET"]          = Read-Host "  MERCADOPAGO_WEBHOOK_SECRET"

  $resendKey = Read-Host "  RESEND_API_KEY (opcional — para emails)"
  if ($resendKey) { $vars["RESEND_API_KEY"] = $resendKey }

  $vars["NEXT_PUBLIC_APP_URL"] = "https://$repoName.vercel.app"
  $vars["NODE_ENV"]            = "production"

  $encKey = [System.BitConverter]::ToString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  ).Replace('-','').ToLower()
  $otpSalt = [System.BitConverter]::ToString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
  ).Replace('-','').ToLower()
  $cronSecret = [System.Guid]::NewGuid().ToString().Replace('-','')

  $vars["ENCRYPTION_KEY"] = $encKey
  $vars["OTP_SALT"]        = $otpSalt
  $vars["CRON_SECRET"]     = $cronSecret
  Write-Info "  ENCRYPTION_KEY, OTP_SALT e CRON_SECRET gerados automaticamente"

  Write-Host ""
  Write-Step "Configurando variáveis na Vercel..."
  foreach ($key in $vars.Keys) {
    if ($vars[$key]) {
      Write-Host "  Configurando $key..." -ForegroundColor Gray
      echo $vars[$key] | vercel env add $key production --force 2>$null
    }
  }
  Write-OK "Variáveis configuradas!"
} else {
  Write-Host ""
  Write-Host "  OK! Configure as variáveis manualmente em:" -ForegroundColor Yellow
  Write-Host "  https://vercel.com → seu projeto → Settings → Environment Variables" -ForegroundColor White
  Write-Host "  (Consulte DEPLOY.md para saber o que colocar em cada campo)" -ForegroundColor Gray
}

# ─────────────────────────────────────────────────────────────
Write-Header "PASSO 6 — Fazendo o primeiro deploy"
# ─────────────────────────────────────────────────────────────

Write-Step "Iniciando deploy na Vercel..."
Write-Host "  (isso pode levar 2-3 minutos)" -ForegroundColor Gray
Write-Host ""

vercel --prod --yes

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
  Write-Host "  ║           DEPLOY REALIZADO COM SUCESSO!          ║" -ForegroundColor Green
  Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Seu site está no ar!" -ForegroundColor Green
  Write-Host ""
  Write-Host "  URL do sistema:   https://$repoName.vercel.app" -ForegroundColor Cyan
  Write-Host "  Repositório:      https://github.com/$githubUsername/$repoName" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  PRÓXIMO PASSO OBRIGATÓRIO:" -ForegroundColor Yellow
  Write-Host "  Execute as migrations no banco de produção:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  1. Abra um novo terminal na pasta do projeto" -ForegroundColor White
  Write-Host "  2. Execute:" -ForegroundColor White
  Write-Host '     $env:DATABASE_URL="sua-url-do-neon"' -ForegroundColor Gray
  Write-Host '     pnpm exec prisma migrate deploy' -ForegroundColor Gray
  Write-Host '     pnpm db:seed' -ForegroundColor Gray
  Write-Host ""
  Write-Host "  Depois acesse: https://$repoName.vercel.app/login" -ForegroundColor Cyan
  Write-Host "  Email: admin@pizzariadojose.com" -ForegroundColor White
  Write-Host "  Senha: Admin@123" -ForegroundColor White

  $openSite = Read-Host "`n  Abrir o site agora? (s/n)"
  if ($openSite -eq 's') {
    Start-Process "https://$repoName.vercel.app"
  }
} else {
  Write-Host ""
  Write-Host "  Deploy falhou. Possíveis motivos:" -ForegroundColor Red
  Write-Host "  - Variáveis de ambiente incompletas" -ForegroundColor Yellow
  Write-Host "  - Erro de build (verifique: vercel logs)" -ForegroundColor Yellow
  Write-Host "  - Consulte DEPLOY.md para solução de problemas" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Pressione ENTER para fechar..."
Read-Host
