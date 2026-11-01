export const PLUGIN_ID = "discord-notify"

export const warn = (...args: unknown[]) => console.warn(`[${PLUGIN_ID}]`, ...args)
