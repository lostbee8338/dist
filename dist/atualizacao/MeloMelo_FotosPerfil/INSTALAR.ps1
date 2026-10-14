$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = "C:\whatsapp-atendimento"

$sourceApp = Join-Path $scriptRoot "frontend\src\App.jsx"
$sourceBackend = Join-Path $scriptRoot "backend\index.js"
$targetApp = Join-Path $projectRoot "frontend\src\App.jsx"
$targetBackend = Join-Path $projectRoot "backend\index.js"

if (-not (Test-Path $sourceApp)) {
    throw "Não encontrei o frontend/src/App.jsx dentro do pacote: $sourceApp"
}
if (-not (Test-Path $sourceBackend)) {
    throw "Não encontrei o backend/index.js dentro do pacote: $sourceBackend"
}
if (-not (Test-Path $targetApp)) {
    throw "O projeto não foi encontrado no caminho esperado: $targetApp"
}
if (-not (Test-Path $targetBackend)) {
    throw "O backend atual não foi encontrado: $targetBackend"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $projectRoot "backup_fotos_perfil_$stamp"
New-Item -ItemType Directory -Path (Join-Path $backupRoot "frontend\src") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupRoot "backend") -Force | Out-Null

Copy-Item -LiteralPath $targetApp -Destination (Join-Path $backupRoot "frontend\src\App.jsx") -Force
Copy-Item -LiteralPath $targetBackend -Destination (Join-Path $backupRoot "backend\index.js") -Force

Copy-Item -LiteralPath $sourceApp -Destination $targetApp -Force
Copy-Item -LiteralPath $sourceBackend -Destination $targetBackend -Force

Write-Host ""
Write-Host "Atualização aplicada." -ForegroundColor Green
Write-Host "Backups salvos em: $backupRoot" -ForegroundColor Cyan
Write-Host "Nenhum arquivo .env, banco de dados ou contêiner foi alterado."
Write-Host ""
Write-Host "Próximo passo: valide o frontend com npm.cmd run build antes de reiniciar o backend."
