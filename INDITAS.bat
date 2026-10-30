@echo off
title Nuvio & Stremio Hungarian Addon
cd /d "%~dp0"
echo ======================================================
echo   Nuvio & Stremio Hungarian Addon inditasa...
echo ======================================================
echo.
node server.js
if %errorlevel% neq 0 (
  echo.
  echo Hiba tortent az inditas kozben!
  pause
)
