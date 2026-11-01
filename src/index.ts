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
 * - handlers/         one file per OpenCode event -> embed
 */

import { Plugin } from "@opencode/plugin"
import { shouldNotify } from "./away.js"
import { loadConfig } from "./config.js"
import { sendWebhook } from "./discord/webhook.js"
import { handlerFor } from "./handlers/index.js"
import { PLUGIN_ID, warn } from "./log.js"

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const config = loadConfig(ctx.options)
    if (!config) {
      warn("missing or invalid `webhook_url` in plugin options, notifications disabled")
      return
    }

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const handler = handlerFor(event.type)
        if (!handler) continue
        try {
          const embed = await handler.handle(event, ctx)
          if (embed && (await shouldNotify(config))) await sendWebhook(config, embed)
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
