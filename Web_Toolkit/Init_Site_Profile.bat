@echo off
setlocal
cd /d "%~dp0"
node init_site_profile/bin/init-site-profile.mjs %*
if %errorlevel% neq 0 exit /b %errorlevel%
endlocal
