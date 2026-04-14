# Hiro — Full Capabilities Reference

Hiro is a self-hosted personal AI agent accessible over Telegram and WhatsApp. This document covers every capability in the current build, with usage examples and configuration notes.

---

## 1. Chat Channels

Hiro runs on one or both messaging platforms simultaneously.

| Mode | Description |
|------|-------------|
| `telegram` | Standard Telegram bot with slash command support |
| `whatsapp` | WhatsApp bot via Baileys (no slash required — commands work with or without `/`) |
| `dual` | Both channels active simultaneously, shared agent brain |

Set via `ACTIVE_CHANNEL` environment variable. In `dual` mode, scheduled tasks can be routed to a specific platform using `deliverTo`.

---

## 2. Voice Input and Output

### Voice Input
- Telegram voice messages are transcribed automatically before being processed
- WhatsApp voice notes are transcribed and handled identically to text

### Voice Output (Telegram only)
- Tool: `speak_response`
- Powered by Google Cloud TTS
- Hiro decides when to reply with audio based on context (e.g. user sent a voice note)
- Configure voice name, language code, monthly character limit, and max bytes per request via env vars
- WhatsApp does not support `speak_response` — audio playback on WhatsApp is handled by the channel layer from the text reply

---

## 3. Image and Document Analysis

### Images
- Images attached to Telegram or WhatsApp messages are passed directly to the active model
- Works for photos, screenshots, diagrams, receipts, menus, and scanned documents

### Incoming Document Ingestion
- Supported formats: **PDF**, **DOCX**, **plain text**
- Extracted text is stored in SQLite and indexed for later retrieval
- Legacy `.doc` files are not parsed
- After ingestion, Hiro can search those documents in any future conversation using `search_documents`

---

## 4. Memory and Context

Hiro has four distinct memory layers:

### 4a. Conversation History
- Tool: `search_history`
- Full transcript of every message in the current session
- Searchable by keyword or topic across past turns

### 4b. Long-Term Fact Memory
- Tool: `remember_fact` / `search_memory`
- Durable facts stored in SQLite (e.g. "My company is WIK Technologies")
- Facts persist across restarts and session resets
- Optional: if `PINECONE_API_KEY` is set, facts are also pushed to semantic vector memory for fuzzy recall

### 4c. Document Memory
- Tool: `search_documents`
- All ingested PDFs, DOCX files, and text attachments are stored and searchable
- Retrieval is by keyword or semantic similarity

### 4d. Structured Context Compression
- Triggered automatically when a session reaches 30+ uncompacted messages, or manually via `/compact`
- Produces a structured summary with: **Goal**, **Progress**, **Decisions**, **Files**, **Next Steps**
- Summaries are stored in SQLite and optionally in Pinecone
- Keeps the context window clear for long multi-day conversations

---

## 5. Web Research

Three tools cover the full web research stack:

| Tool | What it does |
|------|-------------|
| `search_web` | DuckDuckGo search — returns top results with titles, URLs, and snippets |
| `read_webpage` | Fetches and parses a URL into clean Markdown. Supports pagination (offset parameter) for long pages |
| `crawl_website` | Reads a page and recursively fetches its sub-pages — good for documentation or multi-page guides |

No API key required for `search_web` (uses DuckDuckGo). `TAVILY_API_KEY` enables a higher-quality search backend when set.

**Example:**
```
/mesh Research the top 10 Kenyan hospitals by size and produce a contact list with decision-maker titles
```

---

## 6. File Operations

### Workspace Files (internal)
| Tool | Description |
|------|-------------|
| `read_file` | Read any file inside the workspace |
| `write_file` | Write or overwrite a file |
| `list_directory` | List files in a directory |
| `delete_file` | Delete a file |

### Export and Delivery (user-facing)
| Tool | Description |
|------|-------------|
| `export_file` | Create a file and save it under `data/` |
| `send_file_to_user` | Attach and send a file from `data/` back into the current Telegram or WhatsApp chat |

**Supported export formats:**

| Format | Extension | Notes |
|--------|-----------|-------|
| Markdown | `.md` | Full markdown |
| Plain text | `.txt` | |
| HTML | `.html` | |
| JSON | `.json` | |
| CSV | `.csv` | |
| Word-compatible | `.doc` | RTF-backed, not true DOCX. Supports headings, bullets, bold, tables |

