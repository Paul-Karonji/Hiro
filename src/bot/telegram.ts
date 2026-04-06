import { Bot, InputFile, InlineKeyboard } from "grammy";
import { processMessageWithEngine, getActiveModelName, setActiveModel } from "../agent/engine";
import { approvalHandler } from "../agent/approvals";
import { processAudioToText, generateSpeechFromText } from "./audio";
import { TypingIndicator } from "./typingIndicator";
import { handleStatusCommand } from "./commands/status";
import { handleNewCommand } from "./commands/new";
import { handleCompactCommand } from "./commands/compact";
import { handleUsageCommand } from "./commands/usage";
import { config } from "../config";
import { getAppContext } from "../core/appContext";
import type { ChannelService } from "../plugins/types";
import { sendFormattedMessage } from "./formatter";
import { buildModelsCatalogMarkdown, resolveModelSelection } from "./modelCatalog";

function resolveTelegramConversationSession(ctx: any) {
  return getAppContext().sessions.resolveUserSession({
    platform: "telegram",
    userId: String(ctx.from?.id ?? "unknown"),
    chatId: String(ctx.chat?.id ?? ctx.from?.id ?? "unknown"),
    threadId: ctx.message && "message_thread_id" in ctx.message
      ? String((ctx.message as any).message_thread_id)
      : null,
  });
}

