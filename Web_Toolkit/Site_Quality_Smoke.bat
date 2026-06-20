@echo off
setlocal
cd /d "%~dp0"
node "%~dp0site_quality_smoke\bin\site-quality-smoke.mjs" %*
endlocal
