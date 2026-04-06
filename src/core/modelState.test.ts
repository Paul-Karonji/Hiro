import test from "node:test";
import assert from "node:assert/strict";
import { ActiveModelState, parseModelId } from "./modelState";

test("parseModelId keeps the full model name after the first colon", () => {
  const result = parseModelId("openrouter:deepseek/deepseek-r1:free");

  assert.equal(result.providerId, "openrouter");
  assert.equal(result.modelName, "deepseek/deepseek-r1:free");
});

test("ActiveModelState stores and updates the current model id", () => {
  const state = new ActiveModelState("google:gemini-2.5-flash");
  assert.equal(state.getCurrentModel(), "google:gemini-2.5-flash");

  state.setCurrentModel("mistral:mistral-small-latest");
  assert.equal(state.getCurrentModel(), "mistral:mistral-small-latest");
});
