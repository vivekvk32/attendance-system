@echo off
setlocal

cd /d "%~dp0apps\web"
if errorlevel 1 (
  echo Failed to change directory to apps\web.
  goto end
)

echo Removing node_modules and lockfile...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json

echo Reinstalling dependencies...
npm install
if errorlevel 1 (
  echo npm install failed.
  goto end
)

echo Starting dev server...
npm run dev

:end
echo.
echo Press any key to close this window.
pause >nul
