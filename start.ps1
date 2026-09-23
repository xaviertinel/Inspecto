if (-not $env:ANTHROPIC_API_KEY) {
  Write-Host "ANTHROPIC_API_KEY absente. Definissez-la d'abord :" -ForegroundColor Red
  Write-Host '  $env:ANTHROPIC_API_KEY="sk-ant-..."'
  exit 1
}
$node = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $node = "$HOME\node\node.exe" }
Start-Process "http://localhost:3000"
& $node "$PSScriptRoot\server.js"
