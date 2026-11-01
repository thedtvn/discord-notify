import { permissionAsked } from "./permission.js"
import { questionAsked } from "./question.js"
import { sessionFailed, sessionSucceeded } from "./session-done.js"
import type { Handler } from "./types.js"

/** Every notification the plugin sends. To add one, create a handler file and list it here. */
export const handlers: ReadonlyArray<Handler<any>> = [sessionSucceeded, sessionFailed, permissionAsked, questionAsked]

export const handlerFor = (() => {
  const byType = new Map(handlers.map((h) => [h.type as string, h]))
  return (type: string) => byType.get(type)
})()
