@echo off
setlocal
cd /d "%~dp0"
node "%~dp0wcag_auditor\bin\wcag-auditor.mjs" %*
endlocal
