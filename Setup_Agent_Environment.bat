@echo off
setlocal
cd /d "%~dp0"

echo.
echo  Portable Web Toolkit - Machine Setup
echo  ====================================
echo  This wizard does NOT require Node.js beforehand.
echo  Node is installed by the setup bootstrap when missing.
echo  Administrator approval may be required for missing tools.
echo.

set exitcode=0
set "WIZARD=%~dp0Web_Toolkit\scripts\setup-interactive.ps1"
if not exist "%WIZARD%" (
    echo [ERROR] Missing setup wizard: %WIZARD%
    set exitcode=1
    goto :done
)

where pwsh >nul 2>&1
if errorlevel 1 (
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%CD%" %*
) else (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%CD%" %*
)
set exitcode=%errorlevel%

:done
echo.
if %exitcode% neq 0 (
    echo [NOTICE] Setup finished with warnings or errors. See the output above.
) else (
    echo [SUCCESS] Setup completed.
)
echo.
pause
exit /b %exitcode%
