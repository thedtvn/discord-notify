import type { DiscordConfig } from "./config.js"
import { isAppFocused } from "./native/focus.js"
import { getPresence } from "./presence.js"

/**
 * With `focus_noti`, show the toast only while no OpenCode terminal/app window is focused.
 * If focus can't be determined, show it anyway.
 */
export async function shouldToast(config: DiscordConfig): Promise<boolean> {
  if (!config.native_noti) return false
  if (!config.focus_noti) return true
  return (await isAppFocused()) !== true
}

/**
 * With neither `inactive_timeout` nor `lockscreen` set, always notify. Otherwise notify
 * when the user has been idle long enough or the screen is locked. If presence can't be
 * read (non-Windows, probe error) notify anyway rather than silently dropping it.
 */
export async function shouldNotify(config: DiscordConfig): Promise<boolean> {
  if (config.inactive_timeout === undefined && !config.lockscreen) return true
  const presence = await getPresence()
  if (!presence) return true
  if (config.lockscreen && presence.locked) return true
  if (config.inactive_timeout !== undefined && presence.idleMs >= config.inactive_timeout * 1000) return true
  return false
}
