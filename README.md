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
        "lockscreen": true,
        "native_noti": false,
        "focus_noti": false
      }
    }
  ]
}
```

For a local checkout, point `package` at the directory instead, e.g. `"C:/path/to/discord-notify"`.

| Option             | Required | Description                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------ |
| `webhook_url`      | yes*     | Discord webhook URL                                                      |
| `content`          | no       | Plain message text sent alongside every embed                            |
| `inactive_timeout` | no       | Seconds without keyboard/mouse input (`GetLastInputInfo`) before sending |
| `lockscreen`       | no       | `true` to send while the workstation is locked                           |
| `native_noti`      | no       | `true` to also show a Windows toast notification (default `false`)       |
| `focus_noti`       | no       | With `native_noti`, only show the toast when OpenCode isn't focused      |

\* Required unless `native_noti` is `true`. With neither a valid `webhook_url` nor `native_noti`,
the plugin logs a warning and stays idle.

### Native notifications (Windows)

With `native_noti: true`, every notification also shows a Windows toast:

```text
<session name>
<what happened: ✅ Session done / ❌ Session failed / 🔐 Permission requested / 💬 Question: ...>
```

Toasts are shown right away, regardless of `inactive_timeout` / `lockscreen`, which only gate Discord.

With `focus_noti: true`, the toast is skipped while you're looking at OpenCode. OpenCode counts as
focused when the foreground window belongs to an OpenCode process (the desktop app) or to a process
that hosts one: the terminal or editor it runs in (Windows Terminal, VS Code, ...), the shell, or its
console host. Any other foreground app, the desktop, or the lock screen counts as out of focus. If focus
can't be determined, the toast is shown.
They're sent via PowerShell and the WinRT toast API, using PowerShell's app ID, so no install step is needed.

**Click to focus.** Clicking a toast, either the popup or later from the notification panel, brings the
terminal running OpenCode to the front. It restores the window if it was minimized. This uses a
`discord-notify://` link registered for your Windows user (under `HKCU\Software\Classes`, no admin needed)
that runs a tiny native helper, compiled once into `%LOCALAPPDATA%\discord-notify\` with the .NET Framework
C# compiler that ships with Windows. It starts in milliseconds. With several OpenCode terminals open, the
most recently started one is focused.
If they don't appear, check that notifications are allowed for Windows PowerShell in Windows Settings and that Focus/Do Not Disturb is off.

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the code layout and how to add a notification.

## License

MIT
