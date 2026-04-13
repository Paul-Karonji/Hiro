# Hiro

Hiro is a self-hosted personal AI agent for Telegram and WhatsApp. It supports normal chat, voice, memory-backed conversations, document ingestion and retrieval, live web research, model switching, file generation and attachment delivery, autonomous mesh workflows, MCP tools, scheduled tasks, a dynamic skills system, and a browser-based operator canvas.

This repository is safe to publish only if you keep secrets out of git and keep the operator-facing routes protected.

## What Hiro Can Do

- Telegram, WhatsApp, or dual-channel operation
- Single-owner access control on both chat surfaces
- Text chat plus voice input and voice replies
- Image and document analysis from chat attachments
- PDF, DOCX, and text ingestion with searchable extracted text
- Memory-backed conversations, summaries, and searchable history
- Built-in web research plus optional remote MCP tools
- Model switching from chat with friendly aliases or exact `provider:model-id`
- Normal chat file generation with attachment delivery back to Telegram or WhatsApp
- Markdown, text, HTML, JSON, CSV, and Word-compatible `.doc` export
- Live browser canvas for rich visual output
- Scheduled and proactive tasks with per-platform delivery targeting (`auto`, `telegram`, `whatsapp`)
- Multi-model mesh workflows with visible progress, failover, parallel step execution, and final-only output
- Dynamic skills system with self-improvement, automatic skill generation, and Hermes/agentskills.io import
- Structured context compression that preserves goal, progress, decisions, files, and next steps across long conversations

## Mesh Workflow

`/mesh <goal>` launches a multi-step workflow instead of a normal one-shot reply.

Current mesh behavior:

- Mesh shows progress milestones while it runs
- Mesh sends only the latest final result back to chat, not every intermediate artifact
- Mesh stores a workflow record in session memory so normal chat can continue from the mesh result
- Mesh rotates worker steps across a collaboration pool of models
- Mesh can fail over to the next model on retryable provider errors such as rate limits, token-budget failures, and upstream provider errors
- Mesh planner and step routing are hardened against malformed structured output, missing markers, and self-looping rejection routes
- Independent steps can run in parallel when the planner sets `parallelWith` — concurrent siblings execute simultaneously up to `swarm.maxParallel` and merge before the next sequential step

Default mesh collaboration pool comes from [src/core/runtimeConfig.ts](./src/core/runtimeConfig.ts) and currently includes:

- `alibaba:qwen3.6-plus`
- `openrouter:qwen/qwen3.6-plus:free`
- `google:gemini-2.5-flash`
- `mistral:mistral-large-latest`
- `groq:llama-3.3-70b-versatile`
- `resurge:grok-4.1-thinking`
- `alibaba:qwen3.5-plus`
- `openrouter:qwen/qwen3.5-plus-02-15`

Mesh uses the active model as the starting planner/default driver context, but worker steps can be routed across the collaboration pool.

## Files And Documents

Hiro has two different document flows:

Incoming attachments:

- Uploaded PDF, DOCX, and text files are parsed
- Extracted text is stored in SQLite and indexed for later retrieval
- Hiro can search those stored documents later with `search_documents`
- Legacy incoming `.doc` files are not parsed

Generated files:

- In normal chat, Hiro can create user-facing files with `export_file`
- Hiro can attach those files back to the current Telegram or WhatsApp chat with `send_file_to_user`
- Generated files are written under `data/`
- Supported output formats are:
  - Markdown: `.md`
  - Plain text: `.txt`
  - HTML: `.html`
  - JSON: `.json`
  - CSV: `.csv`
  - Word-compatible `.doc`

Current `.doc` notes:

- Hiro generates a Word-compatible RTF-backed `.doc`
- Basic headings, bullets, bold text, Unicode punctuation, and markdown tables are converted into document formatting
- This is not true `.docx` generation

## Chat Commands

Telegram supports slash commands directly. WhatsApp supports the same command words with or without a leading slash.

Conversation:

- `/new` - start a fresh conversation thread
- `/compact` - force memory compaction
- `/status` - view background agents and system health
- `/usage` - view recent token and speech usage

Models:

- `/model` - show the active model
- `/models` - browse model aliases and exact ids
- `/setmodel alias`
- `/setmodel provider:model-name`

Workflow:

- `/mesh <goal>` - launch a mesh workflow

Files:

- `/files` - list files in `data/`
- `/download <filename>` - send a file from `data/`

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
PROACTIVE_TIMEZONE=Africa/Nairobi
```

`ACTIVE_CHANNEL` supports:

- `telegram`
- `whatsapp`
- `dual`

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
MCP_CONFIG_JSON=
MCP_CONFIG_JSON_B64=
```

Model selection notes:

- Hiro accepts exact `provider:model-id` values, not only the short aliases shown in chat
- The local process reads from `.env`
- Deployed environments read from deployment secrets
- Keep local and deployed secrets aligned if you want the same model behavior everywhere

## Runtime Config Overrides

Hiro loads optional runtime overrides from `data/runtime_config.json`.

This lets you change:

- default active model
- enabled providers
- channel mode
- tool plugins
- per-role model overrides
- session reset behavior
- agent step limits
- mesh max steps
- mesh collaboration model pool

