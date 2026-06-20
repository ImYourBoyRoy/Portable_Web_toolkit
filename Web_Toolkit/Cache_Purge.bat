@echo off
setlocal
cd /d "%~dp0"
node cache_purge/bin/cache-purge.mjs %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
