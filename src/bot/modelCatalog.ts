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
    id: "alibaba:qwen3.6-plus",
    alias: "qwen",
    label: "Qwen 3.6 Plus (Alibaba)",
    note: "main model on Alibaba Model Studio",
    section: "Recommended",
    aliases: ["default", "qwenmain", "qwenplus", "alibabaqwen"],
  },
  {
    id: "openrouter:qwen/qwen3.6-plus:free",
    alias: "qwenor",
    label: "Qwen 3.6 Plus Free (OpenRouter)",
    note: "free OpenRouter fallback",
    section: "OpenRouter",
    aliases: ["qwenfree", "orqwen", "qwenrouter"],
  },
  {
    id: "alibaba:qwen3.5-plus",
    alias: "qwen35",
    label: "Qwen 3.5 Plus (Alibaba)",
    note: "Qwen 3.5 on Alibaba Model Studio",
    section: "Recommended",
    aliases: ["q35", "qwen35ali", "alibabaqwen35"],
  },
  {
    id: "openrouter:qwen/qwen3.5-plus-02-15",
    alias: "qwen35or",
    label: "Qwen 3.5 Plus (OpenRouter)",
    note: "OpenRouter Qwen 3.5 route",
    section: "OpenRouter",
    aliases: ["qwen35router", "orqwen35"],
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
    note: "full Grok 3 via Resurge",
    section: "ResurgeAI",
    aliases: ["rgrok3"],
  },
  {
    id: "resurge:grok-3-thinking",
    alias: "grok3think",
    label: "Grok 3 Thinking",
    note: "slower reasoning-heavy Grok",
    section: "ResurgeAI",
    aliases: ["grokthink", "rgrokthink"],
  },
  {
    id: "resurge:grok-4",
    alias: "grok4",
    label: "Grok 4",
    note: "general Grok 4",
    section: "ResurgeAI",
    aliases: ["rgrok4"],
  },
  {
    id: "resurge:grok-4-heavy",
    alias: "grok4heavy",
    label: "Grok 4 Heavy",
    note: "heavier Grok 4 mode",
    section: "ResurgeAI",
    aliases: ["g4heavy"],
  },
  {
    id: "resurge:grok-4-thinking",
    alias: "grok4think",
    label: "Grok 4 Thinking",
    note: "reasoning-focused Grok 4",
    section: "ResurgeAI",
    aliases: ["g4think"],
  },
  {
    id: "resurge:grok-4.1-fast",
    alias: "grok41fast",
    label: "Grok 4.1 Fast",
    note: "faster 4.1 variant",
    section: "ResurgeAI",
    aliases: ["g41fast"],
  },
  {
    id: "resurge:grok-4.1-mini",
    alias: "grok41mini",
    label: "Grok 4.1 Mini",
    note: "small 4.1 variant",
    section: "ResurgeAI",
    aliases: ["g41mini"],
  },
  {
    id: "resurge:grok-4.1-thinking",
    alias: "grok41think",
    label: "Grok 4.1 Thinking",
    note: "reasoning-focused 4.1",
    section: "ResurgeAI",
    aliases: ["g41think"],
  },
  {
    id: "resurge:grok-4.1-expert",
    alias: "grok41expert",
    label: "Grok 4.1 Expert",
    note: "premium 4.1 variant",
    section: "ResurgeAI",
    aliases: ["g41expert"],
  },
  {
    id: "resurge:grok-4.20-beta",
    alias: "grok420",
    label: "Grok 4.20 Beta",
    note: "beta model, may change",
    section: "ResurgeAI",
    aliases: ["g420"],
  },
  {
    id: "resurge:deepseek-ai/deepseek-v3.2",
    alias: "deepseek32",
    label: "DeepSeek V3.2",
    note: "newer DeepSeek variant",
    section: "ResurgeAI",
    aliases: ["dsv32"],
  },
  {
    id: "resurge:z-ai/glm4.7",
    alias: "glm47",
    label: "GLM 4.7",
    note: "listed on Resurge, may be intermittent",
    section: "ResurgeAI",
    aliases: ["glm", "zai"],
  },
  {
    id: "openrouter:openai/gpt-oss-120b",
    alias: "gptoss120b",
    label: "GPT-OSS 120B",
    note: "large open model on OpenRouter",
    section: "OpenRouter",
    aliases: ["oss120b"],
  },
  {
    id: "openrouter:openai/gpt-oss-20b",
    alias: "gptoss20b",
    label: "GPT-OSS 20B",
    note: "lighter OSS model",
    section: "OpenRouter",
    aliases: ["oss20b"],
  },
  {
    id: "openrouter:z-ai/glm-4.5-air",
    alias: "glm45air",
    label: "GLM 4.5 Air",
    note: "lighter GLM via OpenRouter",
    section: "OpenRouter",
    aliases: ["glm45"],
  },
  {
    id: "openrouter:nousresearch/hermes-3-llama-3.1-405b",
    alias: "hermes405b",
    label: "Hermes 3 405B",
    note: "large open model",
    section: "OpenRouter",
    aliases: ["hermes"],
  },
  {
    id: "openrouter:google/gemma-3-27b",
    alias: "gemma27b",
    label: "Gemma 3 27B",
    note: "compact Google open model",
    section: "OpenRouter",
    aliases: ["gemma"],
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct:free",
    alias: "llama33",
    label: "Llama 3.3 70B",
    note: "free Meta option",
    section: "OpenRouter",
    aliases: ["llama70bfree"],
  },
  {
    id: "openrouter:meta-llama/llama-3.2-3b-instruct:free",
    alias: "llama32",
    label: "Llama 3.2 3B",
    note: "tiny free Meta option",
    section: "OpenRouter",
    aliases: ["llama3b"],
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3-0324",
    alias: "or-deepseek",
    label: "DeepSeek Chat V3",
    note: "OpenRouter DeepSeek path",
    section: "OpenRouter",
    aliases: ["ordeepseek", "deepseekchat"],
  },
  {
    id: "openrouter:deepseek/deepseek-r1:free",
    alias: "deepseekr1",
    label: "DeepSeek R1 Free",
    note: "free reasoning model",
    section: "OpenRouter",
    aliases: ["r1"],
  },
  {
    id: "openrouter:anthropic/claude-3.5-sonnet-20241022",
    alias: "claude",
    label: "Claude 3.5 Sonnet",
    note: "paid Anthropic option",
    section: "OpenRouter",
    aliases: ["sonnet"],
  },
  {
    id: "openrouter:openai/gpt-4o",
    alias: "gpt4o",
    label: "GPT-4o",
    note: "paid OpenAI option",
    section: "OpenRouter",
    aliases: ["4o"],
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
  const sections = ["Recommended", "Google", "Groq", "Mistral", "ResurgeAI", "OpenRouter"];
  const lines: string[] = [
    "Model Menu",
    `Current: \`${activeModelId}\``,
    "",
    "Use `/setmodel alias` for short names.",
    "You can also pass the full id with `/setmodel provider:model-name`.",
    "Friendly examples: `qwen`, `qwenor`, `gemini`, `grok3mini`, `deepseek31`.",
    "You can even type the display name, for example `/setmodel Qwen 3.6 Plus`.",
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
  lines.push("Examples: `/setmodel qwen`, `/setmodel qwenor`, `/setmodel gemini`, `/setmodel resurge:grok-4.1-fast`");

  return lines.join("\n");
}
