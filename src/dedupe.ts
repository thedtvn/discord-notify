/**
 * OpenCode loads one plugin instance per location, and every instance's
 * `ctx.event.subscribe` receives the server-wide event stream. Without this,
 * one event produces one Discord message per loaded instance.
 *
 * Instances share a process, so the first one to claim a key wins. The registry
 * lives on globalThis because each instance may get its own module copy.
 */

const TTL_MS = 10 * 60_000
const REGISTRY = Symbol.for("discord-notify.claimed")

type Registry = Map<string, number>

const registry = (): Registry => {
  const g = globalThis as { [REGISTRY]?: Registry }
  return (g[REGISTRY] ??= new Map())
}

/** Returns true the first time `key` is claimed (within the TTL), false for duplicates. */
export function claim(key: string, now = Date.now()): boolean {
  const claimed = registry()
  for (const [k, at] of claimed) {
    if (now - at < TTL_MS) break
    claimed.delete(k)
  }
  if (claimed.has(key)) return false
  claimed.set(key, now)
  return true
}
