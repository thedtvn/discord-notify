/**
 * TUI part: lets a clicked Windows notification switch a running OpenCode TUI to its session.
 * See src/rpc.ts for the full flow.
 */

import { Plugin } from "@opencode/plugin/tui"
import { DiscordNotifyRpc, type FocusEvent, type GoEvent } from "./rpc.js"

const normalize = (dir: string | undefined) => dir?.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase()

export default Plugin.define({
  id: "discord-notify.tui",
  setup(context) {
    const rpc = context.client.rpc(DiscordNotifyRpc)

    const hasSession = (sessionID: string) => {
      const route = context.ui.router.current() as { type?: string; sessionID?: string }
      if (route.type === "session" && route.sessionID === sessionID) return true
      return context.ui.tabs.enabled() && context.ui.tabs.list().some((t) => t.sessionID === sessionID)
    }

    const score = ({ sessionID, directory }: FocusEvent) => {
      if (hasSession(sessionID)) return 3
      const here = normalize(context.location?.directory)
      if (here && here === normalize(directory)) return 2
      return 1
    }

    const stopFocus = rpc.events.on("focus", (event) => {
      const data = event.data as unknown as FocusEvent
      void rpc.claim({ requestID: data.requestID, pid: process.pid, score: score(data) }).catch(() => {})
    })

    const stopGo = rpc.events.on("go", (event) => {
      const { sessionID, pid } = event.data as unknown as GoEvent
      if (pid !== process.pid) return
      if (!(context.ui.tabs.enabled() && context.ui.tabs.focus(sessionID))) {
        context.ui.router.navigate({ type: "session", sessionID })
      }
    })

    return () => {
      stopFocus()
      stopGo()
    }
  },
})
