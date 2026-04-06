# Hiro

Hiro is a self-hosted personal AI agent for Telegram and WhatsApp. It supports chat, voice, memory, web research, scheduled tasks, MCP tools, model switching, and a browser-based operator canvas.

This repository is safe to publish only if you keep deployment secrets out of git and configure access control for operator-facing routes.

## Features

- Telegram and WhatsApp channels
- Single-owner access controls for both chat surfaces
- Voice input and voice replies
- Document ingestion for PDF, DOCX, and text uploads
- Memory-backed conversations and summaries
- Searchable stored document text for later retrieval
- Web research and built-in tools
- Optional remote MCP tools
- Scheduled and proactive tasks
- Live browser canvas for visual output

## Security Model

The following routes are protected and should stay protected in every environment:

- `/qr`
- `/canvas`
- `/canvas/ws`
- `/webhook`

Required secrets:

- `OPERATOR_TOKEN` for `/qr`, `/canvas`, and `/canvas/ws`
- `WEBHOOK_SECRET` for `/webhook`

Operator routes accept either:

- `Authorization: Bearer <OPERATOR_TOKEN>`
- `?token=<OPERATOR_TOKEN>` on the URL, which also establishes an operator cookie

Webhook requests must include either:

- `X-Hiro-Webhook-Secret: <WEBHOOK_SECRET>`
- `Authorization: Bearer <WEBHOOK_SECRET>`

## Environment Variables

Create a local `.env` from `.env.example` and fill in only the providers you actually use.

Core:

```env
TELEGRAM_BOT_TOKEN=
ALLOWED_USER_ID=
ACTIVE_CHANNEL=telegram
WHATSAPP_ALLOWED_JID=

PORT=<your-port>
PUBLIC_BASE_URL=http://localhost:<your-port>
OPERATOR_TOKEN=
WEBHOOK_SECRET=

ACTIVE_MODEL=<provider:model-id>
```

Providers and services:

```env
ALIBABA_API_KEY=
ALIBABA_BASE_URL=<compatible-api-base-url>
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
RESURGE_API_KEY=
GROQ_API_KEY=
TAVILY_API_KEY=
PINECONE_API_KEY=
NEON_DATABASE_URL=
GOOGLE_TTS_PROJECT_ID=
GOOGLE_TTS_CREDENTIALS_B64=
GOOGLE_TTS_VOICE_NAME=<voice-name>
GOOGLE_TTS_LANGUAGE_CODE=<language-code>
GOOGLE_TTS_MONTHLY_CHAR_LIMIT=<monthly-char-limit>
GOOGLE_TTS_MAX_BYTES_PER_REQUEST=<max-bytes-per-request>
MCP_CONFIG_JSON_B64=
```

Model selection notes:

- Hiro accepts exact `provider:model-id` values, not only the short aliases shown in the chat menu.
- The local process reads from `.env`; deployed Fly instances read from Fly secrets.
- Keep the local `.env` and deployed secrets aligned if you want model behavior to match between local and production.

## Local Development

```bash
npm install
npm run dev
```

If you use WhatsApp, open the QR page with your operator token:

```text
http://localhost:<your-port>/qr?token=<OPERATOR_TOKEN>
```

If you use the browser canvas:

```text
http://localhost:<your-port>/canvas?token=<OPERATOR_TOKEN>
```

Do not run multiple Telegram polling processes against the same bot token.

## Deployment Notes

- Set a unique app/domain name for your own environment.
- Do not commit deployment logs, generated state, or copied secrets.
- Keep `data/` out of git. It may contain SQLite state and WhatsApp auth files.
- On Fly, `/app/data` is mounted persistent state. That volume contains the SQLite database and WhatsApp auth/session files.
- To preserve WhatsApp auth, deploy in place to the existing app and volume. Do not destroy the volume, wipe `/app/data`, or recreate the app unless you intend to re-link WhatsApp.
- If you deploy on Fly for a new environment, customize [fly.toml](./fly.toml) with your own app name before deploying.

Example deploy flow:

```bash
flyctl launch
flyctl deploy
flyctl status
```

For an existing Fly app:

```bash
flyctl deploy -a hiro
flyctl status -a hiro
```

Recommended Fly secret parity:

- Keep `ACTIVE_MODEL`, provider API keys, and channel/auth secrets consistent with your local `.env` when you expect local and deployed behavior to match.
- After changing secrets, restart or redeploy so Hiro reloads them.

Document handling notes:

- Uploaded PDF, DOCX, and text files are parsed and Hiro stores the extracted text in SQLite.
- Hiro stores extracted text, summaries, and search index entries, not the raw original binary blob.
- Legacy `.doc` files are not parsed in the current implementation.

## Webhook Example

```bash
curl -X POST https://your-host.example.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hiro-Webhook-Secret: <WEBHOOK_SECRET>" \
  -d '{"event":"deployment_completed","project":"example-app","status":"success"}'
```

Webhook-triggered runs are intentionally restricted to a narrow read-only tool set.

## Optional MCP Config

You can provide remote MCP servers through `MCP_CONFIG_JSON` or `MCP_CONFIG_JSON_B64`.

Example:

```json
{
  "mcpServers": {
    "tasks": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_API_TOKEN}"
      }
    }
  }
}
```

## Custom Skills

Custom prompt fragments can be placed in `data/skills/` as Markdown files. Treat that directory as trusted local operator input, not as a public extension surface.