Example:

```json
{
  "defaultActiveModel": "google:gemini-2.5-flash",
  "roleModelOverrides": {
    "reviewer": "mistral:mistral-large-latest"
  },
  "mesh": {
    "maxSteps": 8,
    "collaborationModels": [
      "google:gemini-2.5-flash",
      "mistral:mistral-large-latest",
      "groq:llama-3.3-70b-versatile"
    ]
  }
}
```

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

- Set a unique app or domain name for your own environment
- Do not commit deployment logs, generated state, or copied secrets
- Keep `data/` out of git. It may contain SQLite state, generated files, runtime config, and WhatsApp auth files
- On Fly, `/app/data` is mounted persistent state. That volume contains SQLite state, generated files, and WhatsApp auth/session files
- To preserve WhatsApp auth, deploy in place to the existing app and volume
- Do not destroy the volume, wipe `/app/data`, or recreate the app unless you intend to re-link WhatsApp
- If you deploy on Fly for a new environment, customize [fly.toml](./fly.toml) with your own app name before deploying

### WhatsApp Auth and Safe Deploys

The `fly.toml` uses `strategy = "immediate"`. This stops the running machine **before** starting the new one, so only one instance ever holds the WhatsApp session at a time. The auth state in `/app/data/whatsapp_auth` is on the persistent volume and survives the deploy — no QR re-scan needed.

Do not change the deploy strategy to `rolling` or `bluegreen` for this app. Those strategies start a new machine before stopping the old one, which causes the WhatsApp session on the old machine to be evicted.

### Health Check

The app exposes `GET /health` (no auth required). Fly polls this every 15 seconds after a 30-second startup grace period. A failed health check during a deploy will abort the release before the old machine is replaced.

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

Recommended secret parity:

- Keep `ACTIVE_MODEL`, provider API keys, and channel/auth secrets consistent with your local `.env` when you expect local and deployed behavior to match
- After changing secrets, restart or redeploy so Hiro reloads them

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

## Skills System

Hiro includes a dynamic skills system that creates, stores, and improves reusable task patterns.

### How It Works

- Skills are stored as Markdown files in `data/skills/` with YAML frontmatter metadata
- Each skill tracks usage count, version, category, and tags
- Skills improve automatically based on usage patterns
- Successful mesh workflows with 3+ steps auto-generate new skills

### Using Skills From Chat

Use the `manage_skills` tool directly in conversation:

| Action | Description |
|--------|-------------|
| `list` | List all skills, optionally filtered by category |
| `search` | Search skills by name, description, tags, or content |
| `get` | View full detail of a specific skill |
| `execute` | Apply a skill pattern to a given context |
| `create` | Create a new skill from a goal, execution trace, and result |
| `improve` | Improve an existing skill with feedback |
| `import` | Import skills from a Hermes/agentskills.io `SKILL.md` file or directory tree |

### Importing Hermes Skills

Hiro can import skills from [Hermes Agent](https://github.com/paulkaronji/hermes-agent) or any agentskills.io-compatible repository. Skills use the standard `SKILL.md` format with YAML frontmatter.

To import all skills from the bundled Hermes clone:

```
manage_skills action=import
```

To import from a specific path or single file:

```
manage_skills action=import source_path=artifacts/hermes-agent/skills/software-development/systematic-debugging/SKILL.md
```

Imported skills are prefixed `hermes-` and saved into `data/skills/`. Duplicate imports are skipped.

### Manual Skills

Custom prompt fragments can also be placed directly in `data/skills/` as plain Markdown files without frontmatter. Hiro injects these into every system prompt. Treat that directory as trusted local operator input, not as a public extension surface.

## Scheduled Tasks

Hiro can schedule recurring tasks using standard cron syntax via the `schedule_task` tool.

```
schedule_task cronExpr="0 8 * * *" prompt="Send a morning briefing"
schedule_task cronExpr="0 8 * * *" prompt="Send weather report to Telegram only" deliverTo="telegram"
```

### Delivery Targeting

The optional `deliverTo` parameter controls where the scheduled output goes when running in dual-channel mode:

| Value | Behavior |
|-------|----------|
| `auto` | Sends to the active channel (default). In `dual` mode this broadcasts to both Telegram and WhatsApp. |
| `telegram` | Sends only to Telegram. |
| `whatsapp` | Sends only to WhatsApp. |

Managing tasks:

- `list_scheduled_tasks` — show all active tasks including their delivery target
- `delete_scheduled_task id=<n>` — cancel and remove a task

Scheduled tasks survive restarts because they are persisted in SQLite and restored by the scheduler on boot.

## Structured Context Compression

Hiro automatically compresses long conversations to preserve context window space. When a session accumulates more than 30 uncompacted messages, the oldest batch is summarized using a structured format:

- **Goal** — the primary objective of the conversation segment
- **Progress** — what was accomplished and current status
- **Decisions** — important choices or approaches taken
- **Files** — files created, modified, or referenced with paths
- **Next Steps** — what work remains

The compression also captures tool interactions from the message batch. Summaries are stored in SQLite and, if Pinecone is configured, also pushed to semantic memory for later retrieval.

Use `/compact` to trigger compression manually.
