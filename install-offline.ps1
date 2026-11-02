# rea-cline-kit OFFLINE installer for Windows: no npm, no network.
# Run from the extracted bundle folder (rea-cline-offline-win32-x64):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1 --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21" --provider ghidra
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1 --dry-run
# or double-click install-offline.cmd. All options of scripts\install.mjs work (--help).
# Works in Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'
$kitArgs = @($args)
$dir = $PSScriptRoot

function Fail([string]$message) {
  Write-Host "rea-cline-kit: $message" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $dir 'runtime\node_modules\rea-agents\package.json'))) {
  Fail "runtime\node_modules\rea-agents is missing next to this script. Extract the whole rea-cline-offline-win32-x64.zip (keep the folder structure) and run install-offline.ps1 from that folder."
}

# Files extracted from a downloaded zip carry the internet zone mark; clear it on executables and native addons.
Get-ChildItem -LiteralPath $dir -Recurse -File -Include *.exe, *.node, *.dll, *.ps1, *.cmd -ErrorAction SilentlyContinue |
  Unblock-File -ErrorAction SilentlyContinue

# Node.js: the copy shipped in the bundle (node\node.exe) if present, otherwise node.exe on PATH.
$node = Join-Path $dir 'node\node.exe'
if (-not (Test-Path -LiteralPath $node)) {
  $cmd = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) { Fail 'This bundle has no node\node.exe and Node.js is not on PATH. Use the bundle that includes Node.js, or install Node.js 22 LTS (>= 22.23.4) / 24 LTS (>= 24.22.1).' }
  $node = $cmd.Source
}
$nodeVersion = (& $node -p 'process.versions.node').Trim()
$v = $nodeVersion.Split('.') | ForEach-Object { [int]$_ }
$supported = ($v[0] -eq 22 -and ($v[1] -gt 23 -or ($v[1] -eq 23 -and $v[2] -ge 4))) -or
             ($v[0] -eq 24 -and ($v[1] -gt 22 -or ($v[1] -eq 22 -and $v[2] -ge 1))) -or
             ($v[0] -eq 26 -and ($v[1] -gt 12 -or ($v[1] -eq 12 -and $v[2] -ge 1))) -or
             ($v[0] -gt 26)
if (-not $supported) { Fail "Node.js $nodeVersion ($node) is not supported by REA (needs ^22.23.4, ^24.22.1 or >=26.12.1). Use the bundle that includes Node.js." }

Write-Host "rea-cline-kit offline install with Node.js $nodeVersion ($node)"
& $node (Join-Path $dir 'scripts\install.mjs') --offline @kitArgs
exit $LASTEXITCODE
