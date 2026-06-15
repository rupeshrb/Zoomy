# =============================================================================
# Build a user-local Java truststore that includes the corporate MITM
# (Zscaler / Eaton) CAs so Maven and other Java HTTPS clients can reach
# repo.maven.apache.org without PKIX cert-chain errors.
#
# Does NOT modify the JDK install. Writes a copy of cacerts to
#   %USERPROFILE%\.zoomy\corp-cacerts
# and prints the MAVEN_OPTS / JAVA_TOOL_OPTIONS values to use it.
#
# Safe to re-run.
# =============================================================================

$ErrorActionPreference = 'Continue'

# --- 1. Locate a JDK with cacerts ------------------------------------------
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path "$javaHome\lib\security\cacerts")) {
  $candidates = @(
    'C:\Program Files\Java\jdk-21',
    'C:\Program Files\Java\jdk-17',
    'C:\Program Files\Java\jdk-11',
    'C:\Program Files\Eclipse Adoptium\jdk-21*',
    'C:\Program Files\Eclipse Adoptium\jdk-17*',
    'C:\Program Files\Eclipse Adoptium\jdk-11*',
    'C:\Program Files\Microsoft\jdk-21*',
    'C:\Program Files\Microsoft\jdk-17*'
  )
  foreach ($pat in $candidates) {
    $found = Get-Item $pat -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and (Test-Path "$($found.FullName)\lib\security\cacerts")) {
      $javaHome = $found.FullName; break
    }
  }
}
if (-not $javaHome) { throw "Could not locate a JDK with lib\security\cacerts. Set `$env:JAVA_HOME and re-run." }
$srcCacerts = "$javaHome\lib\security\cacerts"
$keytool    = "$javaHome\bin\keytool.exe"
if (-not (Test-Path $keytool)) { throw "keytool not found at $keytool" }
Write-Host "Source JDK : $javaHome" -ForegroundColor Cyan

# --- 2. Copy cacerts to a user-writable location ----------------------------
$dstDir = Join-Path $env:USERPROFILE '.zoomy'
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }
$dstCacerts = Join-Path $dstDir 'corp-cacerts'
Copy-Item $srcCacerts $dstCacerts -Force
Write-Host "Truststore : $dstCacerts" -ForegroundColor Cyan

# --- 3. Collect corp CAs from Windows trust stores --------------------------
$certs = Get-ChildItem `
  Cert:\LocalMachine\Root, Cert:\LocalMachine\CA, `
  Cert:\CurrentUser\Root,  Cert:\CurrentUser\CA `
  -ErrorAction SilentlyContinue |
  Where-Object {
    ($_.Subject -match 'Zscaler|Eaton') -and ($_.NotAfter -gt (Get-Date))
  } |
  Sort-Object Thumbprint -Unique
if (-not $certs) { throw "No Zscaler/Eaton CA certificates found in the Windows trust store." }
Write-Host ("Found {0} corp CA cert(s) in Windows store." -f $certs.Count) -ForegroundColor Green

# --- 4. Import each into our copy of cacerts --------------------------------
$tmpDir = Join-Path $env:TEMP "zoomy-corp-certs"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$imported = 0; $skipped = 0; $failed = 0
foreach ($c in $certs) {
  $cn = ($c.Subject -split ',')[0] -replace 'CN=','' -replace '[^A-Za-z0-9_-]','_'
  $alias = "corp-$cn-$($c.Thumbprint.Substring(0,8))".ToLower()
  $file  = Join-Path $tmpDir "$alias.cer"
  [IO.File]::WriteAllBytes($file, $c.RawData)

  $listOut = & $keytool -list -keystore $dstCacerts -storepass changeit -alias $alias 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  - skip (exists): $alias" -ForegroundColor DarkGray
    $skipped++; continue
  }

  $impOut = & $keytool -importcert -noprompt -keystore $dstCacerts -storepass changeit -alias $alias -file $file 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  + imported: $($c.Subject)" -ForegroundColor Yellow
    $imported++
  } else {
    Write-Host "  ! failed:   $($c.Subject) -- $impOut" -ForegroundColor Red
    $failed++
  }
}

# --- 5. Also import the live leaf the proxy presents for repo.maven.apache.org
try {
  $tcp = New-Object System.Net.Sockets.TcpClient('repo.maven.apache.org', 443)
  $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, ({$true}))
  $ssl.AuthenticateAsClient('repo.maven.apache.org')
  $leaf = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
  $ssl.Dispose(); $tcp.Dispose()
  $leafFile = Join-Path $tmpDir 'maven-central-leaf.cer'
  [IO.File]::WriteAllBytes($leafFile, $leaf.RawData)
  $alias = 'corp-mitm-maven-central'
  $null = & $keytool -list -keystore $dstCacerts -storepass changeit -alias $alias 2>&1
  if ($LASTEXITCODE -ne 0) {
    $null = & $keytool -importcert -noprompt -keystore $dstCacerts -storepass changeit -alias $alias -file $leafFile 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  + imported live leaf for repo.maven.apache.org" -ForegroundColor Yellow; $imported++ }
  } else {
    Write-Host "  - skip leaf (exists)" -ForegroundColor DarkGray; $skipped++
  }
} catch {
  Write-Host "  ! could not fetch live MITM leaf: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host ("Done. Imported {0}, skipped {1}, failed {2}." -f $imported,$skipped,$failed) -ForegroundColor Green
Write-Host ""
Write-Host "To use this truststore in the CURRENT shell, run:" -ForegroundColor Cyan
Write-Host "  `$env:MAVEN_OPTS = '-Djavax.net.ssl.trustStore=$dstCacerts -Djavax.net.ssl.trustStorePassword=changeit'"
Write-Host "  `$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStore=$dstCacerts -Djavax.net.ssl.trustStorePassword=changeit'"
Write-Host ""
Write-Host "To persist for future shells:" -ForegroundColor Cyan
Write-Host "  [Environment]::SetEnvironmentVariable('MAVEN_OPTS','-Djavax.net.ssl.trustStore=$dstCacerts -Djavax.net.ssl.trustStorePassword=changeit','User')"
