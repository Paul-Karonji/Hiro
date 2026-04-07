import test from "node:test";
import assert from "node:assert/strict";
import { buildMeshResultMessage, buildMeshSessionDocument } from "./meshSession";

const sampleResult = {
  workflowId: "mesh_123",
  modelUsed: "google:gemini-2.5-flash",
  status: "completed" as const,
  summary: "Kenyan rental management systems show limited but growing operational SaaS maturity.",
  plan: {
    goal: "Research Kenyan rental management systems",
    initialStepId: "scope",
    steps: [
      {
        id: "scope",
        title: "Define Scope",
        ownerRole: "researcher",
        successCriteria: "Produce a scoped research brief",
        expectedArtifact: "Research brief",
        nextStepOnSuccess: "collect",
        nextStepOnFailure: null,
      },
      {
        id: "collect",
        title: "Collect Market Data",
        ownerRole: "analyst",
        successCriteria: "Produce a market evidence summary",
        expectedArtifact: "Market evidence summary",
        nextStepOnSuccess: null,
        nextStepOnFailure: null,
      },
    ],
  },
  artifacts: [
    {
      id: "scope",
      title: "Define Scope",
      role: "researcher",
      summary: "Focused on operational rental management tools, excluding classifieds and listing portals.",
    },
    {
      id: "collect",
      title: "Collect Market Data",
      role: "analyst",
      summary: "Found a small set of operational products with local payment and reporting features.",
    },
  ],
};

test("buildMeshResultMessage records the final mesh summary and preserved driver model", () => {
  const output = buildMeshResultMessage({
    goal: "Research Kenyan rental management systems",
    defaultDriverModel: "mistral:mistral-large-latest",
    result: sampleResult,
  });

  assert.match(output, /\[Mesh result\]/);
  assert.match(output, /Default driver model remains: mistral:mistral-large-latest/);
  assert.match(output, /Planner model: google:gemini-2\.5-flash/);
  assert.match(output, /limited but growing operational SaaS maturity/);
});

test("buildMeshSessionDocument includes the plan, artifact summaries, and final output", () => {
  const output = buildMeshSessionDocument({
    goal: "Research Kenyan rental management systems",
    defaultDriverModel: "groq:llama-3.3-70b-versatile",
    result: sampleResult,
  });

  assert.match(output, /# Mesh Workflow Record/);
  assert.match(output, /Default driver model after mesh: groq:llama-3\.3-70b-versatile/);
  assert.match(output, /## Final Output/);
  assert.match(output, /## Plan/);
  assert.match(output, /1\. Define Scope/);
  assert.match(output, /2\. Collect Market Data/);
  assert.match(output, /## Artifact 2: Collect Market Data/);
});
