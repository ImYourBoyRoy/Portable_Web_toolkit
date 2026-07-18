@echo off
setlocal
cd /d "%~dp0"
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"

echo.
echo  Portable Web Toolkit - Machine Setup
echo  ====================================
echo  This wizard does NOT require Node.js beforehand.
echo  Node is installed by the setup bootstrap when missing.
echo  Administrator approval may be required for missing tools.
echo.

set exitcode=0
set "WIZARD=%~dp0scripts\setup-interactive.ps1"
if not exist "%WIZARD%" (
    echo [ERROR] Missing setup wizard: %WIZARD%
    set exitcode=1
    goto :done
)

where pwsh >nul 2>&1
if errorlevel 1 (
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%REPO_ROOT%\Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%REPO_ROOT%" %*
) else (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%REPO_ROOT%\Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%REPO_ROOT%" %*
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
