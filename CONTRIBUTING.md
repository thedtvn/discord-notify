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
├── index.ts              plugin entry: subscribes to events and dispatches to handlers
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
│   └── focus.ts          is an OpenCode terminal/app focused? (focus_noti)
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
