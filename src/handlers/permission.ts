import { buildEmbed, COLOR, field } from "../discord/embed.js"
import { getSession, sessionFields } from "../session.js"
import { defineHandler } from "./types.js"

export const permissionAsked = defineHandler({
  type: "permission.asked",
  key: (event) => event.data.id,
  async handle(event, ctx) {
    const { sessionID, action, resources, message } = event.data
    const session = await getSession(ctx, sessionID)
    const list = resources.length ? resources.map((r) => `• \`${r}\``).join("\n") : undefined
    return buildEmbed({
      title: "🔐 Permission requested",
      color: COLOR.permission,
      sessionID,
      description: message,
      fields: [
        ...sessionFields(sessionID, session, event.location?.directory),
        field("Action", `\`${action}\``),
        field("Resources", list, false),
      ],
    })
  },
})
