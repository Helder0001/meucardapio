# atualizar.ps1
# Envia atualizações do código para o GitHub
# O Vercel faz novo deploy automaticamente ao receber o push
# Execute com: clique direito → "Executar com o PowerShell"

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "FoodSaaS — Enviar Atualização"

Clear-Host
Write-Host ""
Write-Host "  FoodSaaS — Enviar Atualização" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$PSScriptRoot\package.json")) {
  Write-Host "  ERRO: Execute dentro da pasta foodsaas" -ForegroundColor Red
  Read-Host "ENTER para sair"; exit 1
}
Set-Location $PSScriptRoot

# Verificar se tem algo novo
$status = git status --porcelain
if (-not $status) {
  Write-Host "  Nenhuma alteração para enviar." -ForegroundColor Yellow
  Read-Host "  ENTER para fechar"; exit 0
}

Write-Host "  Arquivos modificados:" -ForegroundColor White
git status --short
Write-Host ""

$msg = Read-Host "  Descreva o que mudou (ex: 'adicionar produto novo')"
if (-not $msg) { $msg = "atualização" }

Write-Host ""
Write-Host "  Enviando para o GitHub..." -ForegroundColor Yellow

git add .
git commit -m $msg
git push

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "  ✓ Enviado! A Vercel vai fazer o deploy automático." -ForegroundColor Green
  Write-Host "  Acompanhe em: https://vercel.com" -ForegroundColor Cyan
} else {
  Write-Host "  ERRO ao enviar. Verifique sua conexão." -ForegroundColor Red
}

Write-Host ""
Read-Host "  ENTER para fechar"
