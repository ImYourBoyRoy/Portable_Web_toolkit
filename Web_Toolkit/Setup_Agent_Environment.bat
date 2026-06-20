@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%CD%' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap.ps1 prepare-host %*
set exitcode=%errorlevel%

echo.
if %exitcode% neq 0 (
    echo [NOTICE] Please review the PowerShell window for details on what is missing or requires attention.
) else (
    echo [SUCCESS] Setup completed successfully!
)

echo.
pause
exit /b %exitcode%
endlocal
