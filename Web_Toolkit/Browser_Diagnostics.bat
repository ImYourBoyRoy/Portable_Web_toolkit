@echo off
setlocal
cd /d "%~dp0"
node "%~dp0browser_diagnostics\bin\browser-diagnostics.mjs" %*
endlocal
