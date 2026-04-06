export function formatForWhatsApp(text: string): string {
  // WhatsApp formatting:
  // *bold*
  // _italic_
  // ~strikethrough~
  // ```code``` (monospaced)
  
  if (!text) return text;
  
  let formatted = text;
  
  // 1. Convert headers (# Header) to bold
  formatted = formatted.replace(/^#+\s+(.+)$/gm, '*$1*');
  
  // 2. Convert markdown bold (**text**) to whatsapp bold (*text*)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // 3. Convert markdown italic (*text*) to whatsapp italic (_text_)
  // Be careful not to match the newly created *bold*
  // A simple way is to temporarily hide *bold*, do italic, then restore
  // But wait, whatsapp also supports _italic_. Markdown uses * or _.
  // Let's handle __text__ as italic (or bold in some MD, but usually bold is **)
  formatted = formatted.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '_$1_');
  
  // 4. Convert markdown links [text](url) to text: url
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');
  
  // 5. Code blocks (```...```) are supported by WhatsApp natively, keep them.
  // 6. Inline code (`code`) is also supported, keep it or let it fallback to plain. WhatsApp supports `code`.
  
  // 7. Strikethrough (~~text~~) to WhatsApp (~text~)
  formatted = formatted.replace(/~~(.*?)~~/g, '~$1~');
  
  // 8. Remove any lingering HTML tags that might have snuck in
  formatted = formatted.replace(/<\/?[^>]+(>|$)/g, "");

  return formatted;
}
