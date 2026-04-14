import { generateObject } from "ai";
import { z } from "zod";
import type { AgentRuntime } from "../agent/runtime";
import type { ActiveModelState } from "../core/modelState";
import type { ProviderRouter } from "../core/providerRouter";
import type { MeshPlan, MeshPlanStep, RuntimeConfig, SwarmRole } from "../core/types";
import { DefaultMemoryService } from "../memory/service";
import { PRIMARY_SESSION_ID } from "../memory/sqlite";
import type { SessionService } from "../sessions/service";
import type { SwarmCoordinator } from "../swarm/coordinator";
import { considerSkillCreation } from "../tools/skills";

const rawMeshStepSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  ownerRole: z.string().trim().min(1),
  successCriteria: z.string().trim().min(1),
  expectedArtifact: z.string().trim().min(1).nullable().optional(),
  nextStepOnSuccess: z.string().trim().min(1).nullable().optional(),
  nextStepOnFailure: z.string().trim().min(1).nullable().optional(),
  parallelWith: z.array(z.string()).optional(),
});

const rawMeshStepArraySchema = z.array(rawMeshStepSchema).min(1);

const rawMeshPlanSchema = z.object({
  goal: z.string().trim().min(1).optional(),
  initialStepId: z.string().trim().min(1).optional(),
  steps: rawMeshStepArraySchema,
});

const meshPlanSchema = z.union([
  rawMeshPlanSchema,
  z.object({ fsm_plan: rawMeshPlanSchema }),
  z.object({ mesh_plan: rawMeshPlanSchema }),
  z.object({ plan: rawMeshPlanSchema }),
  z.object({ workflow: rawMeshPlanSchema }),
]);

type RawMeshPlan = z.infer<typeof rawMeshPlanSchema>;
type RawMeshPlanEnvelope = z.infer<typeof meshPlanSchema> | z.infer<typeof rawMeshStepArraySchema>;
type RawMeshStepLike = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlannerStepId(rawId: unknown, index: number) {
  return coerceTrimmedString(rawId) ?? `step_${index + 1}`;
}

function normalizePlannerStepTitle(rawTitle: unknown, index: number) {
  return coerceTrimmedString(rawTitle) ?? `Step ${index + 1}`;
}

function normalizePlannerStepRole(rawRole: unknown) {
  return coerceTrimmedString(rawRole) ?? "specialist";
}

function normalizePlannerSuccessCriteria(rawCriteria: unknown, title: string, expectedArtifact: string | null) {
  return coerceTrimmedString(rawCriteria)
    ?? (expectedArtifact ? `Produce ${expectedArtifact}` : `Complete ${title}`);
}

function normalizePlannerOptionalString(value: unknown) {
  const normalized = coerceTrimmedString(value);
  if (!normalized) {
    return null;
  }

  if (/^(null|none|end|done)$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function looksLikePlannerStep(value: unknown): value is RawMeshStepLike {
  if (!isRecord(value)) {
    return false;
  }

  return ["id", "title", "ownerRole", "successCriteria", "expectedArtifact"].some((key) => key in value);
}

function looksLikePlannerStepArray(value: unknown): value is RawMeshStepLike[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => looksLikePlannerStep(item));
}

function extractMeshPlanCandidate(value: unknown, depth = 0): RawMeshPlan | null {
  if (depth > 4) {
    return null;
  }

  if (looksLikePlannerStepArray(value)) {
    return { steps: value as any };
  }

  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.steps)) {
    return {
      goal: typeof value.goal === "string" ? value.goal : undefined,
      initialStepId: typeof value.initialStepId === "string" ? value.initialStepId : undefined,
      steps: value.steps as any,
    };
  }

  const prioritizedKeys = [
    "fsm_plan",
    "mesh_plan",
    "plan",
    "workflow",
    "fsmExecutionPlan",
    "meshExecutionPlan",
    "executionPlan",
    "workflowPlan",
    "workflowSteps",
    "steps",
    "nodes",
  ];

  for (const key of prioritizedKeys) {
    if (!(key in value)) {
      continue;
    }

    const extracted = extractMeshPlanCandidate(value[key], depth + 1);
    if (extracted) {
      return {
        goal: extracted.goal ?? (typeof value.goal === "string" ? value.goal : undefined),
        initialStepId: extracted.initialStepId ?? (typeof value.initialStepId === "string" ? value.initialStepId : undefined),
        steps: extracted.steps,
      };
    }
  }

  for (const nestedValue of Object.values(value)) {
    const extracted = extractMeshPlanCandidate(nestedValue, depth + 1);
    if (extracted) {
      return {
        goal: extracted.goal ?? (typeof value.goal === "string" ? value.goal : undefined),
        initialStepId: extracted.initialStepId ?? (typeof value.initialStepId === "string" ? value.initialStepId : undefined),
        steps: extracted.steps,
      };
    }
  }

  return null;
}

