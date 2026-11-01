import { warn } from "./log.js"

export interface DiscordConfig {
  webhook_url: string
  content?: string
  /** Seconds without keyboard/mouse input before notifications are sent. */
  inactive_timeout?: number
  /** Send when the workstation is locked. */
  lockscreen: boolean
}

const WEBHOOK_URL = /^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/

/** Parses plugin options. Returns undefined when `webhook_url` is missing or invalid. */
export function loadConfig(options: Readonly<Record<string, any>>): DiscordConfig | undefined {
  const url = options.webhook_url
  if (typeof url !== "string" || !WEBHOOK_URL.test(url)) return undefined

  const content = typeof options.content === "string" && options.content ? options.content : undefined

  const timeout = Number(options.inactive_timeout)
  const inactive_timeout = Number.isInteger(timeout) && timeout >= 0 ? timeout : undefined
  if (options.inactive_timeout !== undefined && inactive_timeout === undefined) {
    warn("`inactive_timeout` must be a non-negative integer (seconds), ignoring it")
  }

  return { webhook_url: url, content, inactive_timeout, lockscreen: options.lockscreen === true }
}
