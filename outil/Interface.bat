@echo off
rem Lance Prospection Outlook sans fenetre noire : icone pres de l'horloge et fenetre de l'application.
rem Depannage : "Interface.bat /console" lance le serveur dans une fenetre noire qui affiche le journal en direct.
if /i "%~1"=="/console" goto console
start "" "%SystemRoot%\System32\conhost.exe" --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Scripts\Application.ps1" %*
exit /b

:console
title Interface de prospection
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Scripts\Serveur-Interface.ps1" %2 %3 %4
echo.
pause