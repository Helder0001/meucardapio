@echo off
chcp 65001 >nul
title FoodSaaS — Iniciar

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        FoodSaaS — Iniciando...           ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Verificar se está na pasta certa
if not exist "package.json" (
  echo  ERRO: Execute este arquivo dentro da pasta foodsaas
  pause
  exit /b 1
)

:: Verificar se Docker está rodando
echo  Verificando Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker nao esta rodando. Abrindo Docker Desktop...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  echo  Aguardando Docker iniciar (30 segundos)...
  timeout /t 30 /nobreak >nul
)

:: Subir serviços do Docker
echo  Iniciando banco de dados...
docker compose -f docker\docker-compose.yml up -d >nul 2>&1
echo  Banco de dados: OK

:: Aguardar banco
timeout /t 5 /nobreak >nul

:: Abrir navegador após delay
start "" cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:3000"

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                                                      ║
echo  ║  Sistema iniciando em http://localhost:3000          ║
echo  ║                                                      ║
echo  ║  Login:  admin@pizzariadojose.com                   ║
echo  ║  Senha:  Admin@123                                   ║
echo  ║                                                      ║
echo  ║  Pressione CTRL+C para parar o servidor              ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Iniciar servidor
pnpm dev
