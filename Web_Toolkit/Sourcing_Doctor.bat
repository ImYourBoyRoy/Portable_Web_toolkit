@echo off
setlocal
set SITE_PROFILE=%~1
if "%SITE_PROFILE%"=="" (
    echo Usage: Sourcing_Doctor.bat ^<site-profile-path^>
    exit /b 1
)
node "%~dp0sourcing_doctor\bin\sourcing-doctor.mjs" extract --site-profile "%SITE_PROFILE%" --project-root "%~dp0.."
pause
