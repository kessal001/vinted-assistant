@echo off
setlocal
cd /d "%~dp0backend"
where uv >nul 2>nul
if errorlevel 1 (
  echo Installa uv da https://docs.astral.sh/uv/getting-started/installation/ 1>&2
  exit /b 1
)
echo [1/3] Configurazione backend e MCP...
uv sync --extra test
if errorlevel 1 goto :error
echo [2/3] Configurazione frontend...
cd /d "%~dp0frontend"
call npm ci
if errorlevel 1 goto :error
echo [3/3] Build dashboard...
call npm run build
if errorlevel 1 goto :error
echo Configurazione completata. Avvia start-vinted-assistant.bat
exit /b 0
:error
echo Configurazione non riuscita. Controlla il messaggio precedente. 1>&2
exit /b 1
