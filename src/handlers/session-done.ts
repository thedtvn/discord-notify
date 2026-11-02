import type { Plugin } from "@opencode/plugin"
import { buildEmbed, COLOR, field } from "../discord/embed.js"
import { getSession, sessionFields } from "../session.js"
import { defineHandler } from "./types.js"

async function doneEmbed(
  ctx: Plugin.Context,
  sessionID: string,
  directory: string | undefined,
  error?: { type: string; message: string },
) {
  const session = await getSession(ctx, sessionID)
  // Skip subagent sessions; only the top-level session finishing is interesting.
  if (session?.parentID) return undefined

  const tokens = session?.tokens as { input?: number; output?: number } | undefined
  const cost = session?.cost as unknown
  return buildEmbed({
    title: error ? "❌ Session failed" : "✅ Session done",
    color: error ? COLOR.failed : COLOR.done,
    sessionID,
    fields: [
      ...sessionFields(sessionID, session, directory),
      field("Tokens", tokens ? `in ${tokens.input ?? 0} / out ${tokens.output ?? 0}` : undefined),
      field("Cost", typeof cost === "number" ? `$${cost.toFixed(4)}` : undefined),
      error ? field("Error", `${error.type}: ${error.message}`, false) : undefined,
    ],
  })
}

export const sessionSucceeded = defineHandler({
  type: "session.execution.succeeded",
  key: (event) => `${event.data.sessionID}:${event.durable.seq}`,
  handle: (event, ctx) => doneEmbed(ctx, event.data.sessionID, event.location?.directory),
})

export const sessionFailed = defineHandler({
  type: "session.execution.failed",
  key: (event) => `${event.data.sessionID}:${event.durable.seq}`,
  handle: (event, ctx) => doneEmbed(ctx, event.data.sessionID, event.location?.directory, event.data.error),
})
