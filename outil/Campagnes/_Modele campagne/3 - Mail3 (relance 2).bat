@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\Scripts\Build-Relance.ps1" -Campagne "%~dp0." -Etape 3
echo.
pause
