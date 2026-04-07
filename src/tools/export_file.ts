import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { ToolExecutionContext } from "../core/types";

type ExportFormat = "markdown" | "text" | "html" | "json" | "csv" | "doc";

const DATA_ROOT = path.resolve(process.cwd(), "data");

const FORMAT_META: Record<ExportFormat, { extension: string; mediaType: string }> = {
  markdown: { extension: ".md", mediaType: "text/markdown" },
  text: { extension: ".txt", mediaType: "text/plain" },
  html: { extension: ".html", mediaType: "text/html" },
  json: { extension: ".json", mediaType: "application/json" },
  csv: { extension: ".csv", mediaType: "text/csv" },
  doc: { extension: ".doc", mediaType: "application/msword" },
};

function sanitizePathSegment(segment: string) {
  const cleaned = segment
    .replace(/[<>:"|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return cleaned.length > 0 ? cleaned : "file";
}

function normalizeRelativeExportPath(rawFileName: string) {
  const normalized = rawFileName
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:/, "")
    .replace(/^\/+/, "")
    .trim();

  const segments = normalized
    .split("/")
    .filter(Boolean)
    .map(sanitizePathSegment);

  return segments.length > 0 ? segments.join("/") : "file";
}

function detectFormatFromExtension(fileName: string): ExportFormat | null {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".md":
      return "markdown";
    case ".txt":
      return "text";
    case ".html":
    case ".htm":
      return "html";
    case ".json":
      return "json";
    case ".csv":
      return "csv";
    case ".doc":
    case ".rtf":
      return "doc";
    default:
      return null;
  }
}

function resolveExportFormat(rawFormat: unknown, fileName: string): ExportFormat {
  const requested = String(rawFormat || "").trim().toLowerCase();
  if (requested === "md" || requested === "markdown") return "markdown";
  if (requested === "txt" || requested === "text") return "text";
  if (requested === "html" || requested === "htm") return "html";
  if (requested === "json") return "json";
  if (requested === "csv") return "csv";
  if (requested === "doc" || requested === "word" || requested === "rtf") return "doc";

  return detectFormatFromExtension(fileName) ?? "text";
}

function ensureExpectedExtension(fileName: string, format: ExportFormat) {
  const expected = FORMAT_META[format].extension;
  const current = path.extname(fileName).toLowerCase();

  if (current === expected) {
    return fileName;
  }

  if (current.length === 0) {
    return `${fileName}${expected}`;
  }

  return `${fileName}${expected}`;
}

function resolveExportTarget(rawFileName: string, format: ExportFormat) {
  const relativePath = ensureExpectedExtension(normalizeRelativeExportPath(rawFileName), format);
  const absolutePath = path.resolve(DATA_ROOT, relativePath);

  if (!absolutePath.startsWith(DATA_ROOT)) {
    throw new Error(`Path access denied: ${rawFileName}`);
  }

  return {
    relativePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, "/"),
    absolutePath,
    fileName: path.basename(absolutePath),
  };
}

