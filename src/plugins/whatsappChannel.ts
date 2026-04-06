import { createWhatsAppChannelService } from "../bot/whatsapp";
import type { ChannelPlugin } from "./types";

export const whatsappChannelPlugin: ChannelPlugin = {
  id: "whatsapp",
  createService() {
    return createWhatsAppChannelService();
  },
};
