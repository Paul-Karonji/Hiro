import test from "node:test";
import assert from "node:assert/strict";
import { buildModelsCatalogMarkdown, resolveModelSelection } from "./modelCatalog";

test("resolveModelSelection accepts friendly aliases, labels, and bare model names", () => {
  assert.equal(resolveModelSelection("qwen"), "alibaba:qwen-plus-latest");
  assert.equal(resolveModelSelection("Qwen Plus Latest"), "alibaba:qwen-plus-latest");
  assert.equal(resolveModelSelection("qwenor"), "openrouter:qwen/qwen3.6-plus:free");
  assert.equal(resolveModelSelection("qwen35"), "alibaba:qwen3.5-plus");
  assert.equal(resolveModelSelection("qwen35or"), "openrouter:qwen/qwen3.5-plus-02-15");
  assert.equal(resolveModelSelection("grok-3-mini"), "resurge:grok-3-mini");
});

test("buildModelsCatalogMarkdown shows active model and shortcut guidance", () => {
  const output = buildModelsCatalogMarkdown("google:gemini-2.5-flash");

  assert.match(output, /Model Menu/);
  assert.match(output, /Current: `google:gemini-2\.5-flash`/);
  assert.match(output, /Friendly examples: `qwen`, `qwen3max`, `qwenflash`/);
  assert.match(output, /`gemini` -> Gemini 2\.5 Flash \[active\]/);
});
