@echo off
setlocal enabledelayedexpansion

:: # ./Web_Toolkit/Optimize_Loop.bat
:: Premium standardized orchestrator for Web_Toolkit loop.
:: Version: 2.2 (AI-Ready Unified Edition - Flattened)

:: --- Initial Context ---
cd /d "%~dp0\.."
set "TOOLKIT_DIR=Web_Toolkit"
set "PROFILE_DIR=%TOOLKIT_DIR%\site-profiles"

:: --- Defaults ---
set "SITE_PROFILE="
set "ENVIRONMENT=production"
set "SKIP_BUILD=false"
set "APPLY=false"

:: --- Help Menu ---
if "%~1"=="--help" goto print_help
if "%~1"=="-h" goto print_help
goto parse_args

:print_help
echo Optimize Loop [ROY-STANDARD]
echo.
echo Usage:
echo   Optimize_Loop.bat [--site-profile PATH] [--environment ENV] [--skip-build] [--apply]
echo.
echo Options:
echo   --site-profile    Path to a specific JSON site profile.
echo   --environment     Target environment (production or development).
echo   --skip-build      Skip the Astro build and clean stages.
echo   --apply           Apply live cache purge. Default is dry-run preview.
echo   --help            Show this help menu.
exit /b 0

:: --- Parse Arguments ---
:parse_args
if "%~1"=="" goto discovery
if "%~1"=="--site-profile" (
    set "SITE_PROFILE=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--environment" (
    set "ENVIRONMENT=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--skip-build" (
    set "SKIP_BUILD=true"
    shift
    goto parse_args
)
if "%~1"=="--apply" (
    set "APPLY=true"
    shift
    goto parse_args
)
shift
goto parse_args

:: --- Explicit Profile Resolution ---
:discovery
if defined SITE_PROFILE goto resolve_path
if defined PORTABLE_DEFAULT_PROFILE (
    set "SITE_PROFILE=%PORTABLE_DEFAULT_PROFILE%"
    echo [discovery] Using PORTABLE_DEFAULT_PROFILE: !SITE_PROFILE!
)

:resolve_path
if not defined SITE_PROFILE (
    echo [error] No site profile provided or discovered.
    echo Use --site-profile or set PORTABLE_DEFAULT_PROFILE. Public example profiles are never auto-selected.
    exit /b 1
)

:: Ensure path is relative to profile dir if it's just a filename
if exist "%SITE_PROFILE%" (
    set "SITE_PROFILE_PATH=%SITE_PROFILE%"
) else (
    if exist "%PROFILE_DIR%\%SITE_PROFILE%" (
        set "SITE_PROFILE_PATH=%PROFILE_DIR%\%SITE_PROFILE%"
    ) else (
        set "SITE_PROFILE_PATH=%SITE_PROFILE%"
    )
)

echo ============================================================
echo [Optimize Loop] STARTING UNIFIED SEQUENCE
echo ============================================================
echo - Profile: %SITE_PROFILE%
echo - Environment: %ENVIRONMENT%
echo - Skip Build: %SKIP_BUILD%
echo - Cache Purge Apply: %APPLY%
echo.

:: --- 1. Build and Deploy ---
if "%SKIP_BUILD%"=="true" goto step_2
echo ========================================
echo [Optimize Loop] 1. Building and Deploying
echo ========================================
call npm run cf:deploy:clean
if %errorlevel% neq 0 (
    echo [error] Deployment failed.
    exit /b %errorlevel%
)

:step_2
:: --- 2. Purge Edge Cache ---
echo ========================================
echo [Optimize Loop] 2. Purging Edge Cache
echo ========================================
if "%APPLY%"=="true" (
    node .\Web_Toolkit\cache_purge\bin\cache-purge.mjs --site-profile "%SITE_PROFILE_PATH%" --environment %ENVIRONMENT% --apply
) else (
    node .\Web_Toolkit\cache_purge\bin\cache-purge.mjs --site-profile "%SITE_PROFILE_PATH%" --environment %ENVIRONMENT%
)
if %errorlevel% neq 0 (
    echo [warn] Cache purge failed, but sequence continues.
)

echo [Optimize Loop] Waiting 15 seconds for Cloudflare edge propagation...
timeout /t 15 /nobreak > nul

:: --- 3. Running PageSpeed ---
echo ========================================
echo [Optimize Loop] 3. Running PageSpeed
echo ========================================
node .\Web_Toolkit\pagespeed_diagnostics\bin\pagespeed-diagnostics.mjs run --site-profile "%SITE_PROFILE_PATH%" --strategy mobile
if %errorlevel% neq 0 (
    echo [warn] PageSpeed Diagnostics failed, but sequence continues.
)

echo.
echo ============================================================
echo [Optimize Loop] SEQUENCE COMPLETE
echo ============================================================
echo.
pause
