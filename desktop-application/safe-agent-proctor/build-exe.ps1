$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Users\E0853922\.zoomy\jdk-21.0.11+10'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:MAVEN_OPTS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
$proj = 'C:\Users\E0853922\Jira\project\zoomy\desktop-application\safe-agent-proctor'
Set-Location $proj

Write-Host '== 1/4 repackage jar with runnable manifest =='
cmd /c "mvn -q -DskipTests package dependency:copy-dependencies -DoutputDirectory=target/app-libs > build-exe-mvn.log 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host 'MAVEN_FAIL'; Get-Content "$proj\build-exe-mvn.log" -Tail 40; exit 1 }

Write-Host '== 2/4 stage main jar next to deps =='
Copy-Item "$proj\target\zoomy-safe-agent-0.1.0.jar" "$proj\target\app-libs\" -Force

Write-Host '== 3/4 clean old dist =='
if (Test-Path "$proj\dist") {
  Get-Process 'Zoomy Safe Agent' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 600
  Remove-Item "$proj\dist" -Recurse -Force
}

Write-Host '== 4/4 jpackage app-image (.exe) =='
& "$env:JAVA_HOME\bin\jpackage.exe" `
  --type app-image `
  --name 'Zoomy Safe Agent' `
  --app-version 0.1.0 `
  --input "$proj\target\app-libs" `
  --main-jar zoomy-safe-agent-0.1.0.jar `
  --main-class com.zoomy.agent.Launcher `
  --icon "$proj\src\main\resources\zoomy-logo.ico" `
  --dest "$proj\dist" `
  --vendor 'Zoomy' `
  --description 'Zoomy Safe Agent - desktop anti-cheat proctor' `
  --java-options '-Dzoomy.api=http://localhost:8080' `
  --java-options '-Dzoomy.grpcHost=localhost' `
  --java-options '-Dzoomy.grpcPort=9090'
if ($LASTEXITCODE -ne 0) { Write-Host 'JPACKAGE_FAIL'; exit 1 }

Write-Host 'EXE_BUILT'
Get-ChildItem -Recurse "$proj\dist" -Filter *.exe | Select-Object -ExpandProperty FullName
