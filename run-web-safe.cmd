@echo off
setlocal

echo If you can read this, the launcher opened correctly.
echo Press any key to start the web app.
pause >nul

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  goto end
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not installed or not in PATH.
  goto end
)

cd /d "%~dp0apps\web"
if errorlevel 1 (
  echo Failed to change directory to apps\web.
  goto end
)

if not exist node_modules (
  echo Installing dependencies...
  npm install
)

echo Starting dev server...
npm run dev

:end
echo.
echo Press any key to close this window.
pause >nul
