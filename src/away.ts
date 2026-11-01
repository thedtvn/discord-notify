import type { DiscordConfig } from "./config.js"
import { getPresence } from "./presence.js"

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
