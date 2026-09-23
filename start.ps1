if (-not $env:ANTHROPIC_API_KEY -and -not $env:MISTRAL_API_KEY) {
  Write-Host "Cle API absente. Definissez-la d'abord :" -ForegroundColor Red
  Write-Host '  $env:ANTHROPIC_API_KEY="sk-ant-..."   ou   $env:MISTRAL_API_KEY="..."'
  exit 1
}
$node = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $node = "$HOME\node\node.exe" }
Start-Process "http://localhost:3000"
& $node "$PSScriptRoot\server.js"
