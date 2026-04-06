import { createTelegramChannelService } from "../bot/telegram";
import type { ChannelPlugin } from "./types";

export const builtinChannelPlugin: ChannelPlugin = {
  id: "telegram",
  createService() {
    return createTelegramChannelService();
  },
};
