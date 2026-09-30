$ErrorActionPreference = "Stop"

Write-Host "== Supabase Keeper / Neon setup ==" -ForegroundColor Cyan

npm i -g neon@latest

# Opens the Neon authentication flow in the browser when needed.
neon login

neon skills -y
neon mcp -y

neon link --project-id spring-flower-77969329 --branch production -y

neon config init

@'
import { defineConfig } from "@neon/config/v1";

export default defineConfig({});
'@ | Set-Content -Path "neon.ts" -Encoding utf8

neon deploy

# neon link pulls DATABASE_URL for the selected branch.
# Apply and verify the Keeper tables after the Neon config deploy.
npm run db:setup

Write-Host "Neon setup concluido." -ForegroundColor Green