export function unwrapRawMeshPlan(input: RawMeshPlanEnvelope | Record<string, unknown>): RawMeshPlan {
  const extracted = extractMeshPlanCandidate(input);
  if (extracted) {
    return extracted;
  }

  throw new Error("Mesh planner response did not contain a usable plan object.");
}

function parseFallbackMeshPlan(error: unknown): RawMeshPlan | null {
  const directValue = (error as any)?.value;
  if (Array.isArray(directValue) || isRecord(directValue)) {
    try {
      return unwrapRawMeshPlan(directValue);
    } catch {
      // Fall through to text parsing.
    }
  }

  const text = typeof (error as any)?.text === "string" ? (error as any).text : null;
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return unwrapRawMeshPlan(parsed);
    }

    if (isRecord(parsed)) {
      return unwrapRawMeshPlan(parsed);
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeRouteTarget(target: string | null | undefined, stepIds: Set<string>) {
  if (!target) {
    return null;
  }

  const normalized = target.trim();
  if (!normalized) {
    return null;
  }

  return stepIds.has(normalized) ? normalized : null;
}

export function normalizeMeshPlan(goal: string, rawPlan: RawMeshPlan): MeshPlan {
  const rawSteps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const seenIds = new Map<string, number>();
  const steps = rawSteps
    .map((step, index) => {
      const stepRecord: Record<string, unknown> = isRecord(step) ? step : {};
      const expectedArtifact = normalizePlannerOptionalString(stepRecord.expectedArtifact);
      const baseId = normalizePlannerStepId(stepRecord.id, index);
      const duplicateCount = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, duplicateCount + 1);
      const id = duplicateCount === 0 ? baseId : `${baseId}_${duplicateCount + 1}`;
      const title = normalizePlannerStepTitle(stepRecord.title, index);

      const rawParallelWith = Array.isArray(stepRecord.parallelWith) ? stepRecord.parallelWith : [];
      const parallelWith = rawParallelWith
        .map((s: unknown) => coerceTrimmedString(s))
        .filter((s): s is string => s !== null);

      return {
        id,
        title,
        ownerRole: normalizePlannerStepRole(stepRecord.ownerRole),
        successCriteria: normalizePlannerSuccessCriteria(stepRecord.successCriteria, title, expectedArtifact),
        expectedArtifact,
        nextStepOnSuccess: normalizePlannerOptionalString(stepRecord.nextStepOnSuccess),
        nextStepOnFailure: normalizePlannerOptionalString(stepRecord.nextStepOnFailure),
        parallelWith: parallelWith.length > 0 ? parallelWith : undefined,
      };
    })
    .filter((step) => step.id && step.title && step.ownerRole && step.successCriteria);

  if (steps.length === 0) {
    throw new Error("Mesh planner returned no steps.");
  }

  const stepIds = new Set<string>(steps.map((step) => step.id));

  const normalizedSteps: MeshPlanStep[] = steps.map((step) => ({
    ...step,
    nextStepOnSuccess: normalizeRouteTarget(step.nextStepOnSuccess, stepIds),
    nextStepOnFailure: normalizeRouteTarget(step.nextStepOnFailure, stepIds),
    parallelWith: step.parallelWith
      ? step.parallelWith.filter((id) => stepIds.has(id) && id !== step.id)
      : undefined,
  }));

  const requestedInitialStepId = coerceTrimmedString(rawPlan.initialStepId) || null;
  const initialStepId = requestedInitialStepId && stepIds.has(requestedInitialStepId)
    ? requestedInitialStepId
    : normalizedSteps[0].id;

  return {
    goal: coerceTrimmedString(rawPlan.goal) || goal,
    initialStepId,
    steps: normalizedSteps,
  };
}

