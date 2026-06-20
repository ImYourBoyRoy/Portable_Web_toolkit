@echo off
setlocal
cd /d "%~dp0"
node "%~dp0toolkit_report\bin\toolkit-report.mjs" %*
endlocal
