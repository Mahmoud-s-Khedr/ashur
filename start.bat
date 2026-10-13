@echo off
cd /d "%~dp0"
if not exist .env (
  echo Copy .env.example to .env and set ADMIN_PIN before starting.
  pause
  exit /b 1
)
if not exist packages\web\dist (
  echo Run pnpm install and pnpm build first.
  pause
  exit /b 1
)
node tools\supervise.mjs
pause
