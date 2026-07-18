@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  Portable Web Toolkit - Local Agent Environment
echo  ==============================================
echo  Node is NOT required beforehand — bootstrap installs it when missing.
echo  Pass -Yes for coding-agent runs (UAC may still prompt).
echo.

set exitcode=0
set "WIZARD=%~dp0Web_Toolkit\scripts\setup-interactive.ps1"
if not exist "%WIZARD%" (
    echo [ERROR] Missing setup wizard: %WIZARD%
    set exitcode=1
    goto :done
)

set "EXTRA="
:parse
if "%~1"=="" goto :run
if /I "%~1"=="--yes" set "EXTRA=%EXTRA% -Yes" & shift & goto :parse
if /I "%~1"=="--agent" set "EXTRA=%EXTRA% -Yes" & shift & goto :parse
if /I "%~1"=="-Yes" set "EXTRA=%EXTRA% -Yes" & shift & goto :parse
if /I "%~1"=="-Agent" set "EXTRA=%EXTRA% -Yes" & shift & goto :parse
shift
goto :parse

:run
where pwsh >nul 2>&1
if errorlevel 1 (
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%CD%" %EXTRA%
) else (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0Web_Toolkit' -Recurse -Filter *.ps1 -File | Unblock-File -ErrorAction SilentlyContinue"
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD%" -Workspace "%CD%" %EXTRA%
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
if /I "%CI%"=="" if /I "%CURSOR_AGENT%"=="" pause
exit /b %exitcode%
