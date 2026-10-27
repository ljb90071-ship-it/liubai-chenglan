param([Parameter(Mandatory=$true)][string]$PublicUrl, [int]$Port = 8769)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node server.mjs --host 0.0.0.0 --port $Port --public-url $PublicUrl --data ./data
