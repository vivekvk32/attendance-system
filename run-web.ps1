$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed or not in PATH."
  Write-Host "Please install Node.js and try again."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm is not installed or not in PATH."
  Write-Host "Please install Node.js (includes npm) and try again."
  exit 1
}

Set-Location -Path (Join-Path $PSScriptRoot "apps\web")

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies (first run can take several minutes)..."
  Write-Host "If this seems stuck, wait a bit longer or check your internet connection."
  try {
    npm install
  } catch {
    Write-Host ""
    Write-Host "npm install failed. Retrying once..."
    npm install
  }
}

Write-Host "Starting web app..."
Write-Host "This window will stay open while the dev server runs."

Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $test = Test-NetConnection -ComputerName "localhost" -Port 3000
      if ($test.TcpTestSucceeded) {
        Start-Process "http://localhost:3000"
        break
      }
    } catch {
      # ignore
    }
    Start-Sleep -Seconds 1
  }
} | Out-Null

$log = Join-Path $PSScriptRoot "run-web.log"
Write-Host "Logging output to $log"
npm run dev 2>&1 | Tee-Object -FilePath $log
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "npm run dev failed. See the error above."
  Write-Host "Log saved to $log"
  Read-Host "Press Enter to close this window"
  exit $LASTEXITCODE
}
