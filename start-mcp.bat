@echo off
setlocal
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Esegui prima setup-vinted-assistant.bat. 1>&2
  exit /b 1
)
".venv\Scripts\python.exe" -m vinted_assistant.mcp_server %*
