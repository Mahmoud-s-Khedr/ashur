#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ ! -f .env ]]; then
  echo 'Copy .env.example to .env and set a private ADMIN_PIN before starting.'
  exit 1
fi
if [[ ! -d packages/web/dist ]]; then
  echo 'Build the local assets first: pnpm install && pnpm build'
  exit 1
fi
exec node tools/supervise.mjs
