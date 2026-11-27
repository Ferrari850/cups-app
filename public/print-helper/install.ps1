# Installs the Cups print helper for this Windows user and starts it now and at every log-in.
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "CupsPrintHelper"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir "cups-print-helper.ps1"
Invoke-WebRequest -UseBasicParsing "https://cups-app-omega.vercel.app/print-helper/cups-print-helper.ps1" -OutFile $file

# Stop an older copy that may be running.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like "*cups-print-helper.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$argLine = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$file`""
$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup "Cups print helper.lnk"))
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = $argLine
$lnk.WindowStyle = 7
$lnk.Save()

Start-Process powershell.exe -ArgumentList $argLine -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
  $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:9123/ping" -TimeoutSec 5
  Write-Host ""
  Write-Host "Cups print helper is running. Printer: $($r.Content.Substring(3))" -ForegroundColor Green
} catch {
  Write-Host "Installed, but the helper did not answer. Restart the computer and try Test cut in the app." -ForegroundColor Yellow
}
