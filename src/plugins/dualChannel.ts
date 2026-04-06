import { createTelegramChannelService } from "../bot/telegram";
import { createWhatsAppChannelService } from "../bot/whatsapp";
import type { ChannelPlugin, ChannelService } from "./types";

export const dualChannelPlugin: ChannelPlugin = {
  id: "dual",
  createService(): ChannelService {
    const telegram = createTelegramChannelService();
    const whatsapp = createWhatsAppChannelService();

    return {
      id: "dual",
      async start() {
        console.log("[Dual Channel] Starting Telegram and WhatsApp simultaneously...");
        // Start both without blocking each other
        Promise.all([
          telegram.start().catch((e) => console.error("[Dual Channel] Telegram failed to start:", e)),
          whatsapp.start().catch((e) => console.error("[Dual Channel] WhatsApp failed to start:", e))
        ]);
      },
      async sendText(text, options) {
        // Broadcast proactive messages to both channels
        await Promise.all([
          telegram.sendText(text, options).catch((e) => console.error("[Dual Channel] Telegram sendText failed:", e)),
          whatsapp.sendText(text, options).catch((e) => console.error("[Dual Channel] WhatsApp sendText failed:", e))
        ]);
      }
    };
  },
};
