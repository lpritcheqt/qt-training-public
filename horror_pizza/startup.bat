@echo off
cd /d "%~dp0"
title Elm St Pizza
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Summoning dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
echo Building the haunted house...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo Starting Elm St Pizza at http://localhost:3001
start "" http://localhost:3001/
call npm start
pause
