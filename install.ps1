# rea-cline-kit: install REA (Reverse Engineer Anything) into Cline on Windows.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 --mode full
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 --help
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "rea-cline-kit: Node.js is required (REA needs ^22.23.4, ^24.22.1 or >=26.12.1)."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "rea-cline-kit: npm is required to install the rea-agents package."
}

$dir = $PSScriptRoot
if (-not $dir -or -not (Test-Path (Join-Path $dir "scripts\install.mjs"))) {
  $url = if ($env:REA_CLINE_KIT_ZIP) { $env:REA_CLINE_KIT_ZIP } else { "https://codeload.github.com/nguyenhuyhoanganh/claude-learn/zip/refs/heads/rea" }
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("rea-cline-kit-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Write-Host "Downloading rea-cline-kit ..."
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $tmp "kit.zip")
  Expand-Archive -Path (Join-Path $tmp "kit.zip") -DestinationPath $tmp
  $dir = (Get-ChildItem -Path $tmp -Directory | Select-Object -First 1).FullName
}

& node (Join-Path $dir "scripts\install.mjs") @args
exit $LASTEXITCODE
