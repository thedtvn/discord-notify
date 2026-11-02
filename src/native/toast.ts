import { execFile } from "node:child_process"
import type { Embed } from "../discord/embed.js"
import { warn } from "../log.js"

// PowerShell's own AppUserModelID: toasts show without registering an app shortcut.
const APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"

// Text is passed through environment variables and XML-escaped, never interpolated into the script.
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$t = [Security.SecurityElement]::Escape($env:DN_TOAST_TITLE)
$b = [Security.SecurityElement]::Escape($env:DN_TOAST_BODY)
$launch = ''
if ($env:DN_TOAST_LAUNCH) {
  $l = [Security.SecurityElement]::Escape($env:DN_TOAST_LAUNCH)
  $launch = " activationType='protocol' launch='$l'"
}
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast$launch><visual><binding template='ToastGeneric'><text>$t</text><text>$b</text></binding></visual></toast>")
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:DN_TOAST_APP).Show($toast)
`

export interface Toast {
  /** First line: the session name. */
  title: string
  /** Second line: what happened (done / failed / permission / question). */
  body: string
  /** Link opened when the toast is clicked. */
  launch?: string
}

/** Builds the toast from an embed: session name as title, embed title + description as body. */
export function toastFromEmbed(embed: Embed, launch?: string): Toast {
  const session = embed.fields.find((f) => f.name === "Session")?.value ?? "OpenCode"
  const body = embed.description ? `${embed.title}: ${embed.description}` : embed.title
  return { title: session.slice(0, 200), body: body.slice(0, 400), ...(launch ? { launch } : {}) }
}

/** Shows a Windows toast. No-op on other platforms; errors are logged, never thrown. */
export function showToast(toast: Toast): Promise<void> {
  if (process.platform !== "win32") return Promise.resolve()
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      {
        windowsHide: true,
        timeout: 15_000,
        env: {
          ...process.env,
          DN_TOAST_TITLE: toast.title,
          DN_TOAST_BODY: toast.body,
          DN_TOAST_LAUNCH: toast.launch ?? "",
          DN_TOAST_APP: APP_ID,
        },
      },
      (err, _stdout, stderr) => {
        if (err) warn("native notification failed", stderr || err)
        resolve()
      },
    )
  })
}
