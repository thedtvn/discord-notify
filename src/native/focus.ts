import { execFile } from "node:child_process"

export interface ProcessEntry {
  pid: number
  ppid: number
  name: string
}

interface Snapshot {
  /** Process owning the foreground window, or undefined when none (desktop, lock screen). */
  foreground?: number
  processes: ProcessEntry[]
}

const OPENCODE = /^opencode/i
const CONSOLE_HOSTS = new Set(["conhost.exe", "openconsole.exe"])
// Shell/system processes that sit above almost everything; focusing them doesn't mean OpenCode is focused.
const NOT_AN_APP = new Set([
  "explorer.exe",
  "svchost.exe",
  "services.exe",
  "wininit.exe",
  "winlogon.exe",
  "userinit.exe",
  "sihost.exe",
  "runtimebroker.exe",
  "system",
])

/**
 * OpenCode counts as focused when the foreground window belongs to an OpenCode process
 * (desktop app) or to a process hosting one: an ancestor such as the terminal or editor
 * (Windows Terminal, VS Code, ...) or the console host attached to that chain.
 */
export function isOpenCodeFocused({ foreground, processes }: Snapshot): boolean {
  if (foreground === undefined) return false
  const byPid = new Map(processes.map((p) => [p.pid, p]))
  const fg = byPid.get(foreground)
  if (!fg) return false
  const fgName = fg.name.toLowerCase()
  if (OPENCODE.test(fgName)) return true
  if (NOT_AN_APP.has(fgName)) return false

  const hosts = new Set<number>()
  for (const p of processes) {
    if (!OPENCODE.test(p.name)) continue
    const seen = new Set<number>()
    for (let cur = byPid.get(p.ppid); cur && !seen.has(cur.pid); cur = byPid.get(cur.ppid)) {
      seen.add(cur.pid)
      hosts.add(cur.pid)
    }
  }
  if (hosts.has(foreground)) return true
  return CONSOLE_HOSTS.has(fgName) && hosts.has(fg.ppid)
}

type Probe = () => Promise<Snapshot>

const TH32CS_SNAPPROCESS = 0x2
// PROCESSENTRY32W on 64-bit Windows.
const ENTRY_SIZE = 568
const OFFSET = { pid: 8, ppid: 32, exe: 44 } as const

async function ffiProbe(): Promise<Probe | undefined> {
  if (!(globalThis as { Bun?: unknown }).Bun || process.arch !== "x64" && process.arch !== "arm64") return undefined
  try {
    const specifier = "bun:ffi"
    const { dlopen, FFIType } = await import(specifier)
    const user32 = dlopen("user32.dll", {
      GetForegroundWindow: { args: [], returns: FFIType.ptr },
      GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
    })
    const kernel32 = dlopen("kernel32.dll", {
      CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.i64 },
      Process32FirstW: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.bool },
      Process32NextW: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.bool },
      CloseHandle: { args: [FFIType.i64], returns: FFIType.bool },
    })
    const { GetForegroundWindow, GetWindowThreadProcessId } = user32.symbols
    const { CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, CloseHandle } = kernel32.symbols

    return async () => {
      let foreground: number | undefined
      const hwnd = GetForegroundWindow()
      if (hwnd) {
        const pid = new Uint32Array(1)
        GetWindowThreadProcessId(hwnd, pid)
        if (pid[0]) foreground = pid[0]
      }

      const processes: ProcessEntry[] = []
      const snap = BigInt(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0))
      if (snap === -1n || snap === 0n) throw new Error("CreateToolhelp32Snapshot failed")
      try {
        const buf = new Uint8Array(ENTRY_SIZE)
        const view = new DataView(buf.buffer)
        view.setUint32(0, ENTRY_SIZE, true)
        for (let ok = Process32FirstW(snap, buf); ok; ok = Process32NextW(snap, buf)) {
          const exe = new Uint16Array(buf.buffer, OFFSET.exe, 260)
          const end = exe.indexOf(0)
          processes.push({
            pid: view.getUint32(OFFSET.pid, true),
            ppid: view.getUint32(OFFSET.ppid, true),
            name: String.fromCharCode(...exe.subarray(0, end < 0 ? 260 : end)),
          })
        }
      } finally {
        CloseHandle(snap)
      }
      return { foreground, processes }
    }
  } catch {
    return undefined
  }
}

const PS_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DiscordNotifyFocus {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static uint Get() { uint pid = 0; var h = GetForegroundWindow(); if (h != IntPtr.Zero) GetWindowThreadProcessId(h, out pid); return pid; }
}
'@
$fg = [DiscordNotifyFocus]::Get()
$procs = Get-CimInstance Win32_Process | ForEach-Object { @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = $_.Name } }
@{ foreground = $fg; processes = @($procs) } | ConvertTo-Json -Compress -Depth 3
`

const powershellProbe: Probe = () =>
  new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err)
        try {
          const raw = JSON.parse(stdout) as { foreground: number; processes: ProcessEntry[] }
          resolve({ foreground: raw.foreground || undefined, processes: raw.processes })
        } catch (e) {
          reject(e)
        }
      },
    )
  })

let probe: Promise<Probe | undefined> | undefined

/** Whether an OpenCode terminal/app window is focused, or undefined when it can't be determined. */
export async function isAppFocused(): Promise<boolean | undefined> {
  if (process.platform !== "win32") return undefined
  probe ??= ffiProbe().then((p) => p ?? powershellProbe)
  const fn = await probe
  try {
    return isOpenCodeFocused(await fn!())
  } catch {
    return undefined
  }
}
