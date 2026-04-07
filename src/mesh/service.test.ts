import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMeshModelAttemptOrder,
  buildMeshPlannerInstructions,
  canAutoRecoverRejectedStep,
  getMeshRoutingDecision,
  isRetryableMeshModelError,
  normalizeMeshPlan,
  stripMeshRoutingMarkers,
  unwrapRawMeshPlan,
} from "./service";

test("buildMeshPlannerInstructions explicitly requires JSON output for structured planners", () => {
  const instructions = buildMeshPlannerInstructions("research rental systems", 6);

  assert.match(instructions.system.toLowerCase(), /json/);
  assert.match(instructions.prompt.toLowerCase(), /json/);
  assert.match(instructions.prompt, /6/);
});

test("normalizeMeshPlan fills missing goal and initial step from the first step", () => {
  const plan = normalizeMeshPlan("research rental systems", {
    steps: [
      {
        id: "research_data",
        title: "Research data",
        ownerRole: "researcher",
        successCriteria: "Collect the current Kenya-focused systems",
        expectedArtifact: "research.md",
        nextStepOnSuccess: "review_scope",
        nextStepOnFailure: "research_data",
      },
      {
        id: "review_scope",
        title: "Review scope",
        ownerRole: "reviewer",
        successCriteria: "Remove rental listing platforms",
        expectedArtifact: "review.md",
        nextStepOnSuccess: null,
        nextStepOnFailure: "research_data",
      },
    ],
  });

  assert.equal(plan.goal, "research rental systems");
  assert.equal(plan.initialStepId, "research_data");
  assert.equal(plan.steps[0].nextStepOnSuccess, "review_scope");
  assert.equal(plan.steps[1].nextStepOnFailure, "research_data");
});

test("normalizeMeshPlan drops invalid routes and preserves a valid initial step", () => {
  const plan = normalizeMeshPlan("research rental systems", {
    goal: "normalized goal",
    initialStepId: "review_scope",
    steps: [
      {
        id: "research_data",
        title: "Research data",
        ownerRole: "researcher",
        successCriteria: "Collect the current Kenya-focused systems",
        expectedArtifact: "research.md",
        nextStepOnSuccess: "unknown_step",
        nextStepOnFailure: null,
      },
      {
        id: "review_scope",
        title: "Review scope",
        ownerRole: "reviewer",
        successCriteria: "Remove rental listing platforms",
        expectedArtifact: "review.md",
        nextStepOnSuccess: null,
        nextStepOnFailure: "research_data",
      },
    ],
  });

  assert.equal(plan.goal, "normalized goal");
  assert.equal(plan.initialStepId, "review_scope");
  assert.equal(plan.steps[0].nextStepOnSuccess, null);
  assert.equal(plan.steps[1].nextStepOnFailure, "research_data");
});

test("normalizeMeshPlan accepts planner output wrapped under fsm_plan after unwrapping", () => {
  const raw = unwrapRawMeshPlan({
    fsm_plan: {
      goal: "wrapped goal",
      steps: [
        {
          id: "data_collection",
          title: "Gather data",
          ownerRole: "researcher",
          successCriteria: "Collect data",
          expectedArtifact: "data.csv",
          nextStepOnSuccess: "",
          nextStepOnFailure: "data_collection",
        },
      ],
    },
  });

  const plan = normalizeMeshPlan("fallback goal", raw);
  assert.equal(plan.goal, "wrapped goal");
  assert.equal(plan.initialStepId, "data_collection");
  assert.equal(plan.steps[0].nextStepOnSuccess, null);
});

test("unwrapRawMeshPlan accepts a bare step array from the planner", () => {
  const raw = unwrapRawMeshPlan([
    {
      id: "define_scope",
      title: "Define Scope",
      ownerRole: "researcher",
      successCriteria: "Scope is defined",
      expectedArtifact: "scope.md",
      nextStepOnSuccess: "gather_data",
      nextStepOnFailure: null,
    },
    {
      id: "gather_data",
      title: "Gather Data",
      ownerRole: "analyst",
      successCriteria: "Data is gathered",
      expectedArtifact: "data.json",
      nextStepOnSuccess: null,
      nextStepOnFailure: "define_scope",
    },
  ]);

  const plan = normalizeMeshPlan("research rental systems", raw);
  assert.equal(plan.initialStepId, "define_scope");
  assert.equal(plan.steps[0].nextStepOnSuccess, "gather_data");
  assert.equal(plan.steps[1].nextStepOnFailure, "define_scope");
});

test("unwrapRawMeshPlan accepts wrapped planner arrays", () => {
  const raw = unwrapRawMeshPlan({
    plan: [
      {
        id: "collect_data",
        title: "Collect Data",
        ownerRole: "analyst",
        successCriteria: "Collect current market data",
        nextStepOnSuccess: null,
        nextStepOnFailure: null,
      },
    ],
  } as any);

  const plan = normalizeMeshPlan("research rental systems", raw);
  assert.equal(plan.initialStepId, "collect_data");
  assert.equal(plan.steps[0].title, "Collect Data");
});

test("unwrapRawMeshPlan accepts vendor-specific planner keys like fsmExecutionPlan", () => {
  const raw = unwrapRawMeshPlan({
    fsmExecutionPlan: [
      {
        id: "collect_market_data",
        title: "Collect Market Data",
        ownerRole: "researcher",
        successCriteria: "Collect current market data",
        nextStepOnSuccess: null,
        nextStepOnFailure: null,
      },
    ],
  } as any);

  const plan = normalizeMeshPlan("research rental systems", raw);
  assert.equal(plan.initialStepId, "collect_market_data");
  assert.equal(plan.steps[0].title, "Collect Market Data");
});

