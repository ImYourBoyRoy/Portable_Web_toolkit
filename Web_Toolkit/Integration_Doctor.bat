@echo off
setlocal
cd /d "%~dp0"
node "%~dp0integration_doctor\bin\integration-doctor.mjs" %*
endlocal
