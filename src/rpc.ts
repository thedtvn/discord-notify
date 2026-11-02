import { Rpc } from "@opencode/plugin/rpc"

/**
 * Click-to-open flow (Windows toast -> OpenCode TUI):
 *
 * 1. scripts/open.ps1 (launched by the toast's protocol URI) calls `open`.
 * 2. The server emits `focus`; every running TUI answers with `claim` and a score
 *    (3 = has the session open, 2 = same project, 1 = any TUI).
 * 3. The server picks the best claim, emits `go` to that TUI, and returns its pid so
 *    the script can bring the terminal window to the front.
 * 4. With no claim, `open` returns `handled: false` and the script opens a new terminal.
 */
export const DiscordNotifyRpc = Rpc.define({
  id: "discord-notify",
  methods: {
    open: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, directory: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { handled: { type: "boolean" }, pid: { type: "number" } },
        required: ["handled"],
        additionalProperties: false,
      },
    },
    claim: {
      input: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          pid: { type: "number" },
          score: { type: "number" },
        },
        required: ["requestID", "pid", "score"],
        additionalProperties: false,
      },
      output: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  events: {
    focus: {
      schema: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          sessionID: { type: "string" },
          directory: { type: "string" },
        },
        required: ["requestID", "sessionID"],
        additionalProperties: false,
      },
    },
    go: {
      schema: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          sessionID: { type: "string" },
          pid: { type: "number" },
        },
        required: ["requestID", "sessionID", "pid"],
        additionalProperties: false,
      },
    },
  },
} as const)

export interface OpenInput {
  sessionID: string
  directory?: string
}

export interface ClaimInput {
  requestID: string
  pid: number
  score: number
}

export interface FocusEvent {
  requestID: string
  sessionID: string
  directory?: string
}

export interface GoEvent {
  requestID: string
  sessionID: string
  pid: number
}