export function buildMeshPlannerInstructions(goal: string, maxSteps: number) {
  return {
    system: [
      "You are an FSM workflow planner.",
      "Break the goal into bounded steps that can route back and forth between each other.",
      "Return only valid JSON that matches the requested schema.",
      "Your entire response must be JSON with no markdown, no prose, and no code fences.",
    ].join(" "),
    prompt: `
Create an FSM execution plan for the following goal.
- Return the answer as a JSON object.
- Use between 1 and ${maxSteps} unique step definitions.
- Each step must have a stable id, short title, an ownerRole (choose any dynamic role label like 'writer', 'reviewer', 'editor', 'coder', etc), successCriteria, and expectedArtifact.
- Use nextStepOnSuccess and nextStepOnFailure to route the task. If a step is the final step, set nextStepOnSuccess to null string to end the workflow.
- Every non-final step should define a non-null nextStepOnFailure that routes to a corrective or recovery step instead of stopping immediately.
- If creating a review loop, point the reviewer's nextStepOnFailure back to the creator's step ID.
- Do NOT route nextStepOnFailure back to the same step unless the step has a clearly different retry strategy. Prefer routing to an earlier corrective step or to null when repeated failure should stop the workflow.
- For research, discovery, or investigation goals, start with a scope/query-strategy step before raw data collection, and ensure collection failures route to query expansion, source discovery, or another corrective step.
- If two or more steps are fully independent of each other (no output from one is required by the other), you MAY set "parallelWith" on each such step to an array of the IDs of its concurrent siblings. Steps with parallelWith will run at the same time. Do not use parallelWith when steps depend on each other's output.
- Keep the plan implementation-oriented.
- Output JSON only.

Goal: ${goal}
`,
  };
}

