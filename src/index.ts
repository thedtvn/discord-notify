/**
 * OpenCode Discord Notification Plugin (OpenCode V2)
 *
 * Posts a Discord webhook message with an embed when a session:
 * - finishes (succeeded / failed)
 * - asks for a permission
 * - asks a question (form)
 *
 * Configure through plugin options in opencode.json:
 * { "package": "discord-notify", "options": { "webhook_url": "...", "content": "...",
 *   "inactive_timeout": 300, "lockscreen": true } }
 */

import { basename } from "node:path"
import { Plugin } from "@opencode/plugin"
import { getPresence } from "./presence.js"

const PLUGIN_ID = "discord-notify"

const COLOR = {
  done: 0x2ecc71,
  failed: 0xe74c3c,
  permission: 0xf1c40f,
  question: 0x3498db,
} as const

interface DiscordConfig {
  webhook_url: string
  content?: string
  /** Seconds without keyboard/mouse input before notifications are sent. */
  inactive_timeout?: number
  /** Send when the workstation is locked. */
  lockscreen: boolean
}

interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

interface Embed {
  title: string
  description?: string
  color: number
  fields: EmbedField[]
  footer?: { text: string }
  timestamp: string
}

type SessionInfo = Awaited<ReturnType<Plugin.Context["session"]["get"]>>

const warn = (...args: unknown[]) => console.warn(`[${PLUGIN_ID}]`, ...args)

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const field = (name: string, value: unknown, inline = true): EmbedField | undefined => {
  if (value === undefined || value === null || value === "") return undefined
  return { name: clip(name, 256), value: clip(String(value), 1024), inline }
}

function loadConfig(options: Readonly<Record<string, any>>): DiscordConfig | undefined {
  const url = options.webhook_url
  if (typeof url !== "string" || !/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url)) {
    return undefined
  }
  const content = typeof options.content === "string" && options.content ? options.content : undefined
  const timeout = Number(options.inactive_timeout)
  const inactive_timeout = Number.isInteger(timeout) && timeout >= 0 ? timeout : undefined
  if (options.inactive_timeout !== undefined && inactive_timeout === undefined) {
    warn("`inactive_timeout` must be a non-negative integer (seconds), ignoring it")
  }
  return { webhook_url: url, content, inactive_timeout, lockscreen: options.lockscreen === true }
}

/**
 * With neither `inactive_timeout` nor `lockscreen` set, always notify. Otherwise notify
 * when the user has been idle long enough or the screen is locked. If presence can't be
 * read (non-Windows, probe error) notify anyway rather than silently dropping it.
 */
async function shouldNotify(config: DiscordConfig): Promise<boolean> {
  if (config.inactive_timeout === undefined && !config.lockscreen) return true
  const presence = await getPresence()
  if (!presence) return true
  if (config.lockscreen && presence.locked) return true
  if (config.inactive_timeout !== undefined && presence.idleMs >= config.inactive_timeout * 1000) return true
  return false
}

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const config = loadConfig(ctx.options)
    if (!config) {
      warn("missing or invalid `webhook_url` in plugin options, notifications disabled")
      return
    }

    const getSession = async (sessionID: string): Promise<SessionInfo | undefined> => {
      try {
        return await ctx.session.get({ sessionID })
      } catch {
        return undefined
      }
    }

    const sessionFields = (sessionID: string, session: SessionInfo | undefined, directory?: string) => {
      const dir = directory ?? session?.location?.directory
      return [
        field("Session", session?.title ?? sessionID, false),
        field("Project", dir ? basename(dir) : undefined),
        field("Agent", session?.agent),
        field("Model", session?.model ? `${session.model.providerID}/${session.model.id}` : undefined),
        field("Directory", dir ? `\`${dir}\`` : undefined, false),
      ]
    }

    const send = async (embed: Embed) => {
      if (!(await shouldNotify(config))) return
      const body: Record<string, unknown> = { embeds: [embed] }
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

    const build = (
      title: string,
      color: number,
      fields: Array<EmbedField | undefined>,
      sessionID: string,
      description?: string,
    ): Embed => ({
      title: clip(title, 256),
      description: description ? clip(description, 4096) : undefined,
      color,
      fields: fields.filter((f): f is EmbedField => !!f).slice(0, 25),
      footer: { text: `OpenCode • ${sessionID}` },
      timestamp: new Date().toISOString(),
    })

    const onDone = async (sessionID: string, directory: string | undefined, error?: { type: string; message: string }) => {
      const session = await getSession(sessionID)
      // Skip subagent sessions; only the top-level session finishing is interesting.
      if (session?.parentID) return
      const tokens = session?.tokens as { input?: number; output?: number } | undefined
      const cost = session?.cost as unknown
      await send(
        build(
          error ? "❌ Session failed" : "✅ Session done",
          error ? COLOR.failed : COLOR.done,
          [
            ...sessionFields(sessionID, session, directory),
            field("Tokens", tokens ? `in ${tokens.input ?? 0} / out ${tokens.output ?? 0}` : undefined),
            field("Cost", typeof cost === "number" ? `$${cost.toFixed(4)}` : undefined),
            error ? field("Error", `${error.type}: ${error.message}`, false) : undefined,
          ],
          sessionID,
        ),
      )
    }

    const onPermission = async (
      data: { sessionID: string; action: string; resources: readonly string[]; message?: string },
      directory: string | undefined,
    ) => {
      const session = await getSession(data.sessionID)
      const resources = data.resources.length ? data.resources.map((r) => `• \`${r}\``).join("\n") : undefined
      await send(
        build(
          "🔐 Permission requested",
          COLOR.permission,
          [
            ...sessionFields(data.sessionID, session, directory),
            field("Action", `\`${data.action}\``),
            field("Resources", resources, false),
          ],
          data.sessionID,
          data.message,
        ),
      )
    }

    const onQuestion = async (
      form: {
        sessionID: string
        title: string
        fields: ReadonlyArray<{
          key: string
          title?: string
          description?: string
          type: string
          options?: ReadonlyArray<{ value: string; label: string }>
        }>
      },
      directory: string | undefined,
    ) => {
      const session = await getSession(form.sessionID)
      const questions = form.fields.map((f) => {
        const lines = [f.description, f.options?.length ? f.options.map((o) => `• ${o.label}`).join("\n") : undefined]
        return field(`❓ ${f.title ?? f.key}`, lines.filter(Boolean).join("\n") || `(${f.type})`, false)
      })
      await send(
        build(
          "💬 Question",
          COLOR.question,
          [...sessionFields(form.sessionID, session, directory), ...questions],
          form.sessionID,
          form.title,
        ),
      )
    }

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const directory = event.location?.directory
        try {
          switch (event.type) {
            case "session.execution.succeeded":
              await onDone(event.data.sessionID, directory)
              break
            case "session.execution.failed":
              await onDone(event.data.sessionID, directory, event.data.error)
              break
            case "permission.asked":
              await onPermission(event.data, directory)
              break
            case "form.created":
              await onQuestion(event.data.form, directory)
              break
          }
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
