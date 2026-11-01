import type { Plugin } from "@opencode/plugin"
import type { Embed } from "../discord/embed.js"

type Subscription = ReturnType<Plugin.Context["event"]["subscribe"]>

/** Any event emitted by `ctx.event.subscribe`. */
export type OpenCodeEvent = Subscription extends AsyncIterable<infer E> ? E : never
export type EventType = OpenCodeEvent["type"]
export type EventOf<T extends EventType> = Extract<OpenCodeEvent, { type: T }>

/**
 * Turns one OpenCode event type into a Discord embed.
 * Return undefined to skip the notification for this event.
 */
export interface Handler<T extends EventType = EventType> {
  type: T
  handle(event: EventOf<T>, ctx: Plugin.Context): Promise<Embed | undefined>
}

/** Helper that keeps the event type narrowed inside `handle`. */
export const defineHandler = <T extends EventType>(handler: Handler<T>): Handler<T> => handler
