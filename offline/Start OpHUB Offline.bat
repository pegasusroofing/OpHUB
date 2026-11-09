@echo off
rem OpHUB offline demo: double-click to start, no internet needed. Close this window to stop it.
title OpHUB Offline Demo
cd /d "%~dp0"
start "" http://localhost:8099
node serve.js
if errorlevel 1 (
  echo.
  echo Node.js did not start. Trying Python instead...
  python -m http.server 8099 --bind 127.0.0.1 --directory app
)
pause
