import test from "node:test";
import assert from "node:assert/strict";
import { buildModelsCatalogMarkdown, resolveModelSelection } from "./modelCatalog";

test("resolveModelSelection accepts friendly aliases, labels, and bare model names", () => {
  assert.equal(resolveModelSelection("qwen"), "alibaba:qwen3.6-plus");
  assert.equal(resolveModelSelection("Qwen 3.6 Plus"), "alibaba:qwen3.6-plus");
  assert.equal(resolveModelSelection("qwenor"), "openrouter:qwen/qwen3.6-plus:free");
  assert.equal(resolveModelSelection("grok-3-mini"), "resurge:grok-3-mini");
});

test("buildModelsCatalogMarkdown shows active model and shortcut guidance", () => {
  const output = buildModelsCatalogMarkdown("google:gemini-2.5-flash");

  assert.match(output, /Model Menu/);
  assert.match(output, /Current: `google:gemini-2\.5-flash`/);
  assert.match(output, /Friendly examples: `qwen`, `qwenor`, `gemini`/);
  assert.match(output, /`gemini` -> Gemini 2\.5 Flash \[active\]/);
});
