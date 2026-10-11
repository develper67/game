@echo off
setlocal
title yoink! server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. yoink! needs Node.js 18 or newer.
  echo   Opening https://nodejs.org - install the LTS version, then run this file again.
  echo.
  start "" https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   Installing yoink! dependencies, this only happens once...
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo   Starting yoink! - your browser will open http://localhost:3000
echo   Keep this window open while you play. Close it to stop the server.
set YOINK_OPEN=1
call npm start
pause
