# discord-notify

An [OpenCode](https://opencode.ai) V2 server plugin that posts a Discord webhook message with an embed when a session:

- ✅ finishes (or ❌ fails)
- 🔐 asks for a permission
- 💬 asks a question

Each message looks like:

```json
{
  "content": "<content from options>",
  "embeds": [{ "title": "...", "fields": [ "session, project, agent, model, ..." ] }]
}
```

## Configure

Add it to `opencode.json(c)` with options:

```jsonc
{
  "plugins": [
    {
      "package": "github:thedtvn/discord-notify",
      "options": {
        "webhook_url": "https://discord.com/api/webhooks/<id>/<token>",
        "content": "optional text, e.g. <@your_user_id> to get pinged",
        "inactive_timeout": 300,
        "lockscreen": true
      }
    }
  ]
}
```

For a local checkout, point `package` at the directory instead, e.g. `"C:/path/to/discord-notify"`.

| Option             | Required | Description                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------ |
| `webhook_url`      | yes      | Discord webhook URL                                                      |
| `content`          | no       | Plain message text sent alongside every embed                            |
| `inactive_timeout` | no       | Seconds without keyboard/mouse input (`GetLastInputInfo`) before sending |
| `lockscreen`       | no       | `true` to send while the workstation is locked                           |

If `webhook_url` is missing or invalid the plugin logs a warning and stays idle.

### Away detection (Windows)

When neither `inactive_timeout` nor `lockscreen` is set, every notification is sent.
When either is set, a notification is sent only if **any** enabled condition holds:

- you've been idle for at least `inactive_timeout` seconds, or
- `lockscreen` is `true` and the screen is locked.

If presence can't be read (non-Windows or a probe error), the notification is sent anyway.
The idle time and lock state come from Win32 (`GetLastInputInfo`, `OpenInputDesktop`/`SwitchDesktop`),
called through `bun:ffi`, with a PowerShell fallback. OpenCode must run in your interactive desktop
session, not as a service, for these to reflect your real activity.

## Events

| OpenCode event                | Embed               |
| ----------------------------- | ------------------- |
| `session.execution.succeeded` | Session done        |
| `session.execution.failed`    | Session failed      |
| `permission.asked`            | Permission requested|
| `form.created`                | Question            |

Subagent sessions (those with a parent) don't send "done" notifications.

## License

MIT
