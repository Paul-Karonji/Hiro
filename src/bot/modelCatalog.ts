type ModelEntry = {
  id: string;
  alias: string;
  label: string;
  note: string;
  section: string;
  aliases?: string[];
};

const MODEL_ENTRIES: ModelEntry[] = [
  {
    id: "openrouter:openai/gpt-oss-120b:free",
    alias: "gptoss120b",
    label: "GPT-OSS 120B (free)",
    note: "120B MoE, 5.1B active, reasoning + tool use — free",
    section: "OpenRouter",
    aliases: ["oss120b", "gptoss"],
  },
  {
    id: "openrouter:openai/gpt-oss-20b:free",
    alias: "gptoss20b",
    label: "GPT-OSS 20B (free)",
    note: "21B MoE, 3.6B active, lower latency — free",
    section: "OpenRouter",
    aliases: ["oss20b"],
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct:free",
    alias: "llama33",
    label: "Llama 3.3 70B (free)",
    note: "70B multilingual, strong general purpose — free",
    section: "OpenRouter",
    aliases: ["llama70b", "llama70bfree"],
  },
  {
    id: "openrouter:deepseek/deepseek-r1:free",
    alias: "deepseekr1",
    label: "DeepSeek R1 (free)",
    note: "open-source reasoning model — free",
    section: "OpenRouter",
    aliases: ["r1", "dsr1"],
  },
  {
    id: "openrouter:qwen/qwen3.6-plus:free",
    alias: "qwenor",
    label: "Qwen 3.6 Plus (free)",
    note: "fast Qwen via OpenRouter — free",
    section: "OpenRouter",
    aliases: ["qwenfree", "orqwen"],
  },
  {
    id: "openrouter:qwen/qwen3-coder:free",
    alias: "qwencoder",
    label: "Qwen3 Coder 480B (free)",
    note: "480B MoE, 35B active, agentic coding — free",
    section: "OpenRouter",
    aliases: ["qwen3coder", "orqwencoder"],
  },
  {
    id: "openrouter:z-ai/glm-4.5-air:free",
    alias: "glm45air",
    label: "GLM 4.5 Air (free)",
    note: "agentic MoE, thinking + non-thinking modes — free",
    section: "OpenRouter",
    aliases: ["glm45", "glmair"],
  },
  {
    id: "openrouter:google/gemma-4-31b-it:free",
    alias: "gemma4",
    label: "Gemma 4 31B (free)",
    note: "31B dense, vision + text, 256K ctx, thinking mode — free",
    section: "OpenRouter",
    aliases: ["gemma31b", "gemma4it"],
  },
  {
    id: "openrouter:google/gemma-4-26b-a4b-it:free",
    alias: "gemma4moe",
    label: "Gemma 4 26B MoE (free)",
    note: "26B MoE, 3.8B active, vision + thinking — free",
    section: "OpenRouter",
    aliases: ["gemma4a4b", "gemma4moe"],
  },
  {
    id: "openrouter:minimax/minimax-m2.5:free",
    alias: "minimax25",
    label: "MiniMax M2.5 (free)",
    note: "agentic, 80% SWE-Bench, code + office tasks — free",
    section: "OpenRouter",
    aliases: ["m25", "minimaxm25"],
  },
  {
    id: "openrouter:nvidia/nemotron-3-nano-30b-a3b:free",
    alias: "nemotron30b",
    label: "Nemotron 3 Nano 30B (free)",
    note: "30B MoE, agentic AI systems — free",
    section: "OpenRouter",
    aliases: ["nemotron", "nemotron30"],
  },
  {
    id: "openrouter:arcee-ai/trinity-large-preview:free",
    alias: "trinity",
    label: "Arcee Trinity Large (free)",
    note: "400B sparse MoE, 13B active, creative + agentic — free",
    section: "OpenRouter",
    aliases: ["arceetrinity", "trinityai"],
  },
  {
    id: "google:gemini-2.5-flash",
    alias: "gemini",
    label: "Gemini 2.5 Flash",
    note: "best tool use and vision",
    section: "Recommended",
    aliases: ["flash", "gemini25", "googleflash"],
  },
  {
    id: "resurge:grok-3-mini",
    alias: "grok3mini",
    label: "Grok 3 Mini",
    note: "fast Grok through Resurge",
    section: "Recommended",
    aliases: ["grokmini", "rgrokmini"],
  },
  {
    id: "resurge:deepseek-ai/deepseek-v3.1",
    alias: "deepseek31",
    label: "DeepSeek V3.1",
    note: "strong reasoning through Resurge",
    section: "Recommended",
    aliases: ["deepseek", "dsv31"],
  },
  {
    id: "alibaba:qwq-32b",
    alias: "qwq32b",
    label: "QwQ 32B (Alibaba)",
    note: "open-source reasoning model hosted by Alibaba \u2014 free",
    section: "Alibaba",
    aliases: ["qwq32", "aliqwq32"],
  },
  {
    id: "alibaba:qwen3-235b-a22b",
    alias: "qwen235b",
    label: "Qwen3 235B (Alibaba)",
    note: "open-source 235B MoE, thinking + non-thinking \u2014 free",
    section: "Alibaba",
    aliases: ["qwen235", "qwengiant", "ali235b"],
  },
  {
    id: "alibaba:qwen3-32b",
    alias: "qwen3_32b",
    label: "Qwen3 32B (Alibaba)",
    note: "open-source 32B dual-mode \u2014 free",
    section: "Alibaba",
    aliases: ["qwen332b", "ali32b"],
  },
  {
    id: "alibaba:qwen3-30b-a3b",
    alias: "qwen3_30b",
    label: "Qwen3 30B MoE (Alibaba)",
    note: "open-source 30B MoE dual-mode \u2014 free",
    section: "Alibaba",
    aliases: ["qwen330b", "ali30b"],
  },
  {
    id: "google:gemini-2.0-flash",
    alias: "gemini20",
    label: "Gemini 2.0 Flash",
    note: "older Gemini fallback",
    section: "Google",
    aliases: ["flash20"],
  },
  {
    id: "groq:llama-3.3-70b-versatile",
    alias: "groq70b",
    label: "Groq Llama 3.3 70B",
    note: "strong Groq text model",
    section: "Groq",
    aliases: ["groq33", "llama70b"],
  },
  {
    id: "groq:llama-3.1-70b-versatile",
    alias: "groq31",
    label: "Groq Llama 3.1 70B",
    note: "older Groq fallback",
    section: "Groq",
    aliases: ["groqold"],
  },
  {
    id: "mistral:mistral-large-latest",
    alias: "mistrallarge",
    label: "Mistral Large",
    note: "best Mistral quality",
    section: "Mistral",
    aliases: ["mistral", "mlarge"],
  },
  {
    id: "mistral:mistral-small-latest",
    alias: "mistralsmall",
    label: "Mistral Small",
    note: "lighter Mistral option",
    section: "Mistral",
    aliases: ["msmall"],
  },
  {
    id: "resurge:grok-3",
    alias: "grok3",
    label: "Grok 3",
    note: "full Grok 3 via Resurge, 100% avail",
    section: "ResurgeAI",
    aliases: ["rgrok3"],
  },
  {
    id: "resurge:grok-3-thinking",
    alias: "grok3think",
    label: "Grok 3 Thinking",
    note: "reasoning Grok 3, no recent calls",
    section: "ResurgeAI",
    aliases: ["grokthink", "rgrokthink"],
  },
  {
    id: "resurge:grok-4",
    alias: "grok4",
    label: "Grok 4",
    note: "100% avail, 13s complete",
    section: "ResurgeAI",
    aliases: ["rgrok4"],
  },
  {
    id: "resurge:grok-4-thinking",
    alias: "grok4think",
    label: "Grok 4 Thinking",
    note: "unstable — 10% avail, avoid for mesh",
    section: "ResurgeAI",
    aliases: ["g4think"],
  },
  {
    id: "resurge:grok-4.1-fast",
    alias: "grok41fast",
    label: "Grok 4.1 Fast",
    note: "100% avail, 7.8s complete — fastest Grok",
    section: "ResurgeAI",
    aliases: ["g41fast"],
  },
  {
    id: "resurge:grok-4.1-mini",
    alias: "grok41mini",
    label: "Grok 4.1 Mini",
    note: "100% avail, 9s complete",
    section: "ResurgeAI",
    aliases: ["g41mini"],
  },
  {
    id: "resurge:grok-4.1-thinking",
    alias: "grok41think",
    label: "Grok 4.1 Thinking",
    note: "100% avail, 23s complete",
    section: "ResurgeAI",
    aliases: ["g41think"],
  },
  {
    id: "resurge:grok-4.1-expert",
    alias: "grok41expert",
    label: "Grok 4.1 Expert",
    note: "100% avail, 20s complete",
    section: "ResurgeAI",
    aliases: ["g41expert"],
  },
  {
    id: "resurge:grok-4.20-beta",
    alias: "grok420",
    label: "Grok 4.20 Beta",
    note: "100% avail, 13s complete",
    section: "ResurgeAI",
    aliases: ["g420"],
  },
  {
    id: "resurge:grok-4.20-0309-non-reasoning",
    alias: "grok420nr",
    label: "Grok 4.20 Non-Reasoning",
    note: "100% avail, 9.3s complete",
    section: "ResurgeAI",
    aliases: ["g420nr", "grok420nonreason"],
  },
  {
    id: "resurge:grok-4.20-0309-reasoning",
    alias: "grok420r",
    label: "Grok 4.20 Reasoning",
    note: "100% avail, 23s complete",
    section: "ResurgeAI",
    aliases: ["g420r", "grok420reason"],
  },
  {
    id: "resurge:deepseek-ai/deepseek-v3.2",
    alias: "deepseek32",
    label: "DeepSeek V3.2",
    note: "60% avail, use v3.1 as fallback",
    section: "ResurgeAI",
    aliases: ["dsv32"],
  },
  {
    id: "resurge:deepseek-ai/deepseek-v3.1-terminus",
    alias: "deepseek31t",
    label: "DeepSeek V3.1 Terminus",
    note: "100% avail, 77s complete — most reliable DeepSeek",
    section: "ResurgeAI",
    aliases: ["dsv31t", "deepseekterminus"],
  },
  {
    id: "resurge:moonshotai/kimi-k2-instruct-0905",
    alias: "kimi",
    label: "Kimi K2 0905",
    note: "100% avail, 8.7s complete — fast",
    section: "ResurgeAI",
    aliases: ["kimik2", "kimi0905"],
  },
  {
    id: "resurge:moonshotai/kimi-k2-thinking",
    alias: "kimithink",
    label: "Kimi K2 Thinking",
    note: "100% avail, 31s complete",
    section: "ResurgeAI",
    aliases: ["kimireason"],
  },
  {
    id: "resurge:moonshotai/kimi-k2.5",
    alias: "kimi25",
    label: "Kimi K2.5",
    note: "100% avail, 63s complete",
    section: "ResurgeAI",
    aliases: ["kimiv25"],
  },
  {
    id: "resurge:minimaxai/minimax-m2.7",
    alias: "minimax",
    label: "MiniMax M2.7",
    note: "90% avail, 86s complete",
    section: "ResurgeAI",
    aliases: ["m27", "minimaxm27"],
  },
  {
    id: "resurge:qwen/qwen3.5-397b-a17b",
    alias: "qwen397b",
    label: "Qwen 3.5 397B",
    note: "90% avail, 119s complete — massive model",
    section: "ResurgeAI",
    aliases: ["qwen397", "qwengiant"],
  },
  {
    id: "resurge:z-ai/glm4.7",
    alias: "glm47",
    label: "GLM 4.7",
    note: "100% avail, 38s complete",
    section: "ResurgeAI",
    aliases: ["glm", "zai"],
  },
  {
    id: "resurge:z-ai/glm5",
    alias: "glm5",
    label: "GLM 5",
    note: "80% avail, 33s complete",
    section: "ResurgeAI",
    aliases: ["zaiglm5"],
  },
];

