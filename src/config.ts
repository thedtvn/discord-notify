import { warn } from "./log.js"

export interface DiscordConfig {
  /** Discord webhook; when unset only native notifications are sent. */
  webhook_url?: string
  content?: string
  /** Seconds without keyboard/mouse input before Discord notifications are sent. */
  inactive_timeout?: number
  /** Send to Discord when the workstation is locked. */
  lockscreen: boolean
  /** Also show a Windows toast notification. */
  native_noti: boolean
  /** Only show the toast while no OpenCode terminal/app window is focused. */
  focus_noti: boolean
}

const WEBHOOK_URL = /^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/

/** Parses plugin options. Returns undefined when there is nowhere to send notifications. */
export function loadConfig(options: Readonly<Record<string, any>>): DiscordConfig | undefined {
  let webhook_url: string | undefined
  if (options.webhook_url !== undefined) {
    if (typeof options.webhook_url === "string" && WEBHOOK_URL.test(options.webhook_url)) {
      webhook_url = options.webhook_url
    } else {
      warn("`webhook_url` is not a valid Discord webhook URL, ignoring it")
    }
  }
  const native_noti = options.native_noti === true
  if (!webhook_url && !native_noti) return undefined

  const content = typeof options.content === "string" && options.content ? options.content : undefined

  const timeout = Number(options.inactive_timeout)
  const inactive_timeout = Number.isInteger(timeout) && timeout >= 0 ? timeout : undefined
  if (options.inactive_timeout !== undefined && inactive_timeout === undefined) {
    warn("`inactive_timeout` must be a non-negative integer (seconds), ignoring it")
  }

  const focus_noti = options.focus_noti === true
  if (focus_noti && !native_noti) warn("`focus_noti` only applies with `native_noti: true`, ignoring it")

  return {
    webhook_url,
    content,
    inactive_timeout,
    lockscreen: options.lockscreen === true,
    native_noti,
    focus_noti: focus_noti && native_noti,
  }
}
