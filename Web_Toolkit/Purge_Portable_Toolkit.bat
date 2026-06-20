@echo off
setlocal
cd /d "%~dp0"
node "%~dp0toolkit_purge\bin\toolkit-purge.mjs" %*
endlocal
