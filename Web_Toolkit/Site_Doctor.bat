@echo off
setlocal
cd /d "%~dp0"
node "%~dp0site_doctor\bin\site-doctor.mjs" %*
endlocal
