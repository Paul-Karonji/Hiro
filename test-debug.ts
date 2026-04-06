import { generateText, tool } from "ai";
import { config } from "./src/config";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const groqAI = createGroq({
  apiKey: config.GROQ_API_KEY,
});

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY,
});

async function testModel(name: string, model: any) {
  try {
    process.stdout.write(`Testing ${name}... `);
    const { text } = await generateText({
      model,
      system: "You are a helpful assistant.",
      prompt: "hello",
      tools: {
        dummy_tool: tool({
          description: "Does nothing",
          parameters: z.object({ value: z.string() }),
          execute: async () => "ok"
        })
      },
      maxSteps: 3,
      maxTokens: 1024
    });
    console.log(`✅ Success: Got '${text}'`);
  } catch (error: any) {
    console.log(`❌ Failed: ${error.message}`);
  }
}

async function main() {
  console.log("Starting debug verifications...\n");

  await testModel("Groq Native (llama-3.3-70b-versatile)", groqAI("llama-3.3-70b-versatile"));
  await testModel("OpenRouter (meta-llama/llama-3.3-70b-instruct:free)", openrouter("meta-llama/llama-3.3-70b-instruct:free"));
  
  console.log("\nDone!");
}

main();
