@echo off
cd /d "%~dp0"
echo Starting Dragon's Crunchy Knights Pizza...
start "" http://localhost:3000/
node --disable-warning=ExperimentalWarning server.js
pause
