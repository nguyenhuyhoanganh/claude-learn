# rea-cline-kit: install REA (Reverse Engineer Anything) into Cline on Windows.
# Works in Windows PowerShell 5.1 and PowerShell 7.
#
# From a checkout:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21"
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 --help
# Without a checkout (downloads branch "rea"):
#   irm https://raw.githubusercontent.com/nguyenhuyhoanganh/claude-learn/rea/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/nguyenhuyhoanganh/claude-learn/rea/install.ps1))) --mode full

$ErrorActionPreference = 'Stop'
$kitArgs = @($args)

function Fail([string]$message) {
  Write-Host "rea-cline-kit: $message" -ForegroundColor Red
  if ($PSCommandPath) { exit 1 } else { throw $message }
}

$nodeCmd = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeCmd) { Fail 'Node.js is required: install Node.js 22 LTS (>= 22.23.4) or 24 LTS (>= 24.22.1) from https://nodejs.org and reopen PowerShell.' }
$nodeVersion = (& $nodeCmd.Source -p 'process.versions.node').Trim()
$v = $nodeVersion.Split('.') | ForEach-Object { [int]$_ }
$supported = ($v[0] -eq 22 -and ($v[1] -gt 23 -or ($v[1] -eq 23 -and $v[2] -ge 4))) -or
             ($v[0] -eq 24 -and ($v[1] -gt 22 -or ($v[1] -eq 22 -and $v[2] -ge 1))) -or
             ($v[0] -eq 26 -and ($v[1] -gt 12 -or ($v[1] -eq 12 -and $v[2] -ge 1))) -or
             ($v[0] -gt 26)
if (-not $supported) { Fail "Node.js $nodeVersion ($($nodeCmd.Source)) is not supported by REA. Use ^22.23.4, ^24.22.1 or >=26.12.1." }

$dir = $PSScriptRoot
if (-not $dir -or -not (Test-Path -LiteralPath (Join-Path $dir 'scripts\install.mjs'))) {
  $url = if ($env:REA_CLINE_KIT_ZIP) { $env:REA_CLINE_KIT_ZIP } else { 'https://codeload.github.com/nguyenhuyhoanganh/claude-learn/zip/refs/heads/rea' }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('rea-cline-kit-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Write-Host 'Downloading rea-cline-kit ...'
  $zip = Join-Path $tmp 'kit.zip'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $dir = (Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1).FullName
}

& $nodeCmd.Source (Join-Path $dir 'scripts\install.mjs') @kitArgs
$code = $LASTEXITCODE
if ($PSCommandPath) { exit $code } elseif ($code -ne 0) { throw "rea-cline-kit installer exited with code $code" }
