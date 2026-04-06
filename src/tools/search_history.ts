import { getAppContext } from "../core/appContext";
import type { TranscriptSearchResult } from "../memory/sqlite";

export const searchHistoryDeclaration = {
  name: "search_history",
  description:
    "Search the raw stored conversation transcript across all sessions. " +
    "Use this when the user asks what was said before, mentions an older discussion, or needs exact past details such as commands, filenames, errors, or decisions. " +
    "This searches local SQLite history and is better than semantic memory for exact recall.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Keywords or phrases to find in prior stored conversations.",
      },
      limit: {
        type: "integer",
        description: "Optional maximum number of matching transcript excerpts to return. Defaults to 5, max 8.",
      },
    },
    required: ["query"],
  },
};

function formatContextLine(label: string, entry: TranscriptSearchResult["before"] | TranscriptSearchResult["after"]) {
  if (!entry || !entry.content.trim()) {
    return null;
  }

  const compactContent = entry.content.replace(/\s+/g, " ").trim().slice(0, 240);
  return `${label} ${entry.role.toUpperCase()}: ${compactContent}`;
}

export function formatHistorySearchResults(results: TranscriptSearchResult[]) {
  return results
    .map((result, index) => {
      const lines = [
        `${index + 1}. Session: ${result.session_title} (${result.session_id})`,
        `Type: ${result.session_type} | Timestamp: ${result.timestamp}`,
        `Match: ${result.role.toUpperCase()}: ${result.snippet}`,
      ];

      const beforeLine = formatContextLine("Before:", result.before);
      const afterLine = formatContextLine("After:", result.after);
      if (beforeLine) {
        lines.push(beforeLine);
      }
      if (afterLine) {
        lines.push(afterLine);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

export async function searchHistoryExecutor(args: Record<string, unknown>) {
  const query = String(args.query || "").trim();
  if (!query) {
    return "Error: No search query provided.";
  }

  const parsedLimit = typeof args.limit === "number" ? args.limit : Number(args.limit);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(8, Math.trunc(parsedLimit))) : 5;
  const results = getAppContext().memory.searchConversationHistory(query, limit);

  if (results.length === 0) {
    return "Search completed. No matching transcript history was found for that query.";
  }

  return `TRANSCRIPT HISTORY MATCHES:\n${formatHistorySearchResults(results)}`;
}
