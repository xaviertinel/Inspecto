if (-not $env:ANTHROPIC_API_KEY -and -not $env:MISTRAL_API_KEY) {
  Write-Host "Aucune cle API : mode capture locale (micro, photos, relais telephone). L'analyse IA se fait dans l'Artifact claude.ai apres export de la visite." -ForegroundColor Yellow
}
$node = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $node = "$HOME\node\node.exe" }
Start-Process "http://localhost:3000"
& $node --use-system-ca "$PSScriptRoot\server.js"
