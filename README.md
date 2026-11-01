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
        "content": "optional text, e.g. <@your_user_id> to get pinged"
      }
    }
  ]
}
```

For a local checkout, point `package` at the directory instead, e.g. `"C:/path/to/discord-notify"`.

| Option        | Required | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `webhook_url` | yes      | Discord webhook URL                              |
| `content`     | no       | Plain message text sent alongside every embed    |

If `webhook_url` is missing or invalid the plugin logs a warning and stays idle.

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
