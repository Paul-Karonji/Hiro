import path from "path";
import type { AgentBinaryInput } from "../core/types";

const PDF_MEDIA_TYPES = new Set(["application/pdf"]);
const DOCX_MEDIA_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TEXT_MEDIA_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-yaml",
]);
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xml",
  ".html",
  ".htm",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".sh",
  ".css",
  ".scss",
  ".sql",
  ".yaml",
  ".yml",
  ".log",
]);

export type ExtractedDocumentKind = "pdf" | "docx" | "text";

export interface ExtractedDocumentText {
  kind: ExtractedDocumentKind;
  filename: string | null;
  mediaType: string | null;
  text: string;
}

function normalizeMediaType(mediaType: string | null | undefined) {
  return mediaType?.split(";")[0]?.trim().toLowerCase() || null;
}

function getExtension(filename: string | null | undefined) {
  if (!filename) {
    return "";
  }

  return path.extname(filename).toLowerCase();
}

function asBuffer(data: AgentBinaryInput) {
  if (typeof data === "string") {
    return Buffer.from(data, "utf-8");
  }

  return Buffer.from(data);
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeUtf8Text(buffer: Buffer) {
  if (buffer.length === 0) {
    return true;
  }

  let printable = 0;
  let control = 0;
  for (const byte of buffer.subarray(0, Math.min(buffer.length, 4096))) {
    if (byte === 0) {
      return false;
    }

    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128) {
      printable += 1;
    } else {
      control += 1;
    }
  }

  return printable >= control * 4;
}

export function buildDocumentExcerpt(text: string, maxChars = 6000) {
  const normalized = normalizeExtractedText(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}...`;
}

export async function extractDocumentText(input: {
  data: AgentBinaryInput;
  filename?: string | null;
  mediaType?: string | null;
}): Promise<ExtractedDocumentText> {
  const buffer = asBuffer(input.data);
  const filename = input.filename?.trim() || null;
  const mediaType = normalizeMediaType(input.mediaType);
  const extension = getExtension(filename);
  const isDeclaredTextType = Boolean(mediaType && (TEXT_MEDIA_TYPES.has(mediaType) || mediaType.startsWith("text/")));
  const isDeclaredBinaryType = Boolean(
    mediaType
    && !isDeclaredTextType
    && !PDF_MEDIA_TYPES.has(mediaType)
    && !DOCX_MEDIA_TYPES.has(mediaType)
    && mediaType !== "application/octet-stream",
  );

  if (PDF_MEDIA_TYPES.has(mediaType ?? "") || extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      const text = normalizeExtractedText(result.text || "");
      if (!text) {
        throw new Error("The PDF was read but no text could be extracted.");
      }

      return { kind: "pdf", filename, mediaType: mediaType ?? "application/pdf", text };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (
    DOCX_MEDIA_TYPES.has(mediaType ?? "")
    || extension === ".docx"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeExtractedText(result.value || "");
    if (!text) {
      throw new Error("The Word document was read but no text could be extracted.");
    }

    return {
      kind: "docx",
      filename,
      mediaType: mediaType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      text,
    };
  }

  if (
    isDeclaredTextType
    || TEXT_EXTENSIONS.has(extension)
    || (!isDeclaredBinaryType && looksLikeUtf8Text(buffer))
  ) {
    const text = normalizeExtractedText(buffer.toString("utf-8"));
    if (!text) {
      throw new Error("The file is empty after text extraction.");
    }

    return {
      kind: "text",
      filename,
      mediaType: mediaType ?? "text/plain",
      text,
    };
  }

  throw new Error(
    `Unsupported document type${filename ? ` for ${filename}` : ""}. Supported formats are PDF, DOCX, and text files.`,
  );
}
