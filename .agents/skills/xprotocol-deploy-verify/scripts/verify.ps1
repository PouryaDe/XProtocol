param(
  [string]$TestFile = ""
)

$ErrorActionPreference = "Stop"

Write-Host "-> Running workspace typecheck..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $TestFile) {
  Write-Host "-> Running full build (web + server)..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "-> Running all server tests..." -ForegroundColor Cyan
  npm test
  exit $LASTEXITCODE
} else {
  Write-Host "-> Running targeted test: $TestFile" -ForegroundColor Cyan
  npx --prefix server tsx --test "tests/$TestFile"
  exit $LASTEXITCODE
}
