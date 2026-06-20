@echo off
setlocal
cd /d "%~dp0"
node "%~dp0brand_doctor\bin\brand-doctor.mjs" %*
endlocal
