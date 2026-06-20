@echo off
setlocal
cd /d "%~dp0"
node privacy_check/bin/privacy-check.mjs scan %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