function normalizeSelector(value: string) {
  return value.toLowerCase().trim().replace(/[`"'_\s./:-]+/g, "");
}

function getModelName(id: string) {
  const separatorIndex = id.indexOf(":");
  return separatorIndex >= 0 ? id.slice(separatorIndex + 1) : id;
}

const selectorMap = new Map<string, string>();
for (const entry of MODEL_ENTRIES) {
  selectorMap.set(normalizeSelector(entry.id), entry.id);
  selectorMap.set(normalizeSelector(entry.alias), entry.id);
  selectorMap.set(normalizeSelector(entry.label), entry.id);
  selectorMap.set(normalizeSelector(getModelName(entry.id)), entry.id);
  for (const alias of entry.aliases ?? []) {
    selectorMap.set(normalizeSelector(alias), entry.id);
  }
}

export function resolveModelSelection(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Missing model name. Use `/models` to browse options.");
  }

  const exact = selectorMap.get(normalizeSelector(trimmed));
  if (exact) {
    return exact;
  }

  if (trimmed.includes(":")) {
    return trimmed;
  }

  throw new Error(`Unknown model "${trimmed}". Use \`/models\` to browse or pass the full provider:model id.`);
}

export function buildModelsCatalogMarkdown(activeModelId: string) {
  const sections = ["Recommended", "Alibaba", "Google", "Groq", "Mistral", "ResurgeAI", "OpenRouter"];
  const lines: string[] = [
    "Model Menu",
    `Current: \`${activeModelId}\``,
    "",
    "Use `/setmodel alias` for short names.",
    "You can also pass the full id with `/setmodel provider:model-name`.",
    "Friendly examples: `gptoss120b`, `llama33`, `deepseekr1`, `gemma4`, `qwencoder`, `qwq32b`, `qwen235b`, `gemini`, `grok41fast`.",
    "You can even type the display name, for example `/setmodel Qwen Plus Latest`.",
    "Image-only marketplace models are hidden here because Hiro's runtime expects chat/text models.",
  ];

  for (const section of sections) {
    const entries = MODEL_ENTRIES.filter((entry) => entry.section === section);
    if (entries.length === 0) continue;

    lines.push("");
    lines.push(`[${section}]`);

    for (const entry of entries) {
      const activeMarker = entry.id === activeModelId ? " [active]" : "";
      lines.push(`- \`${entry.alias}\` -> ${entry.label}${activeMarker}`);
      lines.push(`  exact: \`${entry.id}\``);
      lines.push(`  note: ${entry.note}`);
    }
  }

  lines.push("");
  lines.push("Examples: `/setmodel gptoss120b`, `/setmodel llama33`, `/setmodel deepseekr1`, `/setmodel gemma4`, `/setmodel qwencoder`, `/setmodel qwq32b`, `/setmodel gemini`, `/setmodel grok41fast`");

  return lines.join("\n");
}
