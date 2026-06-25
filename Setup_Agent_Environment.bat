@echo off
setlocal
cd /d "%~dp0"

echo.
echo  Portable Web Toolkit - Machine Setup
echo  ====================================
echo  This wizard shows what will be installed and lets you opt in or out.
echo  Administrator approval may be required for missing tools.
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required to run the setup wizard.
    echo         Install Node from https://nodejs.org/ then run this file again.
    goto :finish
)

node "%~dp0Web_Toolkit\scripts\setup-interactive.mjs" --workspace "%CD%" %*
set exitcode=%errorlevel%
goto :done

:finish
set exitcode=1

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
