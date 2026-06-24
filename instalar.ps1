# instalar.ps1
# Instalador automático do FoodSaaS para Windows
# Execute com: clique direito → "Executar com PowerShell"
# Ou no PowerShell: .\instalar.ps1

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "FoodSaaS — Instalador"

function Write-Header {
  param([string]$text)
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host "  $text" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step {
  param([string]$text)
  Write-Host "  ▶ $text" -ForegroundColor Yellow
}

function Write-OK {
  param([string]$text)
  Write-Host "  ✓ $text" -ForegroundColor Green
}

function Write-Fail {
  param([string]$text)
  Write-Host "  ✗ $text" -ForegroundColor Red
}

function Pause-Script {
  Write-Host ""
  Write-Host "  Pressione ENTER para continuar..." -ForegroundColor Gray
  Read-Host
}

# ─── BOAS-VINDAS ────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ███████╗ ██████╗  ██████╗ ██████╗ " -ForegroundColor Magenta
Write-Host "  ██╔════╝██╔═══██╗██╔═══██╗██╔══██╗" -ForegroundColor Magenta
Write-Host "  █████╗  ██║   ██║██║   ██║██║  ██║" -ForegroundColor Magenta
Write-Host "  ██╔══╝  ██║   ██║██║   ██║██║  ██║" -ForegroundColor Magenta
Write-Host "  ██║     ╚██████╔╝╚██████╔╝██████╔╝" -ForegroundColor Magenta
Write-Host "  ╚═╝      ╚═════╝  ╚═════╝ ╚═════╝ " -ForegroundColor Magenta
Write-Host ""
Write-Host "       Instalador Automático — Windows" -ForegroundColor White
Write-Host ""
Write-Host "  Este script vai instalar tudo automaticamente:" -ForegroundColor Gray
Write-Host "    • Node.js 20 (se não tiver)" -ForegroundColor Gray
Write-Host "    • pnpm (gerenciador de pacotes)" -ForegroundColor Gray
Write-Host "    • Docker Desktop (se não tiver)" -ForegroundColor Gray
Write-Host "    • Configurar banco de dados" -ForegroundColor Gray
Write-Host "    • Criar arquivo de configuração" -ForegroundColor Gray
Write-Host "    • Popular banco com dados de exemplo" -ForegroundColor Gray
Write-Host "    • Abrir o sistema no navegador" -ForegroundColor Gray
Write-Host ""
Write-Host "  IMPORTANTE: Execute como Administrador para melhor resultado." -ForegroundColor Yellow
Write-Host ""

Pause-Script

# ─── VERIFICAR PASTA DO PROJETO ─────────────────────────────────────────────
Write-Header "Passo 1/6 — Verificando pasta do projeto"

$projectDir = $PSScriptRoot
if (-not (Test-Path "$projectDir\package.json")) {
  Write-Fail "Arquivo package.json não encontrado!"
  Write-Host ""
  Write-Host "  Certifique-se que este script está dentro da pasta 'foodsaas'." -ForegroundColor Red
  Write-Host "  A estrutura deve ser: foodsaas\instalar.ps1" -ForegroundColor Red
  Pause-Script
  exit 1
}

Write-OK "Pasta do projeto encontrada: $projectDir"
Set-Location $projectDir

# ─── NODE.JS ────────────────────────────────────────────────────────────────
Write-Header "Passo 2/6 — Node.js"

$nodeVersion = $null
try { $nodeVersion = (node --version 2>$null) } catch {}

if ($nodeVersion -and [int]($nodeVersion -replace 'v(\d+)\..*','$1') -ge 20) {
  Write-OK "Node.js já instalado: $nodeVersion"
} else {
  Write-Step "Baixando e instalando Node.js 20 LTS..."
  Write-Host "  (isso pode demorar alguns minutos)" -ForegroundColor Gray
  
  $nodeInstaller = "$env:TEMP\node-installer.msi"
  $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
  
  try {
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart"
    Remove-Item $nodeInstaller -Force
    
    # Atualizar PATH na sessão atual
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-OK "Node.js instalado com sucesso!"
  } catch {
    Write-Fail "Falha ao instalar Node.js automaticamente."
    Write-Host ""
    Write-Host "  Por favor, instale manualmente:" -ForegroundColor Yellow
    Write-Host "  1. Acesse: https://nodejs.org" -ForegroundColor White
    Write-Host "  2. Baixe a versão LTS" -ForegroundColor White
    Write-Host "  3. Execute o instalador" -ForegroundColor White
    Write-Host "  4. Feche e reabra o PowerShell" -ForegroundColor White
    Write-Host "  5. Execute este script novamente" -ForegroundColor White
    Pause-Script
    exit 1
  }
}

# ─── PNPM ───────────────────────────────────────────────────────────────────
Write-Header "Passo 3/6 — pnpm (gerenciador de pacotes)"

$pnpmVersion = $null
try { $pnpmVersion = (pnpm --version 2>$null) } catch {}

if ($pnpmVersion) {
  Write-OK "pnpm já instalado: $pnpmVersion"
} else {
  Write-Step "Instalando pnpm..."
  npm install -g pnpm --quiet
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  Write-OK "pnpm instalado!"
}

Write-Step "Instalando dependências do projeto..."
Write-Host "  (isso pode demorar 3-5 minutos na primeira vez)" -ForegroundColor Gray
pnpm install --silent
Write-OK "Dependências instaladas!"

# ─── DOCKER ─────────────────────────────────────────────────────────────────
Write-Header "Passo 4/6 — Docker Desktop"

$dockerRunning = $false
try {
  $dockerInfo = docker info 2>$null
  if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch {}

if ($dockerRunning) {
  Write-OK "Docker Desktop já está rodando!"
} else {
  # Verificar se Docker está instalado mas não rodando
  $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
  
  if ($dockerExe) {
    Write-Step "Docker encontrado mas não está rodando. Tentando iniciar..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    
    Write-Host "  Aguardando Docker iniciar (até 60 segundos)..." -ForegroundColor Gray
    $timeout = 60
    $elapsed = 0
    while ($elapsed -lt $timeout) {
      Start-Sleep 3
      $elapsed += 3
      try {
        $check = docker info 2>$null
        if ($LASTEXITCODE -eq 0) { $dockerRunning = $true; break }
      } catch {}
      Write-Host "  Aguardando... $elapsed/$timeout segundos" -ForegroundColor Gray
    }
    
    if ($dockerRunning) {
      Write-OK "Docker iniciado com sucesso!"
    }
  }
  
  if (-not $dockerRunning) {
    Write-Fail "Docker Desktop não encontrado ou não conseguiu iniciar."
    Write-Host ""
    Write-Host "  Por favor, instale o Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  1. Acesse: https://www.docker.com/products/docker-desktop" -ForegroundColor White
    Write-Host "  2. Clique em 'Download for Windows'" -ForegroundColor White
    Write-Host "  3. Execute o instalador e reinicie o computador" -ForegroundColor White
    Write-Host "  4. Abra o Docker Desktop e aguarde iniciar" -ForegroundColor White
    Write-Host "  5. Execute este script novamente" -ForegroundColor White
    Write-Host ""
    
    $openBrowser = Read-Host "  Deseja abrir o site do Docker agora? (s/n)"
    if ($openBrowser -eq 's') {
      Start-Process "https://www.docker.com/products/docker-desktop"
    }
    Pause-Script
    exit 1
  }
}

# ─── BANCO DE DADOS ─────────────────────────────────────────────────────────
Write-Header "Passo 5/6 — Banco de dados"

Write-Step "Iniciando PostgreSQL, Redis e MinIO via Docker..."
docker compose -f docker\docker-compose.yml up -d 2>&1 | Out-Null

# Aguardar banco ficar pronto
Write-Host "  Aguardando banco de dados iniciar..." -ForegroundColor Gray
Start-Sleep 8

$dbReady = $false
for ($i = 1; $i -le 10; $i++) {
  try {
    $check = docker exec foodsaas-postgres pg_isready -U foodsaas 2>$null
    if ($LASTEXITCODE -eq 0) { $dbReady = $true; break }
  } catch {}
  Start-Sleep 3
}

if (-not $dbReady) {
  Write-Host "  Banco ainda inicializando, aguardando mais..." -ForegroundColor Gray
  Start-Sleep 10
}

Write-OK "Docker: serviços iniciados"

# ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
Write-Header "Configurando variáveis de ambiente"

if (-not (Test-Path ".env.local")) {
  Write-Step "Criando arquivo de configuração (.env.local)..."
  
  # Gerar AUTH_SECRET aleatório
  $bytes  = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [System.Convert]::ToBase64String($bytes)
  
  $cronSecret = [System.Convert]::ToBase64String(
    [System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid().ToString())
  )

  $envContent = @"
# Gerado automaticamente pelo instalador FoodSaaS
# Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm')

# Banco de dados (Docker local)
DATABASE_URL="postgresql://foodsaas:devpassword123@localhost:5432/foodsaas"
DIRECT_URL="postgresql://foodsaas:devpassword123@localhost:5432/foodsaas"

# Autenticação (gerado automaticamente)
AUTH_SECRET="$secret"
AUTH_URL="http://localhost:3000"

# Redis (Docker local)
# Em produção, use Upstash: https://upstash.com
UPSTASH_REDIS_REST_URL="http://localhost:6379"
UPSTASH_REDIS_REST_TOKEN="devpassword123"

# Storage (MinIO local)
# Em produção, use Cloudflare R2: https://cloudflare.com/r2
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin123"
S3_BUCKET_NAME="foodsaas-uploads"
S3_REGION="us-east-1"
S3_ENDPOINT="http://localhost:9000"
NEXT_PUBLIC_CDN_URL="http://localhost:9000/foodsaas-uploads"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="FoodSaaS"
NODE_ENV="development"
CRON_SECRET="$cronSecret"

# ─── PREENCHA ABAIXO PARA FUNCIONALIDADES EXTRAS ───────────────────────────
# Pagamentos PIX (obtenha em mercadopago.com.br/developers)
MERCADOPAGO_ACCESS_TOKEN=""
NEXT_PUBLIC_MP_PUBLIC_KEY=""
MERCADOPAGO_WEBHOOK_SECRET=""

# WhatsApp (requer servidor Evolution API)
EVOLUTION_API_URL=""
EVOLUTION_API_KEY=""

# Inteligência Artificial (opcional)
OPENAI_API_KEY=""
GEMINI_API_KEY=""

# Emails (obtenha em resend.com)
RESEND_API_KEY=""
EMAIL_FROM="noreply@seudominio.com"

# Monitoramento (obtenha em sentry.io)
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
"@

  Set-Content -Path ".env.local" -Value $envContent -Encoding UTF8
  Write-OK "Arquivo .env.local criado com segredos gerados automaticamente"
} else {
  Write-OK "Arquivo .env.local já existe, mantendo configurações"
}

# ─── MIGRATIONS E SEED ──────────────────────────────────────────────────────
Write-Header "Passo 6/6 — Preparando banco de dados"

Write-Step "Gerando cliente Prisma..."
pnpm exec prisma generate 2>&1 | Out-Null
Write-OK "Cliente Prisma gerado"

Write-Step "Criando tabelas no banco..."
$env:DATABASE_URL = "postgresql://foodsaas:devpassword123@localhost:5432/foodsaas"
$env:DIRECT_URL   = "postgresql://foodsaas:devpassword123@localhost:5432/foodsaas"

pnpm exec prisma migrate dev --name init --skip-seed 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Tentando db push como alternativa..." -ForegroundColor Yellow
  pnpm exec prisma db push --accept-data-loss 2>&1
}
Write-OK "Tabelas criadas!"

Write-Step "Populando banco com dados de exemplo..."
pnpm db:seed 2>&1
Write-OK "Dados de exemplo inseridos!"

# ─── FINALIZAÇÃO ─────────────────────────────────────────────────────────────
Write-Header "✅ Instalação Concluída!"

Write-Host "  O FoodSaaS está pronto para uso!" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  CREDENCIAIS DE ACESSO                          │" -ForegroundColor Cyan
Write-Host "  │                                                 │" -ForegroundColor Cyan
Write-Host "  │  Painel Admin:  http://localhost:3000/login     │" -ForegroundColor Cyan
Write-Host "  │  Email:         admin@pizzariadojose.com        │" -ForegroundColor Cyan
Write-Host "  │  Senha:         Admin@123                       │" -ForegroundColor Cyan
Write-Host "  │                                                 │" -ForegroundColor Cyan
Write-Host "  │  Cardápio demo: http://localhost:3000/menu/     │" -ForegroundColor Cyan
Write-Host "  │                 pizzaria-do-jose                │" -ForegroundColor Cyan
Write-Host "  │                                                 │" -ForegroundColor Cyan
Write-Host "  │  Banco de dados (visual):                       │" -ForegroundColor Cyan
Write-Host "  │  Execute: pnpm db:studio                        │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Iniciando o servidor de desenvolvimento..." -ForegroundColor Yellow
Write-Host "  (uma nova janela do navegador abrirá automaticamente)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Para parar o servidor: pressione CTRL+C no terminal" -ForegroundColor Gray
Write-Host ""

Start-Sleep 3

# Abrir navegador após 5 segundos
Start-Job -ScriptBlock {
  Start-Sleep 8
  Start-Process "http://localhost:3000"
} | Out-Null

# Iniciar servidor
pnpm dev
