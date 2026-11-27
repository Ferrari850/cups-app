# Cups print helper for the Windows till.
# Listens on http://127.0.0.1:9123 (this computer only). After the app prints a receipt through
# Chrome, it calls /cut and the helper sends the ESC/POS "feed to the cutter and cut" command
# straight to the receipt printer (the Windows default printer).
# Started at log-in by the shortcut install.ps1 makes.

$Port = 9123

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CupsRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static bool Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    bool ok = false;
    DOCINFO di = new DOCINFO();
    di.pDocName = "Cups cut";
    di.pDataType = "RAW";
    if (StartDocPrinter(h, 1, di) != 0) {
      if (StartPagePrinter(h)) {
        int w;
        ok = WritePrinter(h, data, data.Length, out w);
        EndPagePrinter(h);
      }
      EndDocPrinter(h);
    }
    ClosePrinter(h);
    return ok;
  }
}
"@

function Get-ReceiptPrinter {
  $p = Get-CimInstance Win32_Printer -Filter "Default=TRUE" -ErrorAction SilentlyContinue
  if ($p) { return $p.Name }
  return $null
}

# Give Chrome's receipt a moment to reach the Windows queue. The cut is queued after it, and
# Windows prints jobs in order, so the cut always comes after the receipt.
function Wait-Receipt([string]$name) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt 1500) {
    if (@(Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue).Count -gt 0) { return }
    Start-Sleep -Milliseconds 100
  }
}

function Send-Http($stream, [int]$code, [string]$text) {
  $body = [Text.Encoding]::UTF8.GetBytes($text)
  $head = "HTTP/1.1 $code OK`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
    "Access-Control-Allow-Headers: *`r`n" +
    "Access-Control-Allow-Private-Network: true`r`n" +
    "Content-Type: text/plain`r`n" +
    "Content-Length: $($body.Length)`r`n" +
    "Connection: close`r`n`r`n"
  $h = [Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($h, 0, $h.Length)
  if ($body.Length) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Cut([string]$printer, [string]$query) {
  Wait-Receipt $printer
  $mm = 0
  if ($query -match 'feed=(\d+)') { $mm = [int]$Matches[1] }
  $dots = [Math]::Min(255, [Math]::Max(0, $mm * 8))
  # GS V 65 n: feed the paper to the cutter (+ n dots) and make a full cut.
  return [CupsRaw]::Send($printer, [byte[]](0x1D, 0x56, 0x41, [byte]$dots))
}

# Only this computer can reach it (127.0.0.1). Needs no admin rights.
$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch { exit } # already running

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 3000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
    $first = $reader.ReadLine()
    while ($true) { $l = $reader.ReadLine(); if ($l -eq $null -or $l -eq "") { break } }
    $parts = "$first".Split(" ")
    $method = $parts[0]
    $target = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
    $path = $target.Split("?")[0]
    $query = if ($target.Contains("?")) { $target.Substring($target.IndexOf("?") + 1) } else { "" }

    if ($method -eq "OPTIONS") { Send-Http $stream 204 "" }
    else {
      $printer = Get-ReceiptPrinter
      if ($path -eq "/ping") { Send-Http $stream 200 ("ok " + $printer) }
      elseif ($path -eq "/cut") {
        if (-not $printer) { Send-Http $stream 500 "no default printer" }
        elseif (Cut $printer $query) { Send-Http $stream 200 "cut" }
        else { Send-Http $stream 500 "send failed" }
      }
      else { Send-Http $stream 404 "not found" }
    }
  } catch {
  } finally {
    $client.Close()
  }
}
