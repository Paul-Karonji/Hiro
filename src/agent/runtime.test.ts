import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUserMessageContent,
  inferSwarmRoutingMarker,
  isSwarmProvisionalResponse,
  isPseudoToolOutput,
  normalizeSwarmRoutingOutput,
} from "./runtime";

test("isPseudoToolOutput detects fake tool JSON stubs", () => {
  assert.equal(
    isPseudoToolOutput('```json\n{\n  "tool_code": "print(DueSync.get_today_tasks())"\n}\n```'),
    true,
  );
});

test("isPseudoToolOutput ignores normal natural-language answers", () => {
  assert.equal(
    isPseudoToolOutput("You have 0 pending tasks scheduled for today."),
    false,
  );
});

test("buildUserMessageContent preserves binary images without converting them to data URLs", () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff]);
  const content = buildUserMessageContent("Analyze this.", [{ data: image, mediaType: "image/jpeg" }]);

  assert.ok(Array.isArray(content));
  assert.deepEqual(content, [
    { type: "text", text: "Analyze this." },
    { type: "image", image, mediaType: "image/jpeg" },
  ]);
});

test("inferSwarmRoutingMarker auto-approves substantive worker deliverables", () => {
  const marker = inferSwarmRoutingMarker(
    `{
      "research_scope_parameters": {
        "objective": "Evaluate the current status, adoption, and feature maturity of operational rental management systems in Kenya.",
        "target_user_persona": "Professional property managers and landlords managing 10+ units",
        "operational_status": "Actively marketed and deployed within Kenya between 2023 and 2025"
      }
    }`,
    "research_lead",
  );

  assert.equal(marker, "[APPROVED]");
});

test("inferSwarmRoutingMarker rejects explicit failure language", () => {
  const marker = inferSwarmRoutingMarker(
    "I could not find sufficient Kenyan market data to satisfy this step with confidence.",
    "data_scout",
  );

  assert.equal(marker, "[REJECTED]");
});

test("normalizeSwarmRoutingOutput leaves reviewer output unchanged without an explicit decision", () => {
  const output = normalizeSwarmRoutingOutput(
    "The draft is mostly solid, but the evidence base is uneven and the pricing claims need verification.",
    "reviewer",
  );

  assert.equal(
    output,
    "The draft is mostly solid, but the evidence base is uneven and the pricing claims need verification.",
  );
});

test("normalizeSwarmRoutingOutput auto-approves reviewer validation text with an explicit approval signal", () => {
  const output = normalizeSwarmRoutingOutput(
    "Validation summary: the report is accurate and within scope, meets the success criteria, and is ready to proceed.",
    "reviewer",
  );

  assert.equal(
    output,
    "Validation summary: the report is accurate and within scope, meets the success criteria, and is ready to proceed.\n\n[APPROVED]",
  );
});

test("isSwarmProvisionalResponse detects placeholder continuation text", () => {
  assert.equal(
    isSwarmProvisionalResponse("Let me verify the current status of a few key vendors before producing the final publication-ready document.\n\n[APPROVED]"),
    true,
  );
});

test("normalizeSwarmRoutingOutput rejects provisional approved placeholders", () => {
  const output = normalizeSwarmRoutingOutput(
    "Let me verify the current status of a few key vendors before producing the final publication-ready document.\n\n[APPROVED]",
    "editor",
  );

  assert.equal(
    output,
    "Let me verify the current status of a few key vendors before producing the final publication-ready document.\n\n[REJECTED]",
  );
});
