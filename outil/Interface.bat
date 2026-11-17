@echo off
title Interface de prospection
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Scripts\Serveur-Interface.ps1" %*
echo.
pause
