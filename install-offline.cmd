@echo off
rem rea-cline-kit OFFLINE installer (double-click). Passes any arguments to install-offline.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-offline.ps1" %*
set REA_EXIT=%ERRORLEVEL%
if "%REA_CLINE_NO_PAUSE%"=="" (
  echo.
  pause
)
exit /b %REA_EXIT%
