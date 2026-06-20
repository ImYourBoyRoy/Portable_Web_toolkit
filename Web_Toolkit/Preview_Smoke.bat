@echo off
setlocal
cd /d "%~dp0"
node "%~dp0Setup_astro_environment\bin\astro-env-setup.mjs" preview-smoke %*
endlocal