**Example:**
```
Write a detailed investor pitch for WIK Technologies and export it as a .doc file, then send it to me
```

---

## 7. Live Canvas

The **Live Canvas** is a browser panel at `/canvas?token=<OPERATOR_TOKEN>` that Hiro can push interactive HTML widgets to in real time.

- Tool: `render_canvas`
- Accepts any self-contained HTML snippet with optional inline `<script>`
- Built-in utility CSS classes: `canvas-report`, `canvas-stack`, `canvas-grid`, `canvas-panel`, `canvas-label`, `canvas-stat`, `canvas-badge-row`, `canvas-badge`, `canvas-table-wrap`, `canvas-actions`, `canvas-note`, `canvas-divider`
- Uses WebSocket for live push — no page refresh needed
- Good for: comparison tables, usage charts, dashboards, forms, interactive reports

**Example:**
```
Render a live competitor comparison table for WIK Technologies vs 3 Kenyan software firms on the canvas
```

---

## 8. Model Switching

Switch the active AI model from chat at any time without restarting.

**Commands:**
```
/model                         → show current active model
/models                        → browse all available models by section
/setmodel grok41fast           → switch by short alias
/setmodel alibaba:qwen3-max    → switch by exact provider:model-id
/setmodel Qwen Plus Latest     → switch by display name
```

**Available providers:** Resurge, Alibaba (DashScope), Google, OpenRouter, Groq, Mistral, Anthropic, OpenAI, DeepSeek

### Best Free Models (currently configured)

**Resurge — $0/request, no quota:**

| Alias | Model | Speed | Notes |
|-------|-------|-------|-------|
| `grok41fast` | Grok 4.1 Fast | 7.8s | 100% avail — best default |
| `kimi` | Kimi K2 0905 | 8.7s | 100% avail — fast |
| `grok420nr` | Grok 4.20 Non-Reasoning | 9.3s | 100% avail |
| `grok4` | Grok 4 | 13s | 100% avail |
| `grok41expert` | Grok 4.1 Expert | 20s | 100% avail — highest quality |
| `grok41think` | Grok 4.1 Thinking | 23s | 100% avail — best reasoning |

**Alibaba — 1M free tokens (International endpoint) + always-free open-source:**

| Alias | Model | Free Type |
|-------|-------|-----------|
| `qwen3max` | Qwen3 Max | 1M quota — flagship + tool use |
| `qwen` | Qwen Plus Latest | 1M quota — 128K–1M context |
| `qwq` | QwQ Plus | 1M quota — reasoning |
| `qwen235b` | Qwen3 235B | Always free — open-source |
| `qwq32b` | QwQ 32B | Always free — open-source reasoning |
| `qwen3_32b` | Qwen3 32B | Always free — open-source |

**Other free tiers:**

| Alias | Model |
|-------|-------|
| `gemini` | Google Gemini 2.5 Flash — best vision + tool use |
| `qwenor` | Qwen 3.6 Plus Free (OpenRouter) |

---

## 9. Mesh Workflows

`/mesh <goal>` launches a multi-step autonomous workflow instead of a single reply.

### How it works
1. Hiro plans the goal into sequential and parallel steps
2. Each step is routed to the best available model from the collaboration pool
3. Progress milestones are sent to chat as the workflow runs
4. Only the final result is delivered — intermediate artifacts are stored in session memory
5. Failed steps fail over to the next model automatically

### Key features
- **Parallel execution**: Independent steps run simultaneously (`parallelWith`) up to `swarm.maxParallel`
- **Failover**: Bad Gateway, rate limits, and upstream errors trigger automatic retry on the next model
- **Planner hardening**: Handles malformed structured output, missing markers, and self-looping rejection routes
- **Session continuity**: Mesh result is stored in memory so normal chat can continue from where it left off

### Current free mesh pool (11 models)
```
Resurge:  grok-4.1-fast, grok-4.1-expert, grok-4.1-thinking, kimi-k2-0905, grok-4
Alibaba:  qwen3-max, qwen-plus-latest, qwq-plus, qwen3-235b-a22b
Google:   gemini-2.5-flash
OpenRouter: qwen3.6-plus:free
```

