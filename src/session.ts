import { basename } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { field } from "./discord/embed.js"

export type SessionInfo = Awaited<ReturnType<Plugin.Context["session"]["get"]>>

/** Fetches a session, returning undefined instead of throwing (e.g. it was deleted). */
export async function getSession(ctx: Plugin.Context, sessionID: string): Promise<SessionInfo | undefined> {
  try {
    return await ctx.session.get({ sessionID })
  } catch {
    return undefined
  }
}

/** Common embed fields describing a session: title, project, agent, model, directory. */
export function sessionFields(sessionID: string, session: SessionInfo | undefined, directory?: string) {
  const dir = directory ?? session?.location?.directory
  return [
    field("Session", session?.title ?? sessionID, false),
    field("Project", dir ? basename(dir) : undefined),
    field("Agent", session?.agent),
    field("Model", session?.model ? `${session.model.providerID}/${session.model.id}` : undefined),
    field("Directory", dir ? `\`${dir}\`` : undefined, false),
  ]
}
