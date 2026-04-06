export const SESSION_IMAGE_MEMORY_KEY = "recentImageMemories";
const DEFAULT_IMAGE_MEMORY_LIMIT = 5;

export interface SessionImageMemory {
  summary: string;
  capturedAt: string;
}

function isSessionImageMemory(value: unknown): value is SessionImageMemory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.summary === "string" && typeof candidate.capturedAt === "string";
}

function compareByCapturedAtDesc(a: SessionImageMemory, b: SessionImageMemory) {
  return Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
}

export function sanitizeImageMemoryText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(i will|i'll|i can help with that)/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildImageMemorySummary(userText: string, modelResponse: string) {
  const cleanedUserText = sanitizeImageMemoryText(userText);
  const cleanedResponse = sanitizeImageMemoryText(modelResponse);

  if (!cleanedResponse) {
    return "";
  }

  const summaryPrefix = /^please analyze this image\.?$/i.test(cleanedUserText) || cleanedUserText.length === 0
    ? "User shared an image."
    : `User shared an image and asked: ${cleanedUserText}.`;

  return `${summaryPrefix} Extracted details: ${cleanedResponse}`.slice(0, 1400);
}

export function readSessionImageMemories(metadata: Record<string, unknown> | null | undefined): SessionImageMemory[] {
  const value = metadata?.[SESSION_IMAGE_MEMORY_KEY];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isSessionImageMemory)
    .map((memory) => ({
      summary: memory.summary.trim(),
      capturedAt: memory.capturedAt,
    }))
    .filter((memory) => memory.summary.length > 0)
    .sort(compareByCapturedAtDesc);
}

export function withStoredImageMemory(
  metadata: Record<string, unknown> | null | undefined,
  memory: SessionImageMemory,
  limit = DEFAULT_IMAGE_MEMORY_LIMIT,
): Record<string, unknown> {
  const baseMetadata = metadata ? { ...metadata } : {};
  const existing = readSessionImageMemories(metadata);
  const merged = [...existing.filter((entry) => entry.summary !== memory.summary), memory]
    .sort(compareByCapturedAtDesc)
    .slice(0, limit);

  return {
    ...baseMetadata,
    [SESSION_IMAGE_MEMORY_KEY]: merged,
  };
}

export function formatImageMemoriesForSystemPrompt(
  metadata: Record<string, unknown> | null | undefined,
  limit = 3,
): string | null {
  const memories = readSessionImageMemories(metadata).slice(0, limit);
  if (memories.length === 0) {
    return null;
  }

  return memories
    .map((memory) => `- ${memory.summary}`)
    .join("\n");
}

export function findRelevantImageMemories(
  metadata: Record<string, unknown> | null | undefined,
  query: string,
  limit = 2,
): SessionImageMemory[] {
  const memories = readSessionImageMemories(metadata);
  if (memories.length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase();
  const mentionsPriorImage = /\b(image|photo|picture|poster|flyer|invite|invitation|attachment|screenshot|event|workshop)\b/.test(normalizedQuery);
  const queryTerms = Array.from(new Set(
    (normalizedQuery.match(/[a-z0-9]{4,}/g) ?? []).filter((term) => ![
      "about",
      "from",
      "have",
      "image",
      "photo",
      "past",
      "picture",
      "please",
      "remember",
      "screenshot",
      "shared",
      "that",
      "this",
      "what",
      "when",
      "where",
    ].includes(term)),
  ));

  const ranked = memories
    .map((memory) => ({
      memory,
      score: queryTerms.reduce((score, term) => score + (memory.summary.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || compareByCapturedAtDesc(left.memory, right.memory));

  const matched = ranked.filter((entry) => entry.score > 0).map((entry) => entry.memory).slice(0, limit);
  if (matched.length > 0) {
    return matched;
  }

  return mentionsPriorImage ? memories.slice(0, limit) : [];
}
