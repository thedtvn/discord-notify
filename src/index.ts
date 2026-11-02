/**
 * OpenCode Discord Notification Plugin (OpenCode V2)
 *
 * Posts a Discord webhook message with an embed when a session finishes, asks for a
 * permission, or asks a question. See README.md for options.
 *
 * Layout:
 * - config.ts         plugin options parsing
 * - away.ts           inactive_timeout / lockscreen gate (uses presence.ts)
 * - discord/          embed building and webhook delivery
 * - native/           Windows toast notifications (native_noti) and focus detection (focus_noti)
 * - handlers/         one file per OpenCode event -> embed
 */

import { Plugin } from "@opencode/plugin"
import { shouldNotify, shouldToast } from "./away.js"
import { loadConfig } from "./config.js"
import { claim } from "./dedupe.js"
import { sendWebhook } from "./discord/webhook.js"
import { handlerFor } from "./handlers/index.js"
import { PLUGIN_ID, warn } from "./log.js"
import { clickToFocusUri } from "./native/click-focus.js"
import { showToast, toastFromEmbed } from "./native/toast.js"

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const config = loadConfig(ctx.options)
    if (!config) {
      warn("no valid `webhook_url` and `native_noti` is off, notifications disabled")
      return
    }

    // Clicking a toast brings the terminal running OpenCode to the front. Set up early so the
    // first toast doesn't wait; re-checked per toast in case the listener was closed.
    if (config.native_noti) void clickToFocusUri()

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const handler = handlerFor(event.type)
        if (!handler) continue
        // Every loaded plugin instance sees the same event; only the first one sends.
        if (!claim(`${event.type}:${handler.key?.(event) ?? event.id}`)) continue
        try {
          const embed = await handler.handle(event, ctx)
          if (!embed) continue
          const { webhook_url } = config
          await Promise.all([
            (await shouldToast(config)) ? showToast(toastFromEmbed(embed, await clickToFocusUri())) : undefined,
            webhook_url && (await shouldNotify(config)) ? sendWebhook({ ...config, webhook_url }, embed) : undefined,
          ])
        } catch (err) {
          warn(`failed to handle ${event.type}`, err)
        }
      }
    })().catch((err) => {
      if (!controller.signal.aborted) warn("event subscription stopped", err)
    })

    return () => controller.abort()
  },
})
