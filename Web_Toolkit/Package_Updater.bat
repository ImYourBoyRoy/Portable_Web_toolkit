@echo off
setlocal
cd /d "%~dp0"
node "%~dp0package_updater\bin\package-updater.mjs" %*
endlocal
