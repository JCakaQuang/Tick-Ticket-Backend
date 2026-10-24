param(
    [string]$ProjectName = '',
    [string]$OutputDirectory = '',
    [string]$DatabaseName = 'ticketbox'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'backups' }
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$composeArgs = @('compose', '-f', (Join-Path $projectRoot 'docker-compose.yml'))
if ($ProjectName) { $composeArgs += @('-p', $ProjectName) }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fileName = "mongo-$stamp-$([Guid]::NewGuid().ToString('N')).archive.gz"
$containerPath = "/tmp/$fileName"
# Use docker cp to preserve binary bytes on Windows PowerShell 5.1.
& docker @composeArgs exec -T mongo1 mongodump --uri 'mongodb://mongo1:27017,mongo2:27018,mongo3:27019/?replicaSet=rs0' --db $DatabaseName "--archive=$containerPath" --gzip
if ($LASTEXITCODE -ne 0) { throw 'mongodump failed' }
& docker @composeArgs cp "mongo1:$containerPath" (Join-Path $outputPath $fileName)
if ($LASTEXITCODE -ne 0) { throw 'Copying the backup failed' }
& docker @composeArgs exec -T mongo1 rm -- $containerPath
if ($LASTEXITCODE -ne 0) { throw 'Removing the container temporary backup failed' }
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $outputPath $fileName) |
    Select-Object Algorithm, Hash, Path |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath "$fileName.sha256.json") -Encoding UTF8
Write-Output "Backup saved: $(Join-Path $outputPath $fileName)"
