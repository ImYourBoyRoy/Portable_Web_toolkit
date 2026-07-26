@echo off
setlocal
cd /d "%~dp0"
node "%~dp0vectorize_pipeline\bin\vectorize-pipeline.mjs" %*
endlocal
