@echo off
setlocal
cd /d "%~dp0"
node "%~dp0toolkit_verify\bin\toolkit-verify.mjs" %*
endlocal
