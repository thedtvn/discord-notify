import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { warn } from "../log.js"

export const PROTOCOL = "discord-notify"

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "open.ps1")

/** URI opened when a toast is clicked. */
export const openUri = (sessionID: string, directory?: string) =>
  `${PROTOCOL}://open?session=${encodeURIComponent(sessionID)}` +
  (directory ? `&dir=${encodeURIComponent(directory)}` : "")

const reg = (args: string[]) =>
  new Promise<void>((resolve, reject) =>
    execFile("reg.exe", args, { windowsHide: true, timeout: 10_000 }, (err) => (err ? reject(err) : resolve())),
  )

let registered: Promise<boolean> | undefined

/**
 * Registers `discord-notify://` for the current user (HKCU, no admin needed), pointing at
 * scripts/open.ps1 in this package. Re-run on every load so the path follows plugin updates.
 */
export function registerProtocol(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false)
  registered ??= (async () => {
    if (!existsSync(SCRIPT)) {
      warn(`click handler script not found at ${SCRIPT}, toasts won't open sessions`)
      return false
    }
    const key = `HKCU\\Software\\Classes\\${PROTOCOL}`
    const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${SCRIPT}" "%1"`
    try {
      await reg(["add", key, "/ve", "/d", "URL:OpenCode discord-notify", "/f"])
      await reg(["add", key, "/v", "URL Protocol", "/d", "", "/f"])
      await reg(["add", `${key}\\shell\\open\\command`, "/ve", "/d", command, "/f"])
      return true
    } catch (err) {
      warn("could not register the click handler", err)
      return false
    }
  })()
  return registered
}
