import type { DiscordConfig } from "../config.js"
import { warn } from "../log.js"
import type { Embed } from "./embed.js"

/** Posts `{ content, embeds: [embed] }` to the webhook. Errors are logged, never thrown. */
export async function sendWebhook(config: DiscordConfig & { webhook_url: string }, embed: Embed): Promise<void> {
  const body: { content?: string; embeds: Embed[] } = { embeds: [embed] }
  if (config.content) body.content = config.content
  try {
    const res = await fetch(config.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) warn(`webhook responded ${res.status}: ${await res.text().catch(() => "")}`)
  } catch (err) {
    warn("webhook request failed", err)
  }
}
