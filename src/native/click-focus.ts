import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { join } from "node:path"
import { warn } from "../log.js"
import { type ProcessEntry, win32 } from "./win32.js"

/**
 * Click-to-focus with nothing but what ships with Windows and Bun:
 *
 * 1. The plugin listens on a random 127.0.0.1 port for one URL that carries a random token.
 * 2. `discord-notify://` is registered for the current user (HKCU, no admin) to run Windows'
 *    own curl.exe under `conhost.exe --headless` (no window). curl reads that URL from a
 *    config file in %LOCALAPPDATA%\discord-notify, so the token never appears in the registry.
 * 3. A clicked toast opens the link; the request reaches the plugin, which brings the terminal
 *    running OpenCode to the front through bun:ffi (see win32.ts).
 */

const PROTOCOL = "discord-notify"
export const FOCUS_URI = `${PROTOCOL}://focus`

const OPENCODE = /^opencode/i
const NOT_A_HOST = new Set(["explorer.exe", "svchost.exe", "services.exe", "wininit.exe", "winlogon.exe"])

/**
 * Picks the window to focus: the most recently active visible window that belongs to an
 * OpenCode process or to one of its ancestors (the terminal or editor it runs in).
 */
export function pickTerminalWindow(
  processes: ProcessEntry[],
  windows: Array<{ hwnd: number; pid: number }>,
): number | undefined {
  const byPid = new Map(processes.map((p) => [p.pid, p]))
  const hosts = new Set<number>()
  for (const p of processes) {
    if (!OPENCODE.test(p.name)) continue
    const seen = new Set<number>()
    for (let cur: ProcessEntry | undefined = p; cur && !seen.has(cur.pid); cur = byPid.get(cur.ppid)) {
      seen.add(cur.pid)
      if (NOT_A_HOST.has(cur.name.toLowerCase())) break
      hosts.add(cur.pid)
    }
  }
  // EnumWindows returns windows in Z-order, so the first match is the most recently active.
  return windows.find((w) => hosts.has(w.pid))?.hwnd
}

async function focusTerminal() {
  const api = await win32()
  if (!api) return
  const hwnd = pickTerminalWindow(api.processes(), api.windows())
  if (hwnd) api.focus(hwnd)
}

const reg = (args: string[]) =>
  new Promise<void>((resolve, reject) =>
    execFile("reg.exe", args, { windowsHide: true, timeout: 10_000 }, (err) => (err ? reject(err) : resolve())),
  )

async function setup(): Promise<boolean> {
  const system32 = join(process.env.WINDIR ?? "C:\\Windows", "System32")
  const conhost = join(system32, "conhost.exe")
  const curl = join(system32, "curl.exe")
  if (!existsSync(conhost) || !existsSync(curl) || !(await win32())) return false

  const token = randomBytes(16).toString("hex")
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer((req, res) => {
      const ok = req.method === "GET" && req.url === `/focus/${token}`
      res.writeHead(ok ? 204 : 404, { Connection: "close" }).end()
      if (ok) void focusTerminal().catch((err) => warn("could not focus the terminal", err))
    })
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.unref()
      const address = server.address()
      if (address && typeof address === "object") resolve(address.port)
      else reject(new Error("no port"))
    })
  })

  const dir = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "discord-notify")
  const curlrc = join(dir, "focus.curlrc")
  await mkdir(dir, { recursive: true })
  await writeFile(curlrc, `url = "http://127.0.0.1:${port}/focus/${token}"\nsilent\nmax-time = 3\n`, "utf8")

  const key = `HKCU\\Software\\Classes\\${PROTOCOL}`
  await reg(["add", key, "/ve", "/d", "URL:OpenCode discord-notify", "/f"])
  await reg(["add", key, "/v", "URL Protocol", "/d", "", "/f"])
  await reg(["add", `${key}\\shell\\open\\command`, "/ve", "/d", `"${conhost}" --headless "${curl}" -K "${curlrc}"`, "/f"])
  return true
}

const READY = Symbol.for("discord-notify.click-focus")

/** Prepares click-to-focus once per process. Resolves to the toast launch URI, or undefined. */
export async function clickToFocusUri(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined
  const g = globalThis as { [READY]?: Promise<boolean> }
  g[READY] ??= setup().catch((err) => {
    warn("could not set up click-to-focus for notifications", err)
    return false
  })
  return (await g[READY]) ? FOCUS_URI : undefined
}
