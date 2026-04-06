import { getAppContext } from "../core/appContext";
import type { DocumentSearchResult } from "../memory/sqlite";

export const searchDocumentsDeclaration = {
  name: "search_documents",
  description:
    "Search text extracted from previously ingested PDF, DOCX, and text attachments. " +
    "Use this when the user refers to an uploaded file, report, contract, CV, note, attachment, or PDF.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Keywords, phrases, or filename fragments to find in stored documents.",
      },
      limit: {
        type: "integer",
        description: "Optional maximum number of matching documents to return. Defaults to 5, max 8.",
      },
      scope: {
        type: "string",
        enum: ["current", "all"],
        description: "Search only the current session's documents or all stored documents. Defaults to current.",
      },
    },
    required: ["query"],
  },
};

function formatDocumentSearchResults(results: DocumentSearchResult[]) {
  return results
    .map((result, index) => [
      `${index + 1}. File: ${result.filename} (document #${result.document_id})`,
      `Session: ${result.session_title} (${result.session_id})`,
      `Type: ${result.media_type ?? "unknown"} | Stored: ${result.created_at}`,
      `Match: ${result.snippet}`,
    ].join("\n"))
    .join("\n\n");
}

export async function searchDocumentsExecutor(
  args: Record<string, unknown>,
  sessionId: string,
) {
  const query = String(args.query || "").trim();
  if (!query) {
    return "Error: No search query provided.";
  }

  const parsedLimit = typeof args.limit === "number" ? args.limit : Number(args.limit);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(8, Math.trunc(parsedLimit))) : 5;
  const scope = String(args.scope || "current").toLowerCase() === "all" ? "all" : "current";
  const results = getAppContext().memory.searchDocuments(query, limit, scope === "current" ? sessionId : undefined);

  if (results.length === 0) {
    return "Search completed. No matching stored documents were found for that query.";
  }

  return `DOCUMENT MATCHES:\n${formatDocumentSearchResults(results)}`;
}
