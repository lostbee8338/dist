$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\whatsapp-atendimento'
$sourceFile = Join-Path $PSScriptRoot 'frontend\src\App.jsx'
$targetFile = Join-Path $projectRoot 'frontend\src\App.jsx'
$frontendDir = Join-Path $projectRoot 'frontend'

Write-Host ''
Write-Host 'Melo & Melo Atendimento - Correção da abertura de fotos' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $sourceFile)) {
  throw "Arquivo de atualização não encontrado: $sourceFile. Extraia o ZIP inteiro antes de executar."
}
if (-not (Test-Path $targetFile)) {
  throw "Não encontrei o projeto em $projectRoot. Confira se a pasta do sistema está nesse local."
}
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) {
  throw "Não encontrei frontend\package.json em $frontendDir. Nenhum arquivo foi alterado."
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = "$targetFile.BACKUP-$timestamp"
Copy-Item -LiteralPath $targetFile -Destination $backupFile
Write-Host "Backup criado: $backupFile" -ForegroundColor Green

try {
  Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
  Push-Location $frontendDir
  try {
    Write-Host 'Validando o build do frontend...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "O build falhou (código $LASTEXITCODE)."
    }
  }
  finally {
    Pop-Location
  }
  Write-Host ''
  Write-Host 'Atualização aplicada. O backup foi preservado.' -ForegroundColor Green
  Write-Host 'Reinicie o backend como de costume e atualize o navegador com Ctrl + F5.' -ForegroundColor Yellow
}
catch {
  Copy-Item -LiteralPath $backupFile -Destination $targetFile -Force
  Write-Host 'A validação falhou. O App.jsx original foi restaurado.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
