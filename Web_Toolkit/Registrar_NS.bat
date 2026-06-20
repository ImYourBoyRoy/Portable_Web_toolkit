@echo off
setlocal
cd /d "%~dp0"
node registrar/registrar.mjs %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
