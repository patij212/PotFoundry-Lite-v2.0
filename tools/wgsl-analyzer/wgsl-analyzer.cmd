@echo off
setlocal
set "SCRIPT=%~dp0cli.mjs"
if not exist "%SCRIPT%" (
  echo WGSL analyzer script missing: %SCRIPT%
  exit /b 1
)
node "%SCRIPT%" %*
exit /b %ERRORLEVEL%
