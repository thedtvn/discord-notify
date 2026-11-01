import { buildEmbed, COLOR, field } from "../discord/embed.js"
import { getSession, sessionFields } from "../session.js"
import { defineHandler } from "./types.js"

interface QuestionField {
  key: string
  title?: string
  description?: string
  type: string
  options?: ReadonlyArray<{ value: string; label: string }>
}

const questionField = (f: QuestionField) => {
  const options = f.options?.length ? f.options.map((o) => `• ${o.label}`).join("\n") : undefined
  const body = [f.description, options].filter(Boolean).join("\n")
  return field(`❓ ${f.title ?? f.key}`, body || `(${f.type})`, false)
}

export const questionAsked = defineHandler({
  type: "form.created",
  async handle(event, ctx) {
    const { form } = event.data
    const session = await getSession(ctx, form.sessionID)
    return buildEmbed({
      title: "💬 Question",
      color: COLOR.question,
      sessionID: form.sessionID,
      description: form.title,
      fields: [
        ...sessionFields(form.sessionID, session, event.location?.directory),
        ...(form.fields as ReadonlyArray<QuestionField>).map(questionField),
      ],
    })
  },
})
