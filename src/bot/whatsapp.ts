import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  isJidBroadcast,
  fetchLatestBaileysVersion,
  AnyMessageContent,
  WAMessage
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import { processMessageWithEngine, getActiveModelName, setActiveModel } from "../agent/engine";
import { processAudioToText, generateSpeechFromText } from "./audio";
import { config } from "../config";
import { getAppContext } from "../core/appContext";
import type { ChannelService } from "../plugins/types";
import { formatForWhatsApp } from "./whatsappFormatter";
import { setLatestQR } from "./whatsappQR";
import { buildModelsCatalogMarkdown, resolveModelSelection } from "./modelCatalog";

// Command Handlers
import { handleStatusCommand } from "./commands/status";
import { handleNewCommand } from "./commands/new";
import { handleCompactCommand } from "./commands/compact";
import { handleUsageCommand } from "./commands/usage";

const AUTH_DIR = path.resolve(process.cwd(), "data/whatsapp_auth");

const processedMessageIds = new Set<string>();

function resolveWhatsAppConversationSession(jid: string) {
  return getAppContext().sessions.resolveUserSession({
    platform: "whatsapp",
    userId: jid,
    chatId: jid,
    threadId: null,
  });
}

export function createWhatsAppChannelService(): ChannelService {
  let sock: ReturnType<typeof makeWASocket> | null = null;
  let isReady = false;

  const allowedJid = config.WHATSAPP_ALLOWED_JID;
  const allowedJidVariants = new Set<string>();
  if (!allowedJid) {
    console.warn("[WhatsApp] WHATSAPP_ALLOWED_JID is not set in environment.");
  }

  const normalizeJid = (jid: string) => jid.trim().toLowerCase();
  const stripDeviceSuffix = (jid: string) => jid.replace(/:\d+(?=@)/, "");
  const rememberAllowedJid = (jid?: string | null) => {
    if (!jid) return;
    allowedJidVariants.add(normalizeJid(jid));
    allowedJidVariants.add(normalizeJid(stripDeviceSuffix(jid)));
  };
  const isAllowedRemoteJid = (jid: string) => {
    const normalized = normalizeJid(jid);
    return allowedJidVariants.has(normalized) || allowedJidVariants.has(normalizeJid(stripDeviceSuffix(jid)));
  };
  const hydrateAllowedJids = async () => {
    if (!sock) return;

    rememberAllowedJid(allowedJid);
    rememberAllowedJid(sock.user?.id);
    rememberAllowedJid(sock.user?.lid);

    if (!allowedJid) return;

    try {
      const matches = await sock.onWhatsApp(allowedJid);
      for (const match of matches || []) {
        rememberAllowedJid(match.jid);
        if (typeof match.lid === "string") {
          rememberAllowedJid(match.lid);
        }
      }
    } catch (error: any) {
      console.warn("[WhatsApp] Failed to refresh allowed JID variants:", error?.message || String(error));
    }
  };

  rememberAllowedJid(allowedJid);

  // Helper to send formatted text natively
  const sendTextMsg = async (jid: string, text: string) => {
    if (!sock) return;
    const formattedText = formatForWhatsApp(text);
    await sock.sendMessage(jid, { text: formattedText });
  };

  async function connectToWhatsApp() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Using WA v${version.join(".")}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      browser: ["Hiro Agent", "Chrome", "1.0.0"],
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
      if (!allowedJid) return;
      if (normalizeJid(jid) !== normalizeJid(allowedJid)) return;
      rememberAllowedJid(lid);
      console.log("[WhatsApp] Learned LID mapping for the allowed self-chat.");
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        setLatestQR(qr);
        console.log(`[WhatsApp] QR code ready. Open the protected QR route at ${config.PUBLIC_BASE_URL}/qr to scan.`);
      }

      if (connection === "close") {
        isReady = false;
        setLatestQR(null);
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Connection closed (status ${statusCode}), reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => connectToWhatsApp(), 3000);
        } else {
          console.log("[WhatsApp] Logged out. Delete data/whatsapp_auth and restart.");
        }
      } else if (connection === "open") {
        console.log("[WhatsApp] Connected successfully.");
        isReady = true;
        await hydrateAllowedJids();
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid || isJidBroadcast(jid)) continue;

        // WhatsApp can represent Note to Self as the phone-number JID or the LID JID.
        // Learn both forms and only accept messages from the configured owner chat.
        if (!isAllowedRemoteJid(jid)) {
          if (jid.endsWith("@lid")) {
            await hydrateAllowedJids();
          }
        }
        if (!isAllowedRemoteJid(jid)) {
          console.log(`[WhatsApp Security] Ignoring message from unauthorized JID: ${jid}`);
          continue;
        }

        // In Note-to-Self, the USER's messages have fromMe=true (they typed it).
        // Skip messages that don't have fromMe=true since those are our own bot replies.
        if (!msg.key.fromMe) continue;

        // Deduplicate: Baileys can fire messages.upsert multiple times for the same message
        const msgId = msg.key.id;
        if (msgId && processedMessageIds.has(msgId)) continue;
        if (msgId) {
          processedMessageIds.add(msgId);
          if (processedMessageIds.size > 500) {
            const first = processedMessageIds.values().next().value;
            if (first) processedMessageIds.delete(first);
          }
        }

        await handleIncomingMessage(msg, jid);
      }
    });
  }

  async function handleIncomingMessage(msg: WAMessage, jid: string) {
    if (!sock) return;

    try {
      const messageType = Object.keys(msg.message!)[0];
      let text = "";

      if (messageType === "conversation") {
        text = msg.message!.conversation!;
      } else if (messageType === "extendedTextMessage") {
        text = msg.message!.extendedTextMessage!.text!;
      } else if (messageType === "imageMessage") {
        await sock.sendMessage(jid, { text: "Analyzing image..." });
        const buffer = await downloadMediaMessage(msg, "buffer", { }, {
          logger: console as any,
          reuploadRequest: sock.updateMediaMessage
        }) as Buffer;
        const mediaType = msg.message?.imageMessage?.mimetype || "image/jpeg";
        const caption = msg.message?.imageMessage?.caption || "Please analyze this image.";
        const session = resolveWhatsAppConversationSession(jid);

        const { text: responseText, speakText } = await processMessageWithEngine(caption, false, {
          sessionId: session.id,
          enableSpeech: true,
          images: [{ data: buffer, mediaType }],
        });

        if (responseText.trim().length > 0) {
          await sendTextMsg(jid, responseText);
        }

        if (speakText) {
          const audioBuffer = await generateSpeechFromText(speakText);
          await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          });
        }
        return;
      } else if (messageType === "audioMessage") {
        await sock.sendMessage(jid, { text: "Listening..." });
        const buffer = await downloadMediaMessage(msg, "buffer", { }, {
          logger: console as any,
          reuploadRequest: sock.updateMediaMessage
        }) as Buffer;

        const uniqueId = `wa_${Date.now()}`;
        const tempOgg = path.join(process.cwd(), "data", `${uniqueId}.ogg`);
        const tempWav = path.join(process.cwd(), "data", `${uniqueId}.wav`);
        fs.writeFileSync(tempOgg, buffer);

        const ffmpeg = (await import("fluent-ffmpeg")).default;
        const installer = (await import("@ffmpeg-installer/ffmpeg")).default;
        ffmpeg.setFfmpegPath(installer.path);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempOgg)
            .toFormat("wav")
            .audioChannels(1)
            .audioFrequency(16000)
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(err))
            .save(tempWav);
        });

        const FormData = (await import("form-data")).default;
        const axios = (await import("axios")).default;
        const form = new FormData();
        form.append("file", fs.createReadStream(tempWav), {
          filename: "audio.wav",
          contentType: "audio/wav",
        });
        form.append("model", "whisper-large-v3");
        form.append("response_format", "text");

        const groqRes = await axios.post(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          form,
          { headers: { ...form.getHeaders(), Authorization: `Bearer ${config.GROQ_API_KEY}` } }
        );

        try { fs.unlinkSync(tempOgg); } catch {}
        try { fs.unlinkSync(tempWav); } catch {}

        const transcript = typeof groqRes.data === "string"
          ? groqRes.data.trim()
          : String(groqRes.data).trim();

        await sendTextMsg(jid, `_Heard: "${transcript}"_`);

        const framedInput = `[WhatsApp Voice Transcription: "${transcript}"]\n\nNote: speak_response is NOT available on WhatsApp. Do NOT output "Done." - write your full answer in plain text. It will be automatically read aloud.`;
        const session = resolveWhatsAppConversationSession(jid);
        let { text: responseText } = await processMessageWithEngine(framedInput, false, {
          sessionId: session.id,
          enableSpeech: false,
          metadata: { channel: "whatsapp" },
        });

        const isDone = (t: string) => t.trim().toLowerCase().replace(/\.$/, "") === "done";
        if (isDone(responseText) || responseText.trim().length === 0) {
          console.warn("[WhatsApp] Got \"Done.\" - retrying with raw transcript");
          const retry = await processMessageWithEngine(
            `The user said via voice message: "${transcript}". Reply in full text - do not call any speech tools.`,
            false,
            { sessionId: session.id, enableSpeech: false, metadata: { channel: "whatsapp" } }
          );
          if (!isDone(retry.text) && retry.text.trim().length > 0) {
            responseText = retry.text;
          }
        }

        console.log(`[WhatsApp] Voice response: "${responseText.slice(0, 120)}"`);

        if (responseText.trim().length > 0) {
          await sendTextMsg(jid, responseText);

          try {
            const ttsText = responseText.length > 2000 ? responseText.slice(0, 2000) + "..." : responseText;
            const audioBuffer = await generateSpeechFromText(ttsText);
            await sock.sendMessage(jid, {
              audio: audioBuffer,
              mimetype: "audio/ogg; codecs=opus",
              ptt: true,
            });
          } catch (ttsErr: any) {
            console.warn("[WhatsApp] TTS failed, sending text only:", ttsErr.message);
          }
        }
        return;
      }

      if (!text) return;

      const trimmedText = text.trim();
      const lowerText = trimmedText.toLowerCase();
      const commandMatch = trimmedText.match(/^\/?([a-z]+)(?:\s+([\s\S]+))?$/i);
      const command = commandMatch?.[1]?.toLowerCase();
      const commandArg = commandMatch?.[2]?.trim() ?? "";
      const isBareCommand = Boolean(command && (lowerText === command || lowerText === `/${command}`));

      if (command === "new" && isBareCommand) {
        const session = resolveWhatsAppConversationSession(jid);
        const dummyCtx: any = { reply: (msg: string) => sendTextMsg(jid, msg) };
        await handleNewCommand(dummyCtx, { sessionId: session.id });
        return;
      }

      if (command === "status" && isBareCommand) {
        const session = resolveWhatsAppConversationSession(jid);
        const dummyCtx: any = { reply: (msg: string) => sendTextMsg(jid, msg) };
        await handleStatusCommand(dummyCtx, { sessionId: session.id });
        return;
      }

      if (command === "compact" && isBareCommand) {
        const session = resolveWhatsAppConversationSession(jid);
        const dummyCtx: any = { reply: (msg: string) => sendTextMsg(jid, msg) };
        await handleCompactCommand(dummyCtx, { sessionId: session.id });
        return;
      }

      if (command === "usage" && isBareCommand) {
        const dummyCtx: any = { reply: (msg: string) => sendTextMsg(jid, msg) };
        await handleUsageCommand(dummyCtx);
        return;
      }

      if (command === "models" && isBareCommand) {
        await sendTextMsg(jid, buildModelsCatalogMarkdown(getActiveModelName()));
        return;
      }

      if (command === "model" && isBareCommand) {
        await sendTextMsg(
          jid,
          `Active model: \`${getActiveModelName()}\`\nUse \`models\` to browse friendly names, then \`setmodel qwen\` to switch.`,
        );
        return;
      }

      if (command === "setmodel") {
        if (!commandArg) {
          await sendTextMsg(jid, "Missing model name. Use `models` to browse aliases or `setmodel provider:model-name` for an exact id.");
          return;
        }

        try {
          const newModel = resolveModelSelection(commandArg);
          setActiveModel(newModel);
          await sendTextMsg(jid, `Model switched to \`${newModel}\``);
        } catch (error: any) {
          await sendTextMsg(jid, error?.message || String(error));
        }
        return;
      }

      if (command === "mesh" && commandArg) {
        const goal = commandArg;
        await sendTextMsg(jid, "Starting Mesh workflow...");

        try {
          const result = await getAppContext().mesh.runGoal(goal, {
            reportProgress: async (message) => {
              await sendTextMsg(jid, message);
            },
          });

          await sendTextMsg(jid, `Mesh workflow complete.\nWorkflow ID: ${result.workflowId}\nStatus: ${result.status}\n\n${result.summary}`);

          if (result.artifacts && result.artifacts.length > 0) {
            await sendTextMsg(jid, "*Workflow Deliverable Summaries*");
            for (const artifact of result.artifacts) {
              const content = artifact.summary;
              const isCode = content.includes("<!DOCTYPE html>") || content.includes("</html>");
              const ext = isCode ? "html" : "md";
              const safeTitle = artifact.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
              const filename = `${artifact.role}_${safeTitle}.${ext}`;
              const buffer = Buffer.from(content, "utf-8");

              await sock.sendMessage(jid, {
                document: buffer,
                mimetype: "text/plain",
                fileName: filename,
                caption: `[${artifact.role.toUpperCase()}] ${artifact.title}`
              });
            }
          }
        } catch (e: any) {
          await sendTextMsg(jid, `Mesh workflow failed: ${e.message}`);
        }
        return;
      }

      if (command === "files" && isBareCommand) {
        try {
          const { readdirSync, statSync } = await import("fs");
          const { join } = await import("path");
          const dataDir = join(process.cwd(), "data");
          const files = readdirSync(dataDir).filter(f => !f.startsWith("."));
          if (files.length === 0) {
            await sendTextMsg(jid, "No files found in the data directory.");
          } else {
            const fileList = files.map(f => {
              const stats = statSync(join(dataDir, f));
              return `- \`${f}\` (${(stats.size / 1024).toFixed(1)} KB)`;
            }).join("\n");
            await sendTextMsg(jid, `Available Files:\n${fileList}\n\nUse \`download <filename>\` to get one.`);
          }
        } catch (err: any) {
          await sendTextMsg(jid, `Could not list files: ${err.message}`);
        }
        return;
      }

      if (command === "download" && commandArg) {
        const filename = commandArg;
        try {
          const { existsSync, readFileSync } = await import("fs");
          const { join } = await import("path");
          const filePath = join(process.cwd(), "data", filename);
          if (!existsSync(filePath)) {
            await sendTextMsg(jid, `File \`${filename}\` not found in the data directory.`);
            return;
          }
          const buffer = readFileSync(filePath);
          const isCode = filename.endsWith(".html") || filename.endsWith(".htm");
          await sock.sendMessage(jid, {
            document: buffer,
            mimetype: isCode ? "text/html" : "text/plain",
            fileName: filename,
            caption: filename,
          });
        } catch (err: any) {
          await sendTextMsg(jid, `Could not send file: ${err.message}`);
        }
        return;
      }

      await sock.sendMessage(jid, { text: "thinking..." });
      const session = resolveWhatsAppConversationSession(jid);

      const { text: responseText } = await processMessageWithEngine(text, false, {
        sessionId: session.id,
        enableSpeech: false,
        metadata: { channel: "whatsapp" },
      });

      if (responseText.trim().length > 0) {
        await sendTextMsg(jid, responseText);
      }
    } catch (error: any) {
      console.error("[WhatsApp Bot Error]", error);
      await sendTextMsg(jid, `Error: ${error.message}`);
    }
  }

  return {
    id: "whatsapp",
    async start() {
      console.log("[WhatsApp] Starting Baileys connection...");
      await connectToWhatsApp();
    },
    async sendText(text, options) {
      if (!isReady || !sock || !allowedJid) {
        console.warn("[WhatsApp] Cannot send proactive text, not ready or JID not configured.");
        return;
      }

      const formattedText = formatForWhatsApp(text);
      await sock.sendMessage(allowedJid, { text: formattedText });
    },
  };
}
