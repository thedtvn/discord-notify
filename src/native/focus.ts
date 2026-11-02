import { type ProcessEntry, win32 } from "./win32.js"

export type { ProcessEntry }

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


/** Whether an OpenCode terminal/app window is focused, or undefined when it can't be determined. */
export async function isAppFocused(): Promise<boolean | undefined> {
  const api = await win32()
  if (!api) return undefined
  try {
    return isOpenCodeFocused({ foreground: api.foregroundPid(), processes: api.processes() })
  } catch {
    return undefined
  }
}
