@echo off
setlocal

set "APP=%~dp0apps\web"
echo Launching web app in a new terminal window...

start "Attendance Web" cmd /k "cd /d ""%APP%"" && npm install && npm run dev"

rem Try to open the browser after a few seconds (server may take longer on first run).
timeout /t 5 >nul
start "" http://localhost:3000