test("unwrapRawMeshPlan recursively finds nested planner arrays", () => {
  const raw = unwrapRawMeshPlan({
    wrapper: {
      payload: {
        executionPlan: [
          {
            id: "review_output",
            title: "Review Output",
            ownerRole: "reviewer",
            successCriteria: "Review the draft",
            nextStepOnSuccess: null,
            nextStepOnFailure: null,
          },
        ],
      },
    },
  } as any);

  const plan = normalizeMeshPlan("research rental systems", raw);
  assert.equal(plan.initialStepId, "review_output");
  assert.equal(plan.steps[0].ownerRole, "reviewer");
});

test("normalizeMeshPlan tolerates malformed planner steps and fills safe defaults", () => {
  const plan = normalizeMeshPlan("research rental systems", {
    initialStepId: "missing_step",
    steps: [
      {
        id: "define_scope",
        ownerRole: "researcher",
        nextStepOnSuccess: "missing_fields",
      },
      {
        id: "define_scope",
        title: "  ",
        ownerRole: null,
        successCriteria: null,
        expectedArtifact: "draft.md",
        nextStepOnFailure: "define_scope",
      },
      null,
    ],
  } as any);

  assert.equal(plan.initialStepId, "define_scope");
  assert.equal(plan.steps[0].title, "Step 1");
  assert.equal(plan.steps[0].successCriteria, "Complete Step 1");
  assert.equal(plan.steps[1].id, "define_scope_2");
  assert.equal(plan.steps[1].ownerRole, "specialist");
  assert.equal(plan.steps[1].successCriteria, "Produce draft.md");
  assert.equal(plan.steps[0].nextStepOnSuccess, null);
});

test("getMeshRoutingDecision requires an explicit approved or rejected marker", () => {
  assert.equal(getMeshRoutingDecision("Final report complete. [APPROVED]"), "approved");
  assert.equal(getMeshRoutingDecision("Missing evidence. [REJECTED]"), "rejected");
  assert.equal(getMeshRoutingDecision("Final report complete."), "invalid");
  assert.equal(getMeshRoutingDecision("Conflicting output [APPROVED] and [REJECTED]"), "invalid");
});

test("stripMeshRoutingMarkers removes workflow control markers from artifact text", () => {
  assert.equal(
    stripMeshRoutingMarkers("Executive summary here.\n\n[APPROVED]"),
    "Executive summary here.",
  );
  assert.equal(
    stripMeshRoutingMarkers("[REJECTED] Missing citations"),
    "Missing citations",
  );
});

test("buildMeshPlannerInstructions forbids same-step failure loops", () => {
  const instructions = buildMeshPlannerInstructions("research rental systems", 5);

  assert.match(
    instructions.prompt,
    /Do NOT route nextStepOnFailure back to the same step/i,
  );
  assert.match(
    instructions.prompt,
    /Every non-final step should define a non-null nextStepOnFailure/i,
  );
  assert.match(
    instructions.prompt,
    /start with a scope\/query-strategy step before raw data collection/i,
  );
});

test("buildMeshModelAttemptOrder rotates the pool around the preferred model", () => {
  assert.deepEqual(
    buildMeshModelAttemptOrder(
      ["alibaba:qwen3.6-plus", "google:gemini-2.5-flash", "mistral:mistral-large-latest"],
      "google:gemini-2.5-flash",
    ),
    ["google:gemini-2.5-flash", "mistral:mistral-large-latest", "alibaba:qwen3.6-plus"],
  );
});

test("isRetryableMeshModelError detects provider rate limiting", () => {
  assert.equal(
    isRetryableMeshModelError(new Error("Upstream error from Alibaba: Request rate increased too quickly.")),
    true,
  );
});

test("isRetryableMeshModelError detects provider credit exhaustion and token budget errors", () => {
  assert.equal(
    isRetryableMeshModelError(new Error("This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 21091.")),
    true,
  );
});

test("isRetryableMeshModelError ignores local coding errors", () => {
  assert.equal(
    isRetryableMeshModelError(new Error("Cannot read properties of undefined (reading 'trim')")),
    false,
  );
});

test("isRetryableMeshModelError accepts mesh step errors explicitly flagged as retryable", () => {
  const error = new Error("Mesh worker returned an empty response for step \"Validate Research Accuracy\".");
  (error as any).retryableMeshModelError = true;

  assert.equal(isRetryableMeshModelError(error), true);
});

test("canAutoRecoverRejectedStep allows one automatic retry for research dead-ends with no results", () => {
  assert.equal(
    canAutoRecoverRejectedStep(
      {
        id: "collect_kenya_rms_data",
        title: "Collect Kenya RMS Data",
        ownerRole: "researcher",
        successCriteria: "Identify at least 5 active rental management systems in Kenya",
        expectedArtifact: "raw_research_findings.md",
        nextStepOnSuccess: "filter_and_analyze_systems",
        nextStepOnFailure: null,
      },
      "The automated research retrieval for this step yielded zero usable data. All three targeted search queries returned no results. Query expansion is required.",
      1,
    ),
    true,
  );
});

test("canAutoRecoverRejectedStep stops after the first automatic retry", () => {
  assert.equal(
    canAutoRecoverRejectedStep(
      {
        id: "collect_kenya_rms_data",
        title: "Collect Kenya RMS Data",
        ownerRole: "researcher",
        successCriteria: "Identify at least 5 active rental management systems in Kenya",
        expectedArtifact: "raw_research_findings.md",
        nextStepOnSuccess: "filter_and_analyze_systems",
        nextStepOnFailure: null,
      },
      "No results found; broader discovery is required.",
      2,
    ),
    false,
  );
});
