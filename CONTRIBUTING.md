# Contributing

## Setup

```sh
bun install
bun run typecheck
```

To try local changes in OpenCode, point the plugin entry at your checkout:

```jsonc
{ "package": "C:/path/to/discord-notify", "options": { "webhook_url": "..." } }
```

## Layout

```text
src/
├── index.ts              server plugin entry: subscribes to events and dispatches to handlers
├── tui.ts                TUI plugin part: switches a running TUI to a clicked toast's session
├── rpc.ts                click-to-open RPC contract shared by the server and TUI parts
├── server/
│   └── open-session.ts   click-to-open RPC implementation (asks running TUIs, picks the best one)
├── config.ts             parses and validates plugin options
├── away.ts               inactive_timeout / lockscreen gate (Discord), focus_noti gate (toast)
├── presence.ts           Windows idle time + lock state (bun:ffi, PowerShell fallback)
├── session.ts            session lookup and shared "session" embed fields
├── log.ts                plugin id and logger
├── dedupe.ts             sends each event once across plugin instances
├── discord/
│   ├── embed.ts          embed types, colors, field/clip helpers, Discord limits
│   └── webhook.ts        POSTs { content, embeds } to the webhook
├── native/
│   ├── toast.ts          Windows toast notification (native_noti), built from the embed
│   ├── focus.ts          is an OpenCode terminal/app focused? (focus_noti)
│   └── protocol.ts       registers the discord-notify:// link a clicked toast opens
scripts/
└── open.ps1              handles discord-notify:// — focus a running TUI or open a new terminal
└── handlers/
    ├── types.ts          Handler interface + defineHandler (typed by event type)
    ├── index.ts          handler registry
    ├── session-done.ts   session.execution.succeeded / failed
    ├── permission.ts     permission.asked
    └── question.ts       form.created
```

## Adding a notification

1. Create `src/handlers/<name>.ts`:

   ```ts
   import { buildEmbed, COLOR } from "../discord/embed.js"
   import { getSession, sessionFields } from "../session.js"
   import { defineHandler } from "./types.js"

   export const myHandler = defineHandler({
     type: "session.execution.interrupted", // any OpenCode event type; `event` is typed from it
     async handle(event, ctx) {
       const session = await getSession(ctx, event.data.sessionID)
       return buildEmbed({
         title: "⏹️ Session interrupted",
         color: COLOR.failed,
         sessionID: event.data.sessionID,
         directory: event.location?.directory, // used by click-to-open
         fields: sessionFields(event.data.sessionID, session, event.location?.directory),
       })
     },
   })
   ```

   Return `undefined` from `handle` to skip sending for that event.

2. Add it to the `handlers` array in `src/handlers/index.ts`.

Delivery, the away check, and error handling are shared, so a handler only builds the embed.

## Pull requests

- Keep `bun run typecheck` passing.
- Update `README.md` when you add options or notifications.
