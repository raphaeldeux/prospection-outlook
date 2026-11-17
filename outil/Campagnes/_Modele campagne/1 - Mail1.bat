@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\Scripts\Build-Mail1.ps1" -Campagne "%~dp0."
echo.
pause
