@echo off
setlocal
cd /d "%~dp0"
node junk_purge/bin/junk-purge.mjs %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