function createWorkflowId() {
  return `workflow:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function getMeshRoutingDecision(text: string): "approved" | "rejected" | "invalid" {
  const textLower = text.toLowerCase();
  const hasRejected = textLower.includes("[rejected]") || textLower.includes("rejected]");
  const hasApproved = textLower.includes("[approved]") || textLower.includes("approved]");

  if (hasApproved === hasRejected) {
    return "invalid";
  }

  return hasRejected ? "rejected" : "approved";
}

export function stripMeshRoutingMarkers(text: string) {
  return text.replace(/\[(approved|rejected)\]/gi, "").trim();
}

function buildArtifactsSummary(artifacts: Array<{ title: string; role: SwarmRole; summary: string }>) {
  if (artifacts.length === 0) {
    return "No prior workflow outputs.";
  }

  return artifacts
    .map((artifact) => `[${artifact.role.toUpperCase()} :: ${artifact.title}]\n${artifact.summary}`)
    .join("\n\n");
}

function summarizeRejectionReason(text: string) {
  const cleaned = stripMeshRoutingMarkers(text).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "No rejection reason was provided.";
  }

  return cleaned.slice(0, 240);
}

function buildMeshTerminalSummary(input: {
  status: "completed" | "failed" | "partial";
  finalArtifact: string | null;
  terminalMessage: string | null;
}) {
  if (input.status === "completed") {
    return input.finalArtifact || "Mesh completed with no output.";
  }

  if (input.terminalMessage) {
    return input.terminalMessage;
  }

  if (input.finalArtifact) {
    return input.finalArtifact;
  }

  return `Mesh ended with status: ${input.status}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isResearchRecoveryCandidate(step: MeshPlanStep) {
  const haystack = [
    step.id,
    step.title,
    step.ownerRole,
    step.successCriteria,
    step.expectedArtifact ?? "",
  ].join(" ");

  return /\b(research|collect|data|search|market|discovery|scope|query)\b/i.test(haystack);
}

export function canAutoRecoverRejectedStep(step: MeshPlanStep, rejectionReason: string, rejectionCount: number) {
  if (rejectionCount > 1) {
    return false;
  }

  if (!isResearchRecoveryCandidate(step)) {
    return false;
  }

  return /\b(no results|zero usable data|insufficient|source material|query expansion|broaden|rephrase|search input|current search|vendor|discovery|not enough evidence)\b/i
    .test(rejectionReason);
}

function isReviewStepRole(role: string) {
  return /review|evaluator/i.test(role);
}

function createRetryableMeshModelError(message: string) {
  const error = new Error(message);
  (error as any).retryableMeshModelError = true;
  return error;
}

const RETRYABLE_MESH_MODEL_ERROR_PATTERNS = [
  /request rate increased too quickly/i,
  /rate limit/i,
  /too many requests/i,
  /upstream error/i,
  /requires more credits/i,
  /insufficient credits/i,
  /insufficient balance/i,
  /upgrade to a paid account/i,
  /quota exceeded/i,
  /billing/i,
  /max_tokens/i,
  /maximum context length/i,
  /context length/i,
  /context window/i,
  /token limit/i,
  /requested up to \d+ tokens/i,
  /can only afford \d+/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /timed out/i,
  /timeout/i,
  /overloaded/i,
  /connection reset/i,
  /socket hang up/i,
  /econnreset/i,
  /network error/i,
  /\b429\b/i,
  /\b502\b/i,
  /\b503\b/i,
  /bad gateway/i,
  /failed after \d+ attempts/i,
  /openai_error/i,
  /provider error/i,
  /internal server error/i,
  /\b500\b/i,
  /invalid character.*looking for beginning/i,
  /invalid json response/i,
  /unexpected token.*json/i,
  /json parse error/i,
];

const RETRYABLE_MESH_PLANNER_ERROR_PATTERNS = [
  /no object generated/i,
  /response did not match schema/i,
  /type validation failed/i,
  /invalid json response/i,
];

export function buildMeshModelAttemptOrder(modelPool: string[], preferredModelId: string) {
  const normalizedPool = unique(modelPool);
  if (!normalizedPool.includes(preferredModelId)) {
    return [preferredModelId, ...normalizedPool];
  }

  const startIndex = normalizedPool.indexOf(preferredModelId);
  return [
    ...normalizedPool.slice(startIndex),
    ...normalizedPool.slice(0, startIndex),
  ];
}

export function isRetryableMeshModelError(error: unknown) {
  if ((error as any)?.retryableMeshModelError === true) {
    return true;
  }

  // Treat any error whose name is a known provider error type as retryable
  const errorName = (error as any)?.name;
  if (typeof errorName === "string" && /openai_error|api_error|provider_error|APICallError/i.test(errorName)) {
    return true;
  }

  const haystack = [
    (error as any)?.name,
    (error as any)?.message,
    (error as any)?.cause?.message,
    (error as any)?.cause?.error?.message,
    (error as any)?.cause?.value?.message,
    (error as any)?.cause?.value?.error?.message,
    (error as any)?.responseBody,
    (error as any)?.text,
  ]
    .filter(Boolean)
    .join("\n");

  return RETRYABLE_MESH_MODEL_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

function isRetryableMeshPlannerError(error: unknown) {
  if (isRetryableMeshModelError(error)) {
    return true;
  }

  const haystack = [
    (error as any)?.name,
    (error as any)?.message,
    (error as any)?.cause?.message,
    (error as any)?.text,
  ]
    .filter(Boolean)
    .join("\n");

  return RETRYABLE_MESH_PLANNER_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

export class MeshWorkflowService {
  constructor(
    private readonly runtime: AgentRuntime,
    private readonly sessions: SessionService,
    private readonly swarm: SwarmCoordinator,
    private readonly memory: DefaultMemoryService,
    private readonly providerRouter: ProviderRouter,
    private readonly modelState: ActiveModelState,
    private readonly runtimeConfig: RuntimeConfig,
  ) {}

  private async planWorkflowOnce(goal: string, modelId: string): Promise<MeshPlan> {
    const instructions = buildMeshPlannerInstructions(goal, this.runtimeConfig.mesh.maxSteps);
    try {
      const result = await generateObject({
        model: this.providerRouter.resolveChatModel(modelId),
        schema: meshPlanSchema,
        system: instructions.system,
        prompt: instructions.prompt,
      });

      return normalizeMeshPlan(goal, unwrapRawMeshPlan(result.object as RawMeshPlanEnvelope));
    } catch (error: any) {
      const fallbackPlan = parseFallbackMeshPlan(error);
      if (!fallbackPlan) {
        throw error;
      }

      console.warn("[Mesh] Planner response missed the strict schema envelope; recovering from raw JSON text.");
      return normalizeMeshPlan(goal, fallbackPlan);
    }
  }

  async planWorkflow(goal: string, candidateModelIds: string[], options?: {
    reportProgress?: (message: string) => Promise<void> | void;
  }): Promise<{ plan: MeshPlan; modelUsed: string }> {
    const reportProgress = options?.reportProgress ?? (async () => {});
    const attemptOrder = unique(candidateModelIds);
    let lastError: unknown = null;
    const attemptedModels: string[] = [];

    for (let index = 0; index < attemptOrder.length; index++) {
      const modelId = attemptOrder[index]!;
      attemptedModels.push(modelId);

      try {
        const plan = await this.planWorkflowOnce(goal, modelId);
        return { plan, modelUsed: modelId };
      } catch (error) {
        lastError = error;
        const nextModelId = attemptOrder[index + 1] ?? null;
        if (!nextModelId || !isRetryableMeshPlannerError(error)) {
          break;
        }

        await reportProgress(`Model failover: planner failed on ${modelId}. Retrying with ${nextModelId}.`);
      }
    }

    if (attemptedModels.length > 1) {
      const message = (lastError as any)?.message || String(lastError);
      throw new Error(`Mesh planning failed after trying ${attemptedModels.join(", ")}. Last error: ${message}`);
    }

    throw lastError;
  }

  private resolveCollaborationModels(activeModelId: string) {
    const candidates = unique([
      ...(this.runtimeConfig.mesh.collaborationModels ?? []),
      activeModelId,
    ]);

    const valid = candidates.filter((modelId) => this.providerRouter.validateModelSelection(modelId).ok);
    return valid.length > 0 ? valid : [activeModelId];
  }

  private pickCollaborationModel(modelPool: string[], loopCount: number) {
    if (modelPool.length === 0) {
      throw new Error("Mesh collaboration model pool is empty.");
    }

    return modelPool[(loopCount - 1) % modelPool.length] ?? modelPool[0];
  }

  private async runStepWithModelFailover(input: {
    workflowId: string;
    goal: string;
    workflowSessionId: string;
    step: MeshPlanStep;
    loopCount: number;
    artifacts: Array<{ id: string; title: string; role: SwarmRole; summary: string }>;
    collaborationModels: string[];
    reportProgress: (message: string) => Promise<void> | void;
  }) {
    const preferredModel = this.pickCollaborationModel(input.collaborationModels, input.loopCount);
    const attemptOrder = buildMeshModelAttemptOrder(input.collaborationModels, preferredModel);
    let lastError: unknown = null;
    const attemptedModels: string[] = [];

    for (let index = 0; index < attemptOrder.length; index++) {
      const assignedModel = attemptOrder[index]!;
      attemptedModels.push(assignedModel);

      try {
        const { session, result } = await this.swarm.runRoleTask({
          role: input.step.ownerRole,
          goal: `${input.goal}\n\nCurrent step iteration: ${input.loopCount}\nSuccess criteria: ${input.step.successCriteria}\nExpected artifact: ${input.step.expectedArtifact ?? "Not specified"}\n\nPrior working artifacts for context:\n${buildArtifactsSummary(input.artifacts)}`,
          deliverable: input.step.expectedArtifact ?? input.step.successCriteria,
          parentSessionId: input.workflowSessionId,
          modelOverride: assignedModel,
          metadata: {
            workflowId: input.workflowId,
            stepId: input.step.id,
            loopCount: input.loopCount,
            collaborationModelPool: input.collaborationModels,
            assignedModel,
            attemptedModels,
          },
        });

        const resultText = typeof result.text === "string" ? result.text.trim() : "";
        if (!resultText || /^no response generated\.?$/i.test(resultText)) {
          throw createRetryableMeshModelError(`Mesh worker returned an empty response for step "${input.step.title}".`);
        }

        if (isReviewStepRole(input.step.ownerRole) && getMeshRoutingDecision(resultText) === "invalid") {
          throw createRetryableMeshModelError(`Review worker omitted an approval or rejection decision for step "${input.step.title}".`);
        }

        return { session, result, assignedModel, attemptedModels: [...attemptedModels] };
      } catch (error) {
        lastError = error;
        const nextModelId = attemptOrder[index + 1] ?? null;
        if (!nextModelId || !isRetryableMeshModelError(error)) {
          break;
        }

        await input.reportProgress(`Model failover: step "${input.step.title}" failed on ${assignedModel}. Retrying with ${nextModelId}.`);
      }
    }

    if (attemptedModels.length > 1) {
      const message = (lastError as any)?.message || String(lastError);
      throw new Error(`All eligible mesh models failed for step "${input.step.title}" after trying ${attemptedModels.join(", ")}. Last error: ${message}`);
    }

    throw lastError;
  }

  async runGoal(goal: string, options?: {
    reportProgress?: (message: string) => Promise<void> | void;
  }) {
    const reportProgress = options?.reportProgress ?? (async () => {});
    const modelId = this.modelState.getCurrentModel();
    const collaborationModels = this.resolveCollaborationModels(modelId);
    const workflowId = createWorkflowId();
    const workflowSession = this.sessions.createSession({
      id: `system:mesh:${workflowId}`,
      title: `Mesh Workflow ${workflowId}`,
      type: "system",
      status: "active",
      modelOverride: modelId,
      instructions: "You coordinate mesh workflows and persist progress.",
      metadata: { workflowId },
    });

    await reportProgress(`Planning mesh workflow for: ${goal}`);
    const planningModels = buildMeshModelAttemptOrder(collaborationModels, modelId);
    const { plan } = await this.planWorkflow(goal, planningModels, { reportProgress });

    this.memory.createWorkflowRun({
      id: workflowId,
      goal,
      status: "planned",
      modelUsed: modelId,
      sessionId: workflowSession.id,
      metadata: { plan },
    });

    plan.steps.forEach((step, index) => {
      this.memory.createWorkflowStep({
        id: `${workflowId}:${step.id}`,
        workflowId,
        stepOrder: index + 1,
        title: step.title,
        ownerRole: step.ownerRole,
        dependsOn: [], // DAG dependencies deprecated
        successCriteria: step.successCriteria,
        expectedArtifact: step.expectedArtifact ?? null,
        status: "pending",
      });
    });

    const artifacts: Array<{ id: string; title: string; role: SwarmRole; summary: string }> = [];
    this.memory.updateWorkflowRun(workflowId, { status: "in_progress", metadata: { plan } });
    await reportProgress(`Mesh FSM initialized with ${plan.steps.length} routing node(s).`);

    const stepMap = new Map<string, MeshPlanStep>();
    for (const step of plan.steps) stepMap.set(step.id, step);

    let currentStepId: string | null = plan.initialStepId;
    let loopCount = 0;
    const MAX_LOOPS = 10;
    const rejectionCounts = new Map<string, number>();
    let finalStatus: "completed" | "failed" | "partial" = "completed";
    let terminalMessage: string | null = null;

    const maxParallel = this.runtimeConfig.swarm.maxParallel;

    while (currentStepId && loopCount < MAX_LOOPS) {
      loopCount++;
      const step = stepMap.get(currentStepId);
      if (!step) {
         terminalMessage = `Mesh failed because the workflow routed to an unknown step ID: "${currentStepId}".`;
         await reportProgress(`Routing error: Unknown step "${currentStepId}". Aborting.`);
         finalStatus = "failed";
         break;
      }

      // --- Parallel execution branch ---
      const parallelSiblingIds = (step.parallelWith ?? []).filter((id) => stepMap.has(id) && id !== step.id);
      if (parallelSiblingIds.length > 0) {
        const batchSteps = [step, ...parallelSiblingIds.map((id) => stepMap.get(id)!)].slice(0, maxParallel);
        await reportProgress(`Running ${batchSteps.length} steps in parallel: ${batchSteps.map((s) => s.title).join(", ")}`);

        const batchResults = await Promise.allSettled(
          batchSteps.map((parallelStep) => {
            const stepRecordId = `${workflowId}:${parallelStep.id}:${loopCount}`;
            this.memory.createWorkflowStep({
              id: stepRecordId,
              workflowId,
              stepOrder: loopCount,
              title: `[Loop ${loopCount}] ${parallelStep.title}`,
              ownerRole: parallelStep.ownerRole,
              dependsOn: [],
              successCriteria: parallelStep.successCriteria,
              expectedArtifact: parallelStep.expectedArtifact ?? null,
              status: "in_progress",
            });
            return this.runStepWithModelFailover({
              workflowId,
              goal,
              workflowSessionId: workflowSession.id,
              step: parallelStep,
              loopCount,
              artifacts,
              collaborationModels,
              reportProgress,
            }).then((r) => ({ parallelStep, stepRecordId, ...r }));
          }),
        );

        let firstRejectedStep: MeshPlanStep | null = null;

        for (const settled of batchResults) {
          if (settled.status === "rejected") {
            firstRejectedStep = firstRejectedStep ?? step;
            await reportProgress(`Parallel step encountered an execution error.`);
            continue;
          }
          const { parallelStep, stepRecordId, session, result } = settled.value;
          const routingDecision = getMeshRoutingDecision(result.text);
          const cleanedText = stripMeshRoutingMarkers(result.text) || result.text;

          artifacts.push({ id: parallelStep.id, title: parallelStep.title, role: parallelStep.ownerRole, summary: cleanedText });
          this.memory.updateWorkflowStep(stepRecordId, {
            status: routingDecision === "rejected" ? "failed" : "completed",
            outputSessionId: session.id,
            resultSummary: cleanedText,
          });

          if (routingDecision === "rejected") {
            firstRejectedStep = firstRejectedStep ?? parallelStep;
          }
        }

        if (firstRejectedStep) {
          await reportProgress(`Parallel batch: step "${firstRejectedStep.title}" was rejected. Routing to failure path.`);
          if (!firstRejectedStep.nextStepOnFailure) {
            terminalMessage = `Mesh failed: parallel batch had a rejected step ("${firstRejectedStep.title}") with no recovery route.`;
            finalStatus = "failed";
            break;
          }
          currentStepId = firstRejectedStep.nextStepOnFailure;
        } else {
          await reportProgress(`Parallel batch APPROVED: ${batchSteps.map((s) => s.title).join(", ")}`);
          currentStepId = step.nextStepOnSuccess;
        }
        continue;
      }

      // --- Sequential execution path (original logic) ---
      const stepRecordId = `${workflowId}:${step.id}:${loopCount}`;
      
      // We save iterations as distinct workflow steps to track loop counts in history
      this.memory.createWorkflowStep({
        id: stepRecordId,
        workflowId,
        stepOrder: loopCount,
        title: `[Loop ${loopCount}] ${step.title}`,
        ownerRole: step.ownerRole,
        dependsOn: [],
        successCriteria: step.successCriteria,
        expectedArtifact: step.expectedArtifact ?? null,
        status: "in_progress",
      });

      await reportProgress(`Starting step: ${step.title} (Iteration ${loopCount})`);

      try {
        const { session, result } = await this.runStepWithModelFailover({
          workflowId,
          goal,
          workflowSessionId: workflowSession.id,
          step,
          loopCount,
          artifacts,
          collaborationModels,
          reportProgress,
        });

        const routingDecision = getMeshRoutingDecision(result.text);
        const cleanedResultText = stripMeshRoutingMarkers(result.text) || result.text;

        artifacts.push({
          id: step.id,
          title: step.title,
          role: step.ownerRole,
          summary: cleanedResultText,
        });

        if (routingDecision === "invalid") {
          this.memory.updateWorkflowStep(stepRecordId, {
            status: "failed",
            outputSessionId: session.id,
            resultSummary: cleanedResultText,
          });
          terminalMessage = `Mesh failed at step "${step.title}" because the worker returned a deliverable without an approval or rejection decision.`;
          await reportProgress(`Step ${step.title} returned no explicit routing marker. Failing workflow instead of auto-approving.`);
          finalStatus = "failed";
          break;
        }

        this.memory.updateWorkflowStep(stepRecordId, {
          status: routingDecision === "rejected" ? "failed" : "completed",
          outputSessionId: session.id,
          resultSummary: cleanedResultText,
        });

        if (routingDecision === "rejected") {
           const rejectionCount = (rejectionCounts.get(step.id) ?? 0) + 1;
           rejectionCounts.set(step.id, rejectionCount);
           const rejectionReason = summarizeRejectionReason(result.text);
           await reportProgress(`Step REJECTED: ${step.title}`);

           if (!step.nextStepOnFailure) {
             if (canAutoRecoverRejectedStep(step, rejectionReason, rejectionCount)) {
               await reportProgress(`No recovery route is defined for ${step.title}. Attempting one automatic research recovery retry using the rejection guidance.`);
               currentStepId = step.id;
               continue;
             }

             terminalMessage = `Mesh failed at step "${step.title}" with no recovery route. ${rejectionReason}`;
             await reportProgress(`No recovery route is defined for ${step.title}. Stopping workflow.`);
             finalStatus = "failed";
             break;
           }

           if (step.nextStepOnFailure === step.id && rejectionCount >= 2) {
             terminalMessage = `Mesh failed at step "${step.title}" after repeated self-loop rejections. ${rejectionReason}`;
             await reportProgress(`Step ${step.title} rejected ${rejectionCount} times with a self-loop recovery path. Stopping to avoid an unproductive loop. Reason: ${rejectionReason}`);
             finalStatus = "failed";
             break;
           }

           currentStepId = step.nextStepOnFailure;
        } else {
           rejectionCounts.delete(step.id);
           await reportProgress(`Step APPROVED: ${step.title}`);
           currentStepId = step.nextStepOnSuccess;
        }

      } catch (error: any) {
        this.memory.updateWorkflowStep(stepRecordId, {
          status: "failed",
          resultSummary: error?.message || String(error),
        });
        terminalMessage = `Mesh failed at step "${step.title}" with an execution error: ${error?.message || String(error)}`;
        await reportProgress(`Step ${step.id} violently failed: ${error?.message || String(error)}`);
        finalStatus = "failed";
        break;
      }
    }

    if (currentStepId && loopCount >= MAX_LOOPS) {
      terminalMessage = `Mesh stopped after reaching the maximum safe iteration count (${MAX_LOOPS}).`;
      await reportProgress(`Max iterations (${MAX_LOOPS}) reached safely terminating loop early.`);
      finalStatus = "partial";
    }

    this.memory.updateWorkflowRun(workflowId, {
      status: finalStatus,
      metadata: { plan, artifacts },
    });

    const finalArtifact = artifacts.length > 0 ? artifacts[artifacts.length - 1].summary : null;
    const finalSummary = buildMeshTerminalSummary({
      status: finalStatus,
      finalArtifact,
      terminalMessage,
    });
    await reportProgress(`Mesh workflow finished with status: ${finalStatus}`);

    // Auto-create skill from successful mesh workflows
    if (finalStatus === "completed" && plan.steps.length >= 3) {
      try {
        const steps = artifacts.map(a => ({
          tool: a.title,
          input: a.summary,
        }));
        
        await considerSkillCreation(
          plan.goal || "Mesh workflow task",
          steps,
          finalSummary,
          PRIMARY_SESSION_ID
        );
      } catch (error) {
        console.warn("[Mesh] Failed to auto-create skill:", error);
      }
    }

    return {
      workflowId,
      modelUsed: modelId,
      status: finalStatus,
      summary: finalSummary,
      plan,
      artifacts,
    };
  }
}
