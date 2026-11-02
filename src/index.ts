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
 * - native/           Windows toast notifications (native_noti), focus detection (focus_noti),
 *                     and the discord-notify:// click handler registration
 * - server/           click-to-open RPC (see rpc.ts); tui.ts is the matching TUI part
 * - handlers/         one file per OpenCode event -> notification
 */

import { Plugin } from "@opencode/plugin"
import { shouldNotify, shouldToast } from "./away.js"
import { loadConfig } from "./config.js"
import { claim } from "./dedupe.js"
import { sendWebhook } from "./discord/webhook.js"
import { handlerFor } from "./handlers/index.js"
import { PLUGIN_ID, warn } from "./log.js"
import { openUri, registerProtocol } from "./native/protocol.js"
import { showToast, toastFromEmbed } from "./native/toast.js"
import { registerOpenSession } from "./server/open-session.js"

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const config = loadConfig(ctx.options)
    if (!config) {
      warn("no valid `webhook_url` and `native_noti` is off, notifications disabled")
      return
    }

    // Click-to-open: a clicked toast opens discord-notify://, which asks a running TUI to
    // switch to the session through this RPC, or opens a new terminal when none answers.
    const clickable = config.native_noti && (await registerProtocol())
    const disposeRpc = config.native_noti ? await registerOpenSession(ctx) : undefined

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const handler = handlerFor(event.type)
        if (!handler) continue
        // Every loaded plugin instance sees the same event; only the first one sends.
        if (!claim(`${event.type}:${handler.key?.(event) ?? event.id}`)) continue
        try {
          const notification = await handler.handle(event, ctx)
          if (!notification) continue
          const { embed, target } = notification
          const launch = clickable ? openUri(target.sessionID, target.directory) : undefined
          const { webhook_url } = config
          await Promise.all([
            (await shouldToast(config)) ? showToast(toastFromEmbed(embed, launch)) : undefined,
            webhook_url && (await shouldNotify(config)) ? sendWebhook({ ...config, webhook_url }, embed) : undefined,
          ])
        } catch (err) {
          warn(`failed to handle ${event.type}`, err)
        }
      }
    })().catch((err) => {
      if (!controller.signal.aborted) warn("event subscription stopped", err)
    })

    return () => {
      controller.abort()
      disposeRpc?.()
    }
  },
})
