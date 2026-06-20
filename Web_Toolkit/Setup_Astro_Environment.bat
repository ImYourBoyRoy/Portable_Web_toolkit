@echo off
setlocal
cd /d "%~dp0"
node Setup_astro_environment/bin/astro-env-setup.mjs prepare-project %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
