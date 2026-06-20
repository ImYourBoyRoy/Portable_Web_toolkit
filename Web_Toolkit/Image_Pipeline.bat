@echo off
setlocal
cd /d "%~dp0"
node "%~dp0image_pipeline\bin\image-pipeline.mjs" %*
endlocal
