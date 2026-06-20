@echo off
setlocal
cd /d "%~dp0"
node scripts/export-portable-toolkit.mjs --zip %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
