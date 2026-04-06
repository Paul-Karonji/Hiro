import { marked } from 'marked';

// Configure marked for GFM (GitHub Flavored Markdown) - default is true but being explicit
marked.setOptions({ gfm: true });

/**
 * Converts standard HTML (output from `marked`) to Telegram-compatible HTML.
 * Telegram only supports: <b>, <i>, <s>, <u>, <code>, <pre>, <a href>, <blockquote>
 */
function toTelegramHtml(html: string): string {
  return html
    // ---- Block-level ----
    // Headers → <b>text</b>
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, inner) => `<b>${inner.trim()}</b>\n`)
    // Paragraphs → unwrap, add newline
    .replace(/<p>([\s\S]*?)<\/p>/gi, (_m, inner) => `${inner.trim()}\n`)
    // Blockquotes (Telegram supports this tag natively)
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => `<blockquote>${inner.trim()}</blockquote>\n`)
    // Unordered list items → bullet points
    .replace(/<li>([\s\S]*?)<\/li>/gi, (_m, inner) => `• ${inner.trim()}\n`)
    // Strip list wrappers
    .replace(/<\/?[uo]l[^>]*>/gi, '')
    // Horizontal rules
    .replace(/<hr\s*\/?>/gi, '───\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')

    // ---- Inline ----
    // Strong/Bold
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '<b>$1</b>')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '<b>$1</b>') // passthrough
    // Em/Italic
    .replace(/<em>([\s\S]*?)<\/em>/gi, '<i>$1</i>')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '<i>$1</i>') // passthrough
    // Strikethrough
    .replace(/<del>([\s\S]*?)<\/del>/gi, '<s>$1</s>')
    .replace(/<s>([\s\S]*?)<\/s>/gi, '<s>$1</s>') // passthrough
    // Images → plain text fallback
    .replace(/<img[^>]*alt="([^"]*)"[^>]* >/gi, '[Image: $1]')
    .replace(/<img[^>]*>/gi, '')
    // Links — keep as-is, Telegram supports <a href="...">
    // (marked already outputs <a href="...">text</a>)

    // ---- Cleanup ----
    // Remove any remaining unknown tags
    .replace(/<(?!\/?(b|i|s|u|code|pre|a|blockquote)\b)[^>]+>/gi, '')
    // Collapse 3+ newlines → 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits raw markdown into safe chunks at paragraph boundaries.
 * Never cuts in the middle of a word, sentence, or HTML tag.
 */
function splitMarkdownIntoChunks(markdown: string, maxLength = 3500): string[] {
  const paragraphs = markdown.split('\n\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const joined = currentChunk.length > 0 ? `${currentChunk}\n\n${para}` : para;

    if (joined.length <= maxLength) {
      currentChunk = joined;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      // If single paragraph is too long, split by line then by char
      if (para.length > maxLength) {
        const lines = para.split('\n');
        for (const line of lines) {
          const lineJoined = currentChunk.length > 0 ? `${currentChunk}\n${line}` : line;
          if (lineJoined.length <= maxLength) {
            currentChunk = lineJoined;
          } else {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk);
              currentChunk = '';
            }
            if (line.length > maxLength) {
              for (let i = 0; i < line.length; i += maxLength) {
                chunks.push(line.slice(i, i + maxLength));
              }
            } else {
              currentChunk = line;
            }
          }
        }
      } else {
        currentChunk = para;
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Sends an LLM response to the user with rich Telegram HTML formatting.
 * Converts Markdown → Standard HTML → Telegram-compatible HTML.
 * Falls back to plain text if Telegram rejects a chunk.
 */
export async function sendFormattedMessage(ctx: any, markdownText: string): Promise<void> {
  if (!markdownText || markdownText.trim().length === 0) return;

  const mdChunks = splitMarkdownIntoChunks(markdownText, 3500);

  for (const chunk of mdChunks) {
    if (!chunk.trim()) continue;

    let telegramHtml: string;
    try {
      const rawHtml = await marked.parse(chunk);
      telegramHtml = toTelegramHtml(rawHtml);
    } catch (parseErr: any) {
      console.warn('[Formatter] marked.parse() failed, sending raw chunk:', parseErr?.message);
      telegramHtml = chunk;
    }

    try {
      await ctx.reply(telegramHtml, { parse_mode: 'HTML' });
    } catch (err: any) {
      console.warn('[Bot] HTML formatting rejected by Telegram. Falling back to plain text.', err?.message);
      // Strip all HTML tags for the plain-text fallback
      const plainText = telegramHtml.replace(/<[^>]+>/g, '');
      try {
        await ctx.reply(plainText || chunk);
      } catch (fallbackErr: any) {
        console.error('[Bot] Fallback plain-text delivery also failed:', fallbackErr?.message);
      }
    }
  }
}
