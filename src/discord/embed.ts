export const COLOR = {
  done: 0x2ecc71,
  failed: 0xe74c3c,
  permission: 0xf1c40f,
  question: 0x3498db,
} as const

export interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface Embed {
  title: string
  description?: string
  color: number
  fields: EmbedField[]
  footer?: { text: string }
  timestamp: string
}

// Discord embed limits: https://discord.com/developers/docs/resources/message#embed-object-embed-limits
const LIMIT = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25 } as const

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Builds an embed field, or undefined when the value is empty (so it can be dropped). */
export const field = (name: string, value: unknown, inline = true): EmbedField | undefined => {
  if (value === undefined || value === null || value === "") return undefined
  return { name: clip(name, LIMIT.fieldName), value: clip(String(value), LIMIT.fieldValue), inline }
}

export interface EmbedInput {
  title: string
  color: number
  fields: Array<EmbedField | undefined>
  sessionID: string
  description?: string
}

export const buildEmbed = ({ title, color, fields, sessionID, description }: EmbedInput): Embed => ({
  title: clip(title, LIMIT.title),
  description: description ? clip(description, LIMIT.description) : undefined,
  color,
  fields: fields.filter((f): f is EmbedField => !!f).slice(0, LIMIT.fields),
  footer: { text: `OpenCode • ${sessionID}` },
  timestamp: new Date().toISOString(),
})
