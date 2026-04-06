import { generateText } from "ai";
import { config } from "./src/config";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { mistral } from "@ai-sdk/mistral";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const groq = createOpenAI({
  baseURL: "https://api.groq.com/openai/v1",
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
      prompt: "Respond with exactly 'OK'."
    });
    console.log(`✅ Success: Expected 'OK', got '${text}'`);
  } catch (error: any) {
    console.log(`❌ Failed: ${error.message}`);
  }
}

async function main() {
  console.log("Starting model verifications...\n");

  await testModel("Mistral (mistral-large-latest)", mistral("mistral-large-latest"));
  await testModel("Groq (llama-3.3-70b-versatile)", groq("llama-3.3-70b-versatile"));
  await testModel("OpenRouter (deepseek/deepseek-chat)", openrouter("deepseek/deepseek-chat"));
  
  console.log("\nDone!");
}

main();
