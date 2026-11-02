/**
 * Minimal Win32 bindings through bun:ffi (part of the Bun runtime OpenCode runs on), so the
 * plugin needs no compiler, helper binary, or extra package.
 */

export interface ProcessEntry {
  pid: number
  ppid: number
  name: string
}

export interface TopWindow {
  hwnd: number
  pid: number
}

export interface Win32 {
  processes(): ProcessEntry[]
  /** Process owning the foreground window, or undefined when none (desktop, lock screen). */
  foregroundPid(): number | undefined
  /** Visible, unowned top-level windows in Z-order, most recently active first. */
  windows(): TopWindow[]
  /** Restores the window if minimized and brings it to the front. */
  focus(hwnd: number): boolean
}

const TH32CS_SNAPPROCESS = 0x2
// PROCESSENTRY32W on 64-bit Windows.
const ENTRY_SIZE = 568
const OFFSET = { pid: 8, ppid: 32, exe: 44 } as const
const GW_OWNER = 4
const SW_RESTORE = 9
const VK_MENU = 0x12
const KEYEVENTF_KEYUP = 0x2

async function load(): Promise<Win32 | undefined> {
  if (process.platform !== "win32" || !(globalThis as { Bun?: unknown }).Bun) return undefined
  if (process.arch !== "x64" && process.arch !== "arm64") return undefined
  try {
    const specifier = "bun:ffi"
    const { dlopen, FFIType, JSCallback } = await import(specifier)
    const user32 = dlopen("user32.dll", {
      GetForegroundWindow: { args: [], returns: FFIType.ptr },
      GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
      EnumWindows: { args: [FFIType.function, FFIType.i64], returns: FFIType.bool },
      IsWindowVisible: { args: [FFIType.ptr], returns: FFIType.bool },
      GetWindow: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
      IsIconic: { args: [FFIType.ptr], returns: FFIType.bool },
      ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.bool },
      SetForegroundWindow: { args: [FFIType.ptr], returns: FFIType.bool },
      keybd_event: { args: [FFIType.u8, FFIType.u8, FFIType.u32, FFIType.u64], returns: FFIType.void },
    })
    const kernel32 = dlopen("kernel32.dll", {
      CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.i64 },
      Process32FirstW: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.bool },
      Process32NextW: { args: [FFIType.i64, FFIType.ptr], returns: FFIType.bool },
      CloseHandle: { args: [FFIType.i64], returns: FFIType.bool },
    })
    const u = user32.symbols
    const k = kernel32.symbols

    const pidOf = (hwnd: unknown) => {
      const pid = new Uint32Array(1)
      u.GetWindowThreadProcessId(hwnd, pid)
      return pid[0] || undefined
    }

    return {
      processes() {
        const out: ProcessEntry[] = []
        const snap = BigInt(k.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0))
        if (snap === -1n || snap === 0n) throw new Error("CreateToolhelp32Snapshot failed")
        try {
          const buf = new Uint8Array(ENTRY_SIZE)
          const view = new DataView(buf.buffer)
          view.setUint32(0, ENTRY_SIZE, true)
          for (let ok = k.Process32FirstW(snap, buf); ok; ok = k.Process32NextW(snap, buf)) {
            const exe = new Uint16Array(buf.buffer, OFFSET.exe, 260)
            const end = exe.indexOf(0)
            out.push({
              pid: view.getUint32(OFFSET.pid, true),
              ppid: view.getUint32(OFFSET.ppid, true),
              name: String.fromCharCode(...exe.subarray(0, end < 0 ? 260 : end)),
            })
          }
        } finally {
          k.CloseHandle(snap)
        }
        return out
      },

      foregroundPid() {
        const hwnd = u.GetForegroundWindow()
        return hwnd ? pidOf(hwnd) : undefined
      },

      windows() {
        const out: TopWindow[] = []
        const callback = new JSCallback(
          (hwnd: number | null) => {
            if (hwnd && u.IsWindowVisible(hwnd) && !u.GetWindow(hwnd, GW_OWNER)) {
              const pid = pidOf(hwnd)
              if (pid) out.push({ hwnd: Number(hwnd), pid })
            }
            return 1
          },
          { args: [FFIType.ptr, FFIType.i64], returns: FFIType.i32 },
        )
        try {
          u.EnumWindows(callback.ptr, 0)
        } finally {
          callback.close()
        }
        return out
      },

      focus(hwnd) {
        if (u.IsIconic(hwnd)) u.ShowWindow(hwnd, SW_RESTORE)
        u.SetForegroundWindow(hwnd)
        if (Number(u.GetForegroundWindow()) === hwnd) return true
        // Windows only lets the process with the latest input take the foreground; a tap of
        // Alt counts as that input.
        u.keybd_event(VK_MENU, 0, 0, 0)
        u.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
        u.SetForegroundWindow(hwnd)
        return Number(u.GetForegroundWindow()) === hwnd
      },
    }
  } catch {
    return undefined
  }
}

let loaded: Promise<Win32 | undefined> | undefined

/** Win32 bindings, or undefined when not on Windows under Bun. */
export function win32(): Promise<Win32 | undefined> {
  loaded ??= load()
  return loaded
}