function resolveExistingWorkspaceFile(rawFilePath: string) {
  const normalized = rawFilePath.replace(/\\/g, "/").trim();
  const candidates = [
    path.resolve(DATA_ROOT, normalized.replace(/^\/+/, "")),
    path.resolve(process.cwd(), normalized),
  ];

  for (const candidate of candidates) {
    const repoRoot = path.resolve(process.cwd());
    if (!candidate.startsWith(repoRoot)) {
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function parseOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function shouldAutoSendExport(context: ToolExecutionContext) {
  if (context.sessionType !== "primary") {
    return false;
  }

  const prompt = String(context.request.userText || "").toLowerCase();
  if (!prompt) {
    return true;
  }

  const optOutPatterns = [
    /\b(?:do not|don't)\s+(?:send|attach|upload|share)\b/,
    /\b(?:no need|dont need|do not need)\s+to\s+(?:send|attach|upload|share)\b/,
    /\b(?:just|only)\s+(?:save|store|create|write)\b/,
    /\bsave\s+(?:it|this|the file|the document)\s+(?:locally|only)\b/,
    /\bkeep\s+(?:it|this|the file|the document)\s+(?:local|locally)\b/,
    /\bwithout\s+(?:sending|attaching|uploading|sharing)\b/,
  ];

  return !optOutPatterns.some((pattern) => pattern.test(prompt));
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRtf(text: string) {
  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    const char = text[index];

    if (char === "\\") {
      output += "\\\\";
      continue;
    }
    if (char === "{") {
      output += "\\{";
      continue;
    }
    if (char === "}") {
      output += "\\}";
      continue;
    }
    if (char === "\t") {
      output += "\\tab ";
      continue;
    }
    if (char === "\n" || char === "\r") {
      continue;
    }
    if (codeUnit > 127) {
      const signedCode = codeUnit > 32767 ? codeUnit - 65536 : codeUnit;
      output += `\\u${signedCode}?`;
      continue;
    }

    output += char;
  }

  return output;
}

function renderInlineRtf(text: string) {
  const pattern = /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+`|\*[^*\n]+\*)/g;
  let output = "";
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    output += escapeRtf(text.slice(lastIndex, start));

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      output += `{\\b ${escapeRtf(token.slice(2, -2))}}`;
    } else if (token.startsWith("`") && token.endsWith("`")) {
      output += `{\\f1 ${escapeRtf(token.slice(1, -1))}}`;
    } else if (token.startsWith("*") && token.endsWith("*")) {
      output += `{\\i ${escapeRtf(token.slice(1, -1))}}`;
    } else {
      output += escapeRtf(token);
    }

    lastIndex = start + token.length;
  }

  output += escapeRtf(text.slice(lastIndex));
  return output;
}

function isLikelySectionHeading(line: string, nextNonEmptyLine: string | null) {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (/^#{1,6}\s+/.test(trimmed)) {
    return true;
  }

  if (/^\d+(?:\.\d+)*\.?\s+[A-Z]/.test(trimmed) && trimmed.length <= 120) {
    return nextNonEmptyLine === null || /^[-*]\s+/.test(nextNonEmptyLine) || /^#{1,6}\s+/.test(nextNonEmptyLine);
  }

  return false;
}

function renderHeadingParagraph(text: string, level = 1) {
  const size = level <= 1 ? 32 : level === 2 ? 28 : 24;
  return `\\pard\\sa220\\sb120\\sl300\\slmult1\\b\\fs${size} ${renderInlineRtf(text.trim())}\\b0\\fs22\\par`;
}

function renderBulletParagraph(text: string) {
  return `\\pard\\sa140\\sl276\\slmult1\\tx720\\li720\\fi-360 \\u8226?\\tab ${renderInlineRtf(text.trim())}\\par`;
}

function renderParagraph(text: string) {
  return `\\pard\\sa180\\sl276\\slmult1 ${renderInlineRtf(text.trim())}\\par`;
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isMarkdownTableRow(line: string) {
  if (!line.includes("|")) {
    return false;
  }

  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2;
}

function isMarkdownTableDivider(line: string) {
  if (!line.includes("|")) {
    return false;
  }

  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function collectMarkdownTable(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex]?.trim() ?? "";
  const dividerLine = lines[startIndex + 1]?.trim() ?? "";
  if (!isMarkdownTableRow(headerLine) || !isMarkdownTableDivider(dividerLine)) {
    return null;
  }

  const rows = [splitMarkdownTableRow(headerLine)];
  let index = startIndex + 2;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (line.length === 0) {
      break;
    }
    if (!isMarkdownTableRow(line) || isMarkdownTableDivider(line)) {
      break;
    }
    rows.push(splitMarkdownTableRow(line));
    index += 1;
  }

  return {
    rows,
    endIndex: index - 1,
  };
}

function renderRtfTable(rows: string[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length), 2);
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
  const totalWidth = 9300;
  const baseCellWidth = Math.floor(totalWidth / columnCount);
  const remainder = totalWidth - (baseCellWidth * columnCount);
  const cellEdges: number[] = [];
  let currentEdge = 0;

  for (let index = 0; index < columnCount; index += 1) {
    currentEdge += baseCellWidth + (index === columnCount - 1 ? remainder : 0);
    cellEdges.push(currentEdge);
  }

  const rendered: string[] = [];
  const border = "\\clbrdrt\\brdrs\\brdrw12\\clbrdrl\\brdrs\\brdrw12\\clbrdrb\\brdrs\\brdrw12\\clbrdrr\\brdrs\\brdrw12";

  normalizedRows.forEach((row, rowIndex) => {
    rendered.push("\\trowd\\trgaph108\\trleft0");
    for (const edge of cellEdges) {
      rendered.push(`${border}\\cellx${edge}`);
    }

    for (const cell of row) {
      const prefix = rowIndex === 0 ? "\\pard\\intbl\\sa100\\sb100\\sl240\\slmult1\\b " : "\\pard\\intbl\\sa100\\sb100\\sl240\\slmult1 ";
      const suffix = rowIndex === 0 ? "\\b0\\cell" : "\\cell";
      rendered.push(`${prefix}${renderInlineRtf(cell)}${suffix}`);
    }

    rendered.push("\\row");
  });

  rendered.push("\\pard");
  return rendered;
}

function renderHtmlDocument(content: string, title: string) {
  if (/<html[\s>]/i.test(content) || /<!doctype html>/i.test(content)) {
    return content;
  }

  if (/<[a-z][\s\S]*>/i.test(content)) {
    return [
      "<!doctype html>",
      "<html>",
      "<head>",
      '  <meta charset="utf-8" />',
      `  <title>${escapeHtml(title)}</title>`,
      "</head>",
      "<body>",
      content,
      "</body>",
      "</html>",
    ].join("\n");
  }

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8" />',
    `  <title>${escapeHtml(title)}</title>`,
    "  <style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5;padding:32px;white-space:pre-wrap;}</style>",
    "</head>",
    "<body>",
    escapeHtml(content),
    "</body>",
    "</html>",
  ].join("\n");
}

export function renderWordCompatibleDocument(content: string, title: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const body: string[] = [
    "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Calibri;}{\\f1 Consolas;}}",
    "\\viewkind4\\uc1\\f0\\fs22",
  ];

  if (title.trim().length > 0) {
    body.push(renderHeadingParagraph(title.trim(), 1));
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      body.push("\\par");
      continue;
    }

    const table = collectMarkdownTable(lines, index);
    if (table) {
      body.push(...renderRtfTable(table.rows));
      index = table.endIndex;
      continue;
    }

    const nextNonEmptyLine = lines.slice(index + 1).find((candidate) => candidate.trim().length > 0)?.trim() ?? null;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      body.push(renderHeadingParagraph(heading[1], heading[0].match(/^#+/)?.[0].length ?? 2));
      continue;
    }

    if (isLikelySectionHeading(line, nextNonEmptyLine)) {
      const normalizedHeading = line.replace(/^\d+(?:\.\d+)*\.?\s+/, (prefix) => prefix.trimEnd() + " ");
      body.push(renderHeadingParagraph(normalizedHeading, 2));
      continue;
    }

    const bullet = line.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      body.push(renderBulletParagraph(bullet[2]));
      continue;
    }

    body.push(renderParagraph(line));
  }

  body.push("}");
  return body.join("\n");
}

export function renderExportedContent(format: ExportFormat, content: string, fileName: string) {
  switch (format) {
    case "html":
      return renderHtmlDocument(content, fileName);
    case "json":
      try {
        return JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        return content;
      }
    case "doc":
      return renderWordCompatibleDocument(content, fileName);
    case "markdown":
    case "text":
    case "csv":
    default:
      return content;
  }
}

function queueFileDirective(
  context: ToolExecutionContext,
  absolutePath: string,
  fileName: string,
  mediaType: string,
  caption: string | null,
) {
  context.directives.push({
    type: "file",
    filePath: absolutePath,
    filename: fileName,
    mediaType,
    caption: caption ?? undefined,
  });
}

export const exportFileDeclaration = {
  name: "export_file",
  description:
    "Create a user-facing file in the workspace data directory. Use this when the user asks you to create, save, export, draft, or generate a file they can download or receive as an attachment. Supports markdown, text, HTML, CSV, JSON, and Word-compatible DOC files.",
  parameters: {
    type: "object",
    properties: {
      fileName: {
        type: "string",
        description: "The file name to create, such as 'report.md', 'notes.txt', 'table.csv', or 'brief.doc'.",
      },
      content: {
        type: "string",
        description: "The full file content to save.",
      },
      format: {
        type: "string",
        enum: ["markdown", "text", "html", "json", "csv", "doc"],
        description: "Optional output format. If omitted, Hiro infers it from the file extension and defaults to text.",
      },
      sendToUser: {
        type: "boolean",
        description: "Optional. In normal chat Hiro sends created files back to the user by default unless the user asked to save only. Set this explicitly to true or false to override that behavior.",
      },
      caption: {
        type: "string",
        description: "Optional short caption to include when sending the file back to the user.",
      },
    },
    required: ["fileName", "content"],
  },
};

export async function exportFileExecutor(args: Record<string, unknown>, context: ToolExecutionContext) {
  const rawFileName = String(args.fileName || args.filename || "").trim();
  const content = String(args.content ?? "");

  if (!rawFileName) {
    return "Error: Missing fileName.";
  }

  const format = resolveExportFormat(args.format, rawFileName);
  const target = resolveExportTarget(rawFileName, format);
  const renderedContent = renderExportedContent(format, content, target.fileName);

  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await fs.writeFile(target.absolutePath, renderedContent, "utf-8");

  const explicitSendPreference = parseOptionalBoolean(args.sendToUser);
  const sendToUser = explicitSendPreference ?? shouldAutoSendExport(context);
  const caption = String(args.caption || "").trim() || null;
  if (sendToUser) {
    queueFileDirective(context, target.absolutePath, target.fileName, FORMAT_META[format].mediaType, caption);
  }

  return sendToUser
    ? `Created ${target.relativePath} and queued it for delivery to the user.`
    : `Created ${target.relativePath}.`;
}

export const sendFileToUserDeclaration = {
  name: "send_file_to_user",
  description:
    "Send an existing workspace file back to the user as an attachment in the current Telegram or WhatsApp chat.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The relative path of the file to send. For generated files, this is typically under the data directory.",
      },
      caption: {
        type: "string",
        description: "Optional short caption to include with the file.",
      },
    },
    required: ["filePath"],
  },
};

export async function sendFileToUserExecutor(args: Record<string, unknown>, context: ToolExecutionContext) {
  const rawFilePath = String(args.filePath || args.path || "").trim();
  if (!rawFilePath) {
    return "Error: Missing filePath.";
  }

  const absolutePath = resolveExistingWorkspaceFile(rawFilePath);
  const repoRoot = path.resolve(process.cwd());
  if (!absolutePath.startsWith(repoRoot)) {
    return `Error: Path access denied for ${rawFilePath}.`;
  }
  if (!existsSync(absolutePath)) {
    return `Error: File not found at ${rawFilePath}.`;
  }

  const fileName = path.basename(absolutePath);
  const format = detectFormatFromExtension(fileName) ?? "text";
  const mediaType = FORMAT_META[format].mediaType;
  const caption = String(args.caption || "").trim() || null;

  queueFileDirective(context, absolutePath, fileName, mediaType, caption);
  return `Queued ${rawFilePath} for delivery to the user.`;
}
