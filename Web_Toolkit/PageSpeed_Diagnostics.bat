@echo off
setlocal
cd /d "%~dp0"
node "%~dp0pagespeed_diagnostics\bin\pagespeed-diagnostics.mjs" %*
endlocal