export function createTelegramChannelService(): ChannelService {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.ALLOWED_USER_ID) {
      console.warn(`[Security] Blocked unauthorized message from User ID: ${ctx.from?.id}`);
      return;
    }
    await next();
  });

  bot.command("model", async (ctx) => {
    await ctx.reply(
      `🧠 *Active Model:* \`${getActiveModelName()}\`\nUse \`/models\` to browse friendly names, then \`/setmodel alias\` to switch.`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("models", async (ctx) => {
    await ctx.reply(buildModelsCatalogMarkdown(getActiveModelName()), { parse_mode: "Markdown" });
  });

  bot.command("setmodel", async (ctx) => {
    const requestedModel = ctx.match?.trim();
    if (!requestedModel) {
      await ctx.reply("❌ Missing model name. Use `/models` to browse aliases or `/setmodel provider:model-name` for an exact id.", { parse_mode: "Markdown" });
      return;
    }

    try {
      const newModel = resolveModelSelection(requestedModel);
      setActiveModel(newModel);
      await ctx.reply(`✅ Model switched to \`${newModel}\``, { parse_mode: "Markdown" });
    } catch (error: any) {
      await ctx.reply(`❌ ${error?.message || String(error)}`);
    }
  });

  bot.command("status", (ctx) => handleStatusCommand(ctx, { sessionId: resolveTelegramConversationSession(ctx).id }));
  bot.command("new", (ctx) => handleNewCommand(ctx, { sessionId: resolveTelegramConversationSession(ctx).id }));
  bot.command("compact", (ctx) => handleCompactCommand(ctx, { sessionId: resolveTelegramConversationSession(ctx).id }));
  bot.command("usage", (ctx) => handleUsageCommand(ctx));

  bot.command("help", async (ctx) => {
    await ctx.reply([
      "*🤖 Hiro — Available Commands*",
      "",
      "*Conversation*",
      "/new — Start a fresh conversation thread",
      "/compact — Force memory compaction",
      "",
      "*AI Models*",
      "/model — Show active AI model",
      "/models — Browse model aliases and exact ids",
      "/setmodel `alias` — Switch using a friendly shortcut",
      "/setmodel `provider:model-name` — Switch using an exact id",
      "",
      "*Workflows*",
      "/mesh `<goal>` — Launch a multi-agent AI workflow",
      "",
      "*Files*",
      "/files — List files in your workspace",
      "/download `<filename>` — Download a file",
      "",
      "*System*",
      "/status — View background agents & system health",
      "/usage — View token, memory, and speech usage stats",
      "/help — Show this help menu",
    ].join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("mesh", async (ctx) => {
    const goal = ctx.match?.trim();
    if (!goal) {
      await ctx.reply("Usage: `/mesh <goal>`", { parse_mode: "Markdown" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const result = await getAppContext().mesh.runGoal(goal, {
        reportProgress: async (message) => {
          await sendFormattedMessage(ctx, message);
        },
      });

      await sendFormattedMessage(ctx, [
        `Mesh workflow complete.`,
        `Workflow ID: ${result.workflowId}`,
        `Status: ${result.status}`,
        "",
        result.summary,
      ].join("\n"));

      // Send the final artifact, or all artifacts if they are concise
      if (result.artifacts && result.artifacts.length > 0) {
        await ctx.reply("📦 **Workflow Deliverable Summaries**", { parse_mode: "Markdown" });
        for (const artifact of result.artifacts) {
          try {
            const content = artifact.summary;
            const isCode = content.includes("<!DOCTYPE html>") || content.includes("</html>");
            const ext = isCode ? "html" : "md";
            const safeTitle = artifact.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${artifact.role}_${safeTitle}.${ext}`;

            const buffer = Buffer.from(content, "utf-8");
            
            await ctx.replyWithDocument(new InputFile(buffer, filename), {
              caption: `[${artifact.role.toUpperCase()}] ${artifact.title}`
            });
          } catch (e) {
            console.error("Failed to send artifact doc", e);
            await ctx.reply(`❌ Failed to attach document for [${artifact.role.toUpperCase()}]`);
          }
        }
      }
    } catch (error: any) {
      console.error("[Bot] Mesh workflow error:", error);
      await ctx.reply(`❌ Mesh workflow failed: ${error?.message || String(error)}`);
    }
  });

  bot.command("files", async (ctx) => {
    try {
      const { readdirSync, statSync } = await import("fs");
      const { join } = await import("path");
      const dataDir = join(process.cwd(), "data");
      
      const files = readdirSync(dataDir).filter(f => !f.startsWith("."));
      if (files.length === 0) {
        await ctx.reply("📂 No files found in the data directory.");
        return;
      }
      
      const fileList = files.map(f => {
        const stats = statSync(join(dataDir, f));
        return `- \`${f}\` (${(stats.size / 1024).toFixed(1)} KB)`;
      }).join("\n");

      await ctx.reply(`📂 **Available Files**:\n${fileList}\n\nUse \`/download <filename>\` to get them.`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(`❌ Could not list files: ${err.message}`);
    }
  });

  bot.command("download", async (ctx) => {
    const filename = ctx.match?.trim();
    if (!filename) {
      await ctx.reply("Usage: `/download <filename>`", { parse_mode: "Markdown" });
      return;
    }

    try {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const filePath = join(process.cwd(), "data", filename);

      if (!existsSync(filePath)) {
        await ctx.reply(`❌ File \`${filename}\` not found in the data directory.`, { parse_mode: "Markdown" });
        return;
      }

      await ctx.replyWithChatAction("upload_document");
      await ctx.replyWithDocument(new InputFile(filePath));
    } catch (err: any) {
      await ctx.reply(`❌ Could not download file: ${err.message}`);
    }
  });

  approvalHandler.on("request", async ({ id, prompt, details }) => {
    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve_${id}`)
      .text("❌ Reject", `reject_${id}`);

    await bot.api.sendMessage(
      config.ALLOWED_USER_ID,
      `⚠️ *Approval Required:*\n\n${prompt}\n\n\`\`\`\n${details}\n\`\`\``,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  });

  bot.callbackQuery(/^(approve|reject)_(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const id = ctx.match[2];

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    await ctx.reply(action === "approve" ? "✅ *Approved!* Executing..." : "❌ *Rejected.*", {
      parse_mode: "Markdown",
    });

    approvalHandler.emit(`resolve_${id}`, action === "approve");
  });

  bot.on("message:voice", async (ctx) => {
    const indicator = new TypingIndicator(bot.api, ctx.chat.id);

    try {
      indicator.start("record_voice");

      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const transcript = await processAudioToText(url);
      await ctx.reply(`🎙️ _Heard:_ "${transcript}"`, { parse_mode: "Markdown" });
      const session = resolveTelegramConversationSession(ctx);

      const { text, speakText } = await processMessageWithEngine(transcript, true, {
        sessionId: session.id,
        enableSpeech: true,
      });

      if (text.trim().length > 0) {
        await sendFormattedMessage(ctx, text);
      }

      if (speakText) {
        const audioBuffer = await generateSpeechFromText(speakText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, "response.ogg"));
      }
    } catch (error: any) {
      console.error("[Bot] Voice pipeline error:", error);
      await ctx.reply(`❌ Voice error: ${error?.message || String(error)}`);
    } finally {
      indicator.stop();
    }
  });

  bot.on("message:photo", async (ctx) => {
    const indicator = new TypingIndicator(bot.api, ctx.chat.id);

    try {
      indicator.start("typing");

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
      const imageBuffer = Buffer.from(await res.arrayBuffer());
      const mediaType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";

      const userText = ctx.message.caption || "Please analyze this image.";
      const session = resolveTelegramConversationSession(ctx);

      const { text, speakText } = await processMessageWithEngine(userText, false, {
        sessionId: session.id,
        enableSpeech: true,
        images: [{ data: imageBuffer, mediaType }],
      });

      if (text.trim().length > 0) {
        await sendFormattedMessage(ctx, text);
      }

      if (speakText) {
        indicator.switchTo("record_voice");
        const audioBuffer = await generateSpeechFromText(speakText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, "response.ogg"));
      }
    } catch (error: any) {
      console.error("[Bot] Photo handler error:", error);
      const msg = error?.message || String(error);
      if (msg.includes("image input") || msg.includes("No endpoints found")) {
        await ctx.reply(`❌ **Vision Capability Error**\nThe currently active model does not support image analysis. \n\nPlease switch to a Vision-capable model using the menu, for example:\n\`/setmodel google:gemini-2.5-flash\`\n\`/setmodel openrouter:openai/gpt-4o\``, { parse_mode: "Markdown" });
      } else {
        await ctx.reply(`❌ Failed to process image: ${msg}`);
      }
    } finally {
      indicator.stop();
    }
  });

  bot.on("message:document", async (ctx) => {
    const indicator = new TypingIndicator(bot.api, ctx.chat.id);

    try {
      indicator.start("upload_document");

      const document = ctx.message.document;
      const file = await ctx.api.getFile(document.file_id);
      const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch document: ${res.statusText}`);
      const documentBuffer = Buffer.from(await res.arrayBuffer());
      const mediaType = document.mime_type || res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      const filename = document.file_name || "attachment";

      const userText = ctx.message.caption || `Please analyze this document: ${filename}`;
      const session = resolveTelegramConversationSession(ctx);

      const { text, speakText } = await processMessageWithEngine(userText, false, {
        sessionId: session.id,
        enableSpeech: true,
        documents: [{ data: documentBuffer, mediaType, filename }],
      });

      if (text.trim().length > 0) {
        await sendFormattedMessage(ctx, text);
      }

      if (speakText) {
        indicator.switchTo("record_voice");
        const audioBuffer = await generateSpeechFromText(speakText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, "response.ogg"));
      }
    } catch (error: any) {
      console.error("[Bot] Document handler error:", error);
      await ctx.reply(`❌ Failed to process document: ${error?.message || String(error)}`);
    } finally {
      indicator.stop();
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return;
    }

    const indicator = new TypingIndicator(bot.api, ctx.chat.id);

    try {
      indicator.start("typing");
      const session = resolveTelegramConversationSession(ctx);

      const { text, speakText } = await processMessageWithEngine(ctx.message.text, false, {
        sessionId: session.id,
        enableSpeech: true,
      });

      if (text.trim().length > 0) {
        await sendFormattedMessage(ctx, text);
      }

      if (speakText) {
        indicator.switchTo("record_voice");
        const audioBuffer = await generateSpeechFromText(speakText);
        await ctx.replyWithVoice(new InputFile(audioBuffer, "response.ogg"));
      }
    } catch (error: any) {
      console.error("[Bot] Text handler error:", error);
      await ctx.reply("Sorry, something went wrong.");
    } finally {
      indicator.stop();
    }
  });

  bot.catch((error) => {
    console.error("[Bot Critical Error]", error);
  });

  return {
    id: "telegram",
    async start() {
      console.log("[Bot] Launching natively in long-polling mode.");

      // Register command menu with Telegram BEFORE starting the polling loop.
      // This ensures the '/' autocomplete menu is always up-to-date on deploy.
      try {
        await bot.api.setMyCommands([
          { command: "new", description: "Start a fresh conversation thread" },
          { command: "mesh", description: "Launch an autonomous AI workflow" },
          { command: "help", description: "Show all available commands" },
          { command: "status", description: "View background agents & system health" },
          { command: "model", description: "Show the currently active AI model" },
          { command: "models", description: "List all available AI models" },
          { command: "setmodel", description: "Switch active model (usage: /setmodel provider:name)" },
          { command: "compact", description: "Force memory compaction manually" },
      { command: "usage", description: "View recent token and speech usage stats" },
          { command: "files", description: "List files stored in your workspace" },
          { command: "download", description: "Download a specific file by name" },
        ]);
        console.log("[Bot] ✅ Telegram command menu registered.");
      } catch (e) {
        console.error("[Bot] ❌ Failed to register command menu:", e);
      }

      await bot.start({
        onStart: (botInfo: any) => {
          console.log(`[Bot] Successfully authenticated as @${botInfo.username}`);
          console.log("[Bot] Awaiting instructions from the whitelisted user...");
        },
      });
    },
    async sendText(text, options) {
      if (options?.markdown) {
        const dummyCtx = {
          reply: async (msg: string, opts?: any) => {
            await bot.api.sendMessage(config.ALLOWED_USER_ID, msg, opts);
          }
        };
        await sendFormattedMessage(dummyCtx as any, text);
      } else {
        await bot.api.sendMessage(
          config.ALLOWED_USER_ID,
          text
        );
      }
    },
  };
}
