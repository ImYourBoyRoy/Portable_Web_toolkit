@echo off
setlocal
cd /d "%~dp0"
node cloudflare-agent-toolkit/bin/cf-agent.mjs site audit %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
