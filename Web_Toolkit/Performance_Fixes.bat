@echo off
setlocal
cd /d "%~dp0"
node "%~dp0performance_fixes\bin\performance-fixes.mjs" %*
endlocal
