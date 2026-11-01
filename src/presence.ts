import { execFile } from "node:child_process"

export interface Presence {
  /** Milliseconds since the last keyboard/mouse input. */
  idleMs: number
  /** Whether the workstation is locked (input desktop is not accessible). */
  locked: boolean
}

type Probe = () => Promise<Presence>

const DESKTOP_SWITCHDESKTOP = 0x0100

async function ffiProbe(): Promise<Probe | undefined> {
  if (!(globalThis as { Bun?: unknown }).Bun) return undefined
  try {
    const specifier = "bun:ffi"
    const { dlopen, FFIType } = await import(specifier)
    const user32 = dlopen("user32.dll", {
      GetLastInputInfo: { args: [FFIType.ptr], returns: FFIType.bool },
      OpenInputDesktop: { args: [FFIType.u32, FFIType.bool, FFIType.u32], returns: FFIType.ptr },
      SwitchDesktop: { args: [FFIType.ptr], returns: FFIType.bool },
      CloseDesktop: { args: [FFIType.ptr], returns: FFIType.bool },
    })
    const kernel32 = dlopen("kernel32.dll", {
      GetTickCount: { args: [], returns: FFIType.u32 },
    })
    const { GetLastInputInfo, OpenInputDesktop, SwitchDesktop, CloseDesktop } = user32.symbols
    const { GetTickCount } = kernel32.symbols

    return async () => {
      // LASTINPUTINFO { UINT cbSize; DWORD dwTime; }
      const info = new Uint32Array([8, 0])
      const idleMs = GetLastInputInfo(info) ? (GetTickCount() - info[1]) >>> 0 : 0

      // When the workstation is locked the input desktop is Winlogon's secure
      // desktop: opening it fails, or switching to it is refused.
      const desk = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP)
      let locked = true
      if (desk) {
        locked = !SwitchDesktop(desk)
        CloseDesktop(desk)
      }
      return { idleMs, locked }
    }
  } catch {
    return undefined
  }
}

const PS_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DiscordNotifyPresence {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint f, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool SwitchDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint GetTickCount();
  public static string Get() {
    var i = new LASTINPUTINFO(); i.cbSize = 8;
    uint idle = GetLastInputInfo(ref i) ? unchecked(GetTickCount() - i.dwTime) : 0;
    var d = OpenInputDesktop(0, false, 0x0100);
    bool locked = true;
    if (d != IntPtr.Zero) { locked = !SwitchDesktop(d); CloseDesktop(d); }
    return idle + " " + (locked ? 1 : 0);
  }
}
'@
[DiscordNotifyPresence]::Get()
`

const powershellProbe: Probe = () =>
  new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => {
        if (err) return reject(err)
        const [idle, locked] = stdout.trim().split(/\s+/)
        const idleMs = Number(idle)
        if (!Number.isFinite(idleMs)) return reject(new Error(`unexpected output: ${stdout}`))
        resolve({ idleMs, locked: locked === "1" })
      },
    )
  })

let probe: Promise<Probe | undefined> | undefined

/** Returns the current user presence, or undefined when it can't be determined (non-Windows, errors). */
export async function getPresence(): Promise<Presence | undefined> {
  if (process.platform !== "win32") return undefined
  probe ??= ffiProbe().then((p) => p ?? powershellProbe)
  const fn = await probe
  try {
    return await fn!()
  } catch {
    return undefined
  }
}
