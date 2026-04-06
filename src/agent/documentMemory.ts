import type { DocumentRecord } from "../memory/sqlite";
import { buildDocumentExcerpt } from "../documents/extract";

export type TurnDocumentContext = {
  id: number;
  filename: string;
  mediaType: string | null;
  content: string;
};

export function buildDocumentPromptSection(documents: TurnDocumentContext[], maxCharsPerDocument = 12000) {
  if (documents.length === 0) {
    return "";
  }

  const rendered = documents.map((document, index) => [
    `[Document ${index + 1}]`,
    `Filename: ${document.filename}`,
    `Stored document id: ${document.id}`,
    `Media type: ${document.mediaType ?? "unknown"}`,
    "Full extracted text has been stored locally. If you need more than the excerpt below, use the search_documents tool.",
    "Content excerpt:",
    buildDocumentExcerpt(document.content, maxCharsPerDocument),
  ].join("\n"));

  return `ATTACHED DOCUMENTS:\n${rendered.join("\n\n")}`;
}

export function appendDocumentPrompt(userText: string, documents: TurnDocumentContext[]) {
  const section = buildDocumentPromptSection(documents);
  if (!section) {
    return userText;
  }

  return `${userText}\n\n${section}`;
}

export function formatRecentDocumentsForSystemPrompt(documents: DocumentRecord[], limit = 5) {
  if (documents.length === 0) {
    return null;
  }

  return documents
    .slice(0, limit)
    .map((document, index) => {
      const excerpt = buildDocumentExcerpt(document.content, 240);
      return `${index + 1}. ${document.filename} (#${document.id}, ${document.created_at})\n${excerpt}`;
    })
    .join("\n\n");
}

export function buildDocumentAttachmentMarker(userText: string, documents: TurnDocumentContext[]) {
  if (documents.length === 0) {
    return userText;
  }

  const filenames = documents.map((document) => document.filename).join(", ");
  const marker = `[Documents attached: ${filenames}]`;
  return userText.trim().length > 0 ? `${marker} ${userText}` : marker;
}
