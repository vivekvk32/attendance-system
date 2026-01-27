@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Please install Node.js and try again.
  goto end
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not installed or not in PATH.
  echo Please install Node.js (includes npm) and try again.
  goto end
)

cd /d "%~dp0apps\web"
if errorlevel 1 (
  echo Failed to change directory to apps\web.
  goto end
)

if not exist node_modules (
  echo Installing dependencies (first run can take several minutes)...
  echo If this seems stuck, wait a bit longer or check your internet connection.
  npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Retrying once...
    npm install
  )
  if errorlevel 1 (
    echo.
    echo npm install failed again. Please run manually in apps\web to see the error.
    goto end
  )
)

echo Starting web app in this window...
echo Open http://localhost:3000 in your browser once it says "ready".

npm run dev
if errorlevel 1 (
  echo.
  echo npm run dev failed. See the error above.
  goto end
)

:end
echo.
echo Press any key to close this window.
pause >nul
