$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$tauriConfigPath = Join-Path $repoRoot 'src-tauri/tauri.conf.json'
if (-not (Test-Path $tauriConfigPath)) {
  throw "Could not find Tauri config at $tauriConfigPath"
}

$tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
$productName = [string]$tauriConfig.productName
$version = [string]$tauriConfig.version

if ([string]::IsNullOrWhiteSpace($productName) -or [string]::IsNullOrWhiteSpace($version)) {
  throw 'tauri.conf.json is missing productName or version'
}

$bundleRoot = Join-Path $repoRoot 'src-tauri/target/release/bundle'
$nsisDir = Join-Path $bundleRoot 'nsis'
$msiDir = Join-Path $bundleRoot 'msi'

if (Test-Path $nsisDir) {
  $dottedExpected = ("{0}_{1}_x64-setup.exe" -f ($productName -replace ' ', '.'), $version)
  $spacedExpected = ("{0}_{1}_x64-setup.exe" -f $productName, $version)

  $dottedPath = Join-Path $nsisDir $dottedExpected
  $spacedPath = Join-Path $nsisDir $spacedExpected

  if ((Test-Path $dottedPath) -and -not (Test-Path $spacedPath)) {
    Rename-Item -Path $dottedPath -NewName $spacedExpected
    Write-Host "Renamed installer: $dottedExpected -> $spacedExpected"
  } elseif (Test-Path $spacedPath) {
    Write-Host "Installer already uses productName: $spacedExpected"
  } else {
    Write-Host "No NSIS installer matched expected names for version $version"
  }
}

$filesToSign = @()
if (Test-Path $nsisDir) {
  $filesToSign += Get-ChildItem -Path $nsisDir -File -Filter "*$version*x64-setup.exe" -ErrorAction SilentlyContinue
}
if (Test-Path $msiDir) {
  $filesToSign += Get-ChildItem -Path $msiDir -File -Filter "*$version*x64*.msi" -ErrorAction SilentlyContinue
}

$filesToSign = $filesToSign | Sort-Object FullName -Unique

$certPath = $env:MYANIME_CERT_PATH
$certPassword = $env:MYANIME_CERT_PASSWORD

if ([string]::IsNullOrWhiteSpace($certPath) -or [string]::IsNullOrWhiteSpace($certPassword)) {
  Write-Host 'Skipping code signing (set MYANIME_CERT_PATH and MYANIME_CERT_PASSWORD to enable).'
  return
}

if (-not (Test-Path $certPath)) {
  throw "Certificate file not found: $certPath"
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  throw 'signtool.exe was not found. Install Windows SDK and run from a Developer PowerShell.'
}

foreach ($file in $filesToSign) {
  & $signtool.Source sign `
    /f $certPath `
    /p $certPassword `
    /fd SHA256 `
    /tr 'http://timestamp.digicert.com' `
    /td SHA256 `
    $file.FullName

  if ($LASTEXITCODE -ne 0) {
    throw "Signing failed: $($file.FullName)"
  }

  Write-Host "Signed: $($file.Name)"
}
