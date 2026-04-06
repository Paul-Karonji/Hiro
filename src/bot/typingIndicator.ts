import type { Api } from "grammy";

/**
 * A reusable typing indicator that sends Telegram chat actions on a keepalive interval.
 * Replaces the scattered setInterval/clearInterval pattern in every bot handler.
 *
 * Usage:
 *   const indicator = new TypingIndicator(bot.api, ctx.chat.id);
 *   indicator.start("typing");
 *   // ... do async work ...
 *   indicator.stop();
 */
export class TypingIndicator {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: Api,
    private readonly chatId: number,
  ) {}

  start(action: "typing" | "record_voice" | "upload_document" = "typing"): void {
    this.stop(); // clear any previous timer

    // Send immediately so there's no visible delay
    this.api.sendChatAction(this.chatId, action).catch(() => {});

    this.timer = setInterval(() => {
      this.api.sendChatAction(this.chatId, action).catch(() => {});
    }, 4000);
  }

  switchTo(action: "typing" | "record_voice" | "upload_document"): void {
    this.stop();
    this.start(action);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