### Examples
```
/mesh Write a full investor pitch deck for WIK Technologies — include market size, competitive analysis, revenue model, and team slide

/mesh Find every open accelerator or grant for Kenyan B2B software startups in 2026 — deadlines, eligibility, links

/mesh Build a 3-month content calendar for WIK Technologies LinkedIn and blog — 3 posts per week, mix of thought leadership and case study hooks
```

---

## 10. Scheduled Tasks

Hiro can run any prompt on a recurring cron schedule, even when you're not in the chat.

**Schedule a task:**
```
schedule_task cronExpr="0 8 * * *" prompt="Send a morning briefing with Kenya tech news"
schedule_task cronExpr="0 9 * * 1" prompt="Research new software tenders in Kenya this week" deliverTo="telegram"
schedule_task cronExpr="0 17 * * 5" prompt="Summarise this week's key project updates and flag blockers"
```

**Manage tasks:**
```
list_scheduled_tasks                  → show all tasks with IDs and delivery targets
delete_scheduled_task id=3            → cancel a task
```

**Delivery targeting (`deliverTo`):**

| Value | Behavior |
|-------|----------|
| `auto` | Active channel (broadcasts to both in `dual` mode) |
| `telegram` | Telegram only |
| `whatsapp` | WhatsApp only |

Scheduled tasks survive restarts — persisted in SQLite and restored on boot.

---

## 11. Missions (Long-Term Goal Tracking)

Missions are structured long-term goals that persist across sessions. Up to 5 active missions at a time.

| Tool | Description |
|------|-------------|
| `create_mission` | Create a named mission with a description and optional deadline |
| `breakdown_mission` | Break a mission into prioritised sub-tasks |
| `update_task_status` | Mark tasks as `todo`, `in-progress`, or `done` |
| `add_mission_context` | Append research, notes, or findings to a mission |
| `list_active_missions` | View all missions and their current task states |

**Example:**
```
Create a mission: Land WIK Technologies' first enterprise client by June 2026. Break it into tasks.
```

---

## 12. Skills System

Skills are reusable task patterns stored as Markdown files in `data/skills/`. Hiro injects active skills into every system prompt and can create, improve, and execute them.

| Action | Description |
|--------|-------------|
| `list` | List all skills, optionally filtered by category |
| `search` | Search skills by name, tags, description, or content |
| `get` | View a specific skill in full |
| `execute` | Apply a skill pattern to a given context |
| `create` | Save a new skill from a goal, execution trace, and result |
| `improve` | Update a skill with new feedback or a better approach |
| `import` | Import from a Hermes/agentskills.io `SKILL.md` file or directory |

### Auto-generation
Successful mesh workflows with 3+ steps automatically generate a new skill from the workflow trace.

### Importing Hermes Skills
```
manage_skills action=import
manage_skills action=import source_path=artifacts/hermes-agent/skills/software-development/systematic-debugging/SKILL.md
```

### Manual Skills
Plain Markdown files dropped into `data/skills/` (no frontmatter required) are injected into every system prompt as operator-level context.

---

## 13. Analytics and Usage Tracking

| Tool | Description |
|------|-------------|
| `log_activity` | Log a named activity with optional metadata |
| `query_analytics` | Query logged activity counts, trends, and patterns |
| `get_usage_summary` | View recent token counts and speech usage |
| `render_usage_chart` | Push a usage chart to the Live Canvas |

View from chat:
```
/usage    → token and speech usage summary
/status   → background agents and system health
```

---

## 14. Sessions

Hiro supports multiple named sessions (conversations). Useful for keeping different topics or projects isolated.

| Tool | Description |
|------|-------------|
| `sessions_list` | List all available sessions |
| `sessions_history` | View transcript of another session |
| `sessions_send` | Send a message into a different session |

Chat commands:
```
/new        → start a fresh conversation thread
/compact    → manually trigger context compression
```

---

## 15. Shell Execution

- Tool: `run_shell_command`
- Runs OS commands inside the server workspace
- Useful for file manipulation, running scripts, checking system state
- Use with care — commands execute with the same permissions as the Hiro process

