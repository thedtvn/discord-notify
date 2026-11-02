# Handles discord-notify://open?session=<id>&dir=<path> (from a clicked Windows toast).
# 1. Ask the OpenCode server (via the plugin RPC) to switch a running TUI to the session.
# 2. If one did, bring its terminal window to the front.
# 3. Otherwise open Windows Terminal running `opencode --session <id>` in the session's folder.
param([Parameter(Mandatory = $true)][string]$Uri)

$ErrorActionPreference = 'Stop'

function Get-Query([string]$uri) {
  $result = @{}
  $q = ($uri -split '\?', 2)[1]
  if (-not $q) { return $result }
  foreach ($pair in $q -split '&') {
    $kv = $pair -split '=', 2
    if ($kv.Count -eq 2) { $result[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
  }
  return $result
}

$query = Get-Query $Uri
$session = $query['session']
$dir = $query['dir']
if (-not $session -or $session -notmatch '^[\w-]+$') { exit 1 }
if ($dir -and -not (Test-Path -LiteralPath $dir -PathType Container)) { $dir = $null }

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DiscordNotifyWindow {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Focus(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    // A tap of Alt lets this process take foreground rights from the shell.
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }
}
'@

function Focus-ProcessWindow([int]$targetPid) {
  # Walk up from the TUI process to the first ancestor that owns a window (the terminal).
  $current = $targetPid
  for ($i = 0; $i -lt 10 -and $current; $i++) {
    $p = Get-Process -Id $current -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
      [DiscordNotifyWindow]::Focus($p.MainWindowHandle)
      return $true
    }
    $current = (Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue).ParentProcessId
  }
  return $false
}

function Invoke-OpenRpc([hashtable]$inputObj) {
  # Talk to the shared background service directly (port + password from service.json).
  # RPC calls take { input: ... } and answer { output: ... }.
  $configDir = if ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME 'opencode' } else { Join-Path $env:USERPROFILE '.config\opencode' }
  $svc = Get-Content (Join-Path $configDir 'service.json') -Raw | ConvertFrom-Json
  $headers = @{}
  if ($svc.password) {
    $headers.Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("opencode:$($svc.password)"))
  }
  $body = @{ input = $inputObj } | ConvertTo-Json -Compress
  $res = Invoke-RestMethod "http://127.0.0.1:$($svc.port)/api/rpc/discord-notify/open" -Method Post `
    -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -Headers $headers -TimeoutSec 10
  return $res.output
}

$handled = $false
try {
  $inputObj = @{ sessionID = $session }
  if ($dir) { $inputObj.directory = $dir }
  $res = Invoke-OpenRpc $inputObj
  if ($res.handled -and $res.pid) {
    $handled = $true
    if (-not (Focus-ProcessWindow ([int]$res.pid))) {
      # TUI switched sessions but its window wasn't found; at least raise Windows Terminal.
      $wt = Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
      if ($wt) { [DiscordNotifyWindow]::Focus($wt.MainWindowHandle) }
    }
  }
} catch {
  $handled = $false
}

if (-not $handled) {
  $cwd = if ($dir) { $dir } else { $env:USERPROFILE }
  $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
  if ($wt) {
    Start-Process $wt.Source -ArgumentList @('-w', '0', 'new-tab', '-d', $cwd, 'opencode', '--session', $session)
  } else {
    Start-Process 'opencode' -ArgumentList @('--session', $session) -WorkingDirectory $cwd
  }
}
