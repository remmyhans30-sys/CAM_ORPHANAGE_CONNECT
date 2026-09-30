@echo off
title CAM Orphanage Connect
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node server\start.js
pause
exit /b

:nonode
echo Node.js is not installed on this computer.
echo Install the LTS version from https://nodejs.org, then double-click start.bat again.
pause
exit /b 1
