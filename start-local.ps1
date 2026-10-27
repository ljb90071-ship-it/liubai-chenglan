$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node server.mjs --host 127.0.0.1 --port 8769 --data ./data
