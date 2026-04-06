import { generateObject } from "ai";
import { z } from "zod";
import type { AgentRuntime } from "../agent/runtime";
import type { ActiveModelState } from "../core/modelState";
import type { ProviderRouter } from "../core/providerRouter";
import type { MeshPlan, MeshPlanStep, RuntimeConfig, SwarmRole } from "../core/types";
import { DefaultMemoryService } from "../memory/service";
import type { SessionService } from "../sessions/service";
import type { SwarmCoordinator } from "../swarm/coordinator";

const meshPlanSchema = z.object({
  goal: z.string(),
  initialStepId: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    ownerRole: z.string(),
    successCriteria: z.string(),
    expectedArtifact: z.string().nullable().optional(),
    nextStepOnSuccess: z.string().nullable(),
    nextStepOnFailure: z.string().nullable(),
  })),
});

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
- If creating a review loop, point the reviewer's nextStepOnFailure back to the creator's step ID.
- Keep the plan implementation-oriented.
- Output JSON only.

Goal: ${goal}
`,
  };
}

function createWorkflowId() {
  return `workflow:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildArtifactsSummary(artifacts: Array<{ title: string; role: SwarmRole; summary: string }>) {
  if (artifacts.length === 0) {
    return "No prior workflow outputs.";
  }

  return artifacts
    .map((artifact) => `[${artifact.role.toUpperCase()} :: ${artifact.title}]\n${artifact.summary}`)
    .join("\n\n");
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

  async planWorkflow(goal: string, modelId: string): Promise<MeshPlan> {
    const instructions = buildMeshPlannerInstructions(goal, this.runtimeConfig.mesh.maxSteps);
    const result = await generateObject({
      model: this.providerRouter.resolveChatModel(modelId),
      schema: meshPlanSchema,
      system: instructions.system,
      prompt: instructions.prompt,
    });

    const plan = result.object as MeshPlan;
    if (plan.steps.length === 0) {
      throw new Error("Mesh planner returned no steps.");
    }
    return plan;
  }

  async runGoal(goal: string, options?: {
    reportProgress?: (message: string) => Promise<void> | void;
  }) {
    const reportProgress = options?.reportProgress ?? (async () => {});
    const modelId = this.modelState.getCurrentModel();
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
    const plan = await this.planWorkflow(goal, modelId);

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
    let finalStatus = "completed";

    while (currentStepId && loopCount < MAX_LOOPS) {
      loopCount++;
      const step = stepMap.get(currentStepId);
      if (!step) {
         await reportProgress(`Routing error: Unknown step "${currentStepId}". Aborting.`);
         finalStatus = "failed";
         break;
      }

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
        const { session, result } = await this.swarm.runRoleTask({
          role: step.ownerRole,
          goal: `${goal}\n\nCurrent step iteration: ${loopCount}\nSuccess criteria: ${step.successCriteria}\nExpected artifact: ${step.expectedArtifact ?? "Not specified"}\n\nPrior working artifacts for context:\n${buildArtifactsSummary(artifacts)}`,
          deliverable: step.expectedArtifact ?? step.successCriteria,
          parentSessionId: workflowSession.id,
          metadata: { workflowId, stepId: step.id, loopCount },
        });

        const textLower = result.text.toLowerCase();
        let wasRejected = false;
        if (textLower.includes("[rejected]") || textLower.includes("rejected]")) {
           wasRejected = true;
        } else if (textLower.includes("[approved]") || textLower.includes("approved]")) {
           wasRejected = false;
        }

        artifacts.push({
          id: step.id,
          title: step.title,
          role: step.ownerRole,
          summary: result.text,
        });

        this.memory.updateWorkflowStep(stepRecordId, {
          status: wasRejected ? "failed" : "completed",
          outputSessionId: session.id,
          resultSummary: result.text, // Store the iteration's exact response locally
        });

        if (wasRejected) {
           await reportProgress(`Step REJECTED: ${step.title}`);
           currentStepId = step.nextStepOnFailure;
        } else {
           await reportProgress(`Step APPROVED: ${step.title}`);
           currentStepId = step.nextStepOnSuccess;
        }

      } catch (error: any) {
        this.memory.updateWorkflowStep(stepRecordId, {
          status: "failed",
          resultSummary: error?.message || String(error),
        });
        await reportProgress(`Step ${step.id} violently failed: ${error?.message || String(error)}`);
        finalStatus = "failed";
        break;
      }
    }

    if (loopCount >= MAX_LOOPS) {
      await reportProgress(`Max iterations (${MAX_LOOPS}) reached safely terminating loop early.`);
      finalStatus = "partial";
    }

    this.memory.updateWorkflowRun(workflowId, {
      status: finalStatus,
      metadata: { plan, artifacts },
    });

    const finalArtifact = artifacts.length > 0 ? artifacts[artifacts.length - 1].summary : "Mesh completed with no output.";
    await reportProgress(`Mesh workflow finished with status: ${finalStatus}`);

    return {
      workflowId,
      modelUsed: modelId,
      status: finalStatus,
      summary: finalArtifact, // Must return final deliverable directly
      plan,
      artifacts,
    };
  }
}
