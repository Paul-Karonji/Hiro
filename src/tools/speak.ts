/**
 * speak_response tool — lets the agent explicitly trigger voice output.
 * The runtime captures this as a speech directive and the Telegram channel
 * turns it into TTS audio when appropriate.
 */
export const speakResponseDeclaration = {
  name: "speak_response",
  description: "Use this tool when the user asks you to speak, say something aloud, read something out, or wants a voice reply. Pass the full natural-language text you want spoken. The system will convert it to audio and send it back as a Telegram voice message. Write the text as you would say it — no markdown, bullet points, or special characters.",
  parameters: {
    type: "object",
    properties: {
      text_to_speak: {
        type: "string",
        description: "The text to convert to speech. Write it as natural spoken language — clear sentences, no symbols or formatting marks."
      }
    },
    required: ["text_to_speak"]
  }
};