---

## 16. Parallel Swarm

- Tool: `run_swarm`
- Spins up focused worker agents for bounded parallel subtasks
- Used internally by the mesh planner when `parallelWith` is set
- Max concurrent workers controlled by `swarm.maxParallel` in `runtime_config.json`

---

## 17. MCP Tools (External Tool Servers)

Hiro connects to remote Model Context Protocol (MCP) servers and exposes their tools alongside built-in tools.

**Configure via environment:**
```env
MCP_CONFIG_JSON={"mcpServers":{"tasks":{"type":"http","url":"https://mcp.example.com/mcp","headers":{"Authorization":"Bearer ${MCP_API_TOKEN}"}}}}
```
Or base64-encoded: `MCP_CONFIG_JSON_B64=...`

MCP tools appear as `mcp_<name>` tools in the agent's tool list. Supports `stdio` and `http` transport types.

**Example: Gmail MCP**
```json
{
  "mcpServers": {
    "gmail": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gmail"]
    }
  }
}
```
Once connected: `Read my Gmail and draft replies to any unanswered client emails from this week`

---

## 18. Webhooks

Hiro accepts external events via a secured webhook endpoint.

```bash
curl -X POST https://hiro.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hiro-Webhook-Secret: <WEBHOOK_SECRET>" \
  -d '{"event":"deployment_completed","project":"example-app","status":"success"}'
```

- Webhook-triggered runs use a restricted read-only tool set
- Useful for CI/CD notifications, external system alerts, and event-driven automations

---

## 19. Runtime Config (Live Overrides)

`data/runtime_config.json` lets you tune Hiro's behaviour without redeploying.

```json
{
  "defaultActiveModel": "alibaba:qwen3-max",
  "enabledProviders": ["resurge", "alibaba", "google", "openrouter"],
  "mesh": {
    "maxSteps": 10,
    "collaborationModels": [
      "resurge:grok-4.1-fast",
      "alibaba:qwen3-max",
      "alibaba:qwen-plus-latest",
      "google:gemini-2.5-flash"
    ]
  },
  "swarm": { "maxParallel": 3 },
  "roleModelOverrides": {
    "reviewer": "alibaba:qwq-plus"
  },
  "sessions": {
    "idleResetHours": 18,
    "dailyResetHour": null,
    "timezone": "Africa/Nairobi"
  },
  "agent": {
    "maxSteps": 15,
    "recentMessages": 20,
    "maxTokens": 32768
  }
}
```

> **Note:** This file persists on the Fly volume. Delete it to reset to code defaults: `flyctl ssh console --app hiro --command "rm /app/data/runtime_config.json"`

---

## 20. Security Model

| Surface | Protection |
|---------|------------|
| `/canvas`, `/canvas/ws`, `/qr` | `OPERATOR_TOKEN` (Bearer or `?token=`) |
| `/webhook` | `WEBHOOK_SECRET` (header or Bearer) |
| `/health` | Public — no auth |
| Telegram | `ALLOWED_USER_ID` allowlist |
| WhatsApp | `WHATSAPP_ALLOWED_JID` allowlist |

Single-owner design — Hiro is built for one operator. All chat surfaces enforce identity before any tool executes.

---

## 21. Chat Command Reference

| Command | Description |
|---------|-------------|
| `/new` | Start a fresh conversation |
| `/compact` | Force memory compaction |
| `/status` | View background agents and system health |
| `/usage` | View recent token and speech usage |
| `/model` | Show active model |
| `/models` | Browse full model catalog |
| `/setmodel <alias>` | Switch active model |
| `/mesh <goal>` | Launch a mesh workflow |
| `/files` | List files in `data/` |
| `/download <filename>` | Send a file from `data/` to chat |

---



**Deploy commands:**
```bash
flyctl deploy --app hiro
flyctl status --app hiro
flyctl logs --app hiro
flyctl ssh console --app hiro
```

---

*Last updated: April 2026. Source: `src/tools/index.ts`, `src/agent/capabilities.ts`, `src/core/runtimeConfig.ts`, `src/bot/modelCatalog.ts`*
