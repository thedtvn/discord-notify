import { randomUUID } from "node:crypto"
import type { Plugin } from "@opencode/plugin"
import { warn } from "../log.js"
import { type ClaimInput, DiscordNotifyRpc, type OpenInput } from "../rpc.js"

/** How long `open` waits for running TUIs to answer before giving up. */
const CLAIM_WINDOW_MS = 600

interface Pending {
  claims: ClaimInput[]
}

// Shared across plugin instances (one per location), so a claim received by any
// instance reaches the `open` call waiting in another.
const PENDING = Symbol.for("discord-notify.pending")
const pending = (): Map<string, Pending> => {
  const g = globalThis as { [PENDING]?: Map<string, Pending> }
  return (g[PENDING] ??= new Map())
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true })
  })

/** Registers the click-to-open RPC. Returns a disposer, or undefined if registration failed. */
export async function registerOpenSession(ctx: Plugin.Context): Promise<(() => void) | undefined> {
  try {
    const registration = await ctx.rpc.register(DiscordNotifyRpc, {
      open: async (input, { signal }) => {
        const { sessionID, directory } = input as OpenInput
        const requestID = randomUUID()
        const request: Pending = { claims: [] }
        pending().set(requestID, request)
        try {
          await registration.events.emit("focus", { requestID, sessionID, ...(directory ? { directory } : {}) })
          await sleep(CLAIM_WINDOW_MS, signal)
          const best = request.claims.reduce<ClaimInput | undefined>(
            (top, c) => (!top || c.score > top.score ? c : top),
            undefined,
          )
          if (!best) return { handled: false }
          await registration.events.emit("go", { requestID, sessionID, pid: best.pid })
          return { handled: true, pid: best.pid }
        } finally {
          pending().delete(requestID)
        }
      },
      claim: async (input) => {
        const claim = input as ClaimInput
        pending().get(claim.requestID)?.claims.push(claim)
        return {}
      },
    })
    return () => void registration.dispose().catch(() => {})
  } catch (err) {
    warn("could not register the click-to-open RPC", err)
    return undefined
  }
}
