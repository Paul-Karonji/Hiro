import { getAppContext } from "../core/appContext";
import type { MeshPlan, SwarmRole } from "../core/types";

type MeshArtifactSummary = {
  id: string;
  title: string;
  role: SwarmRole;
  summary: string;
};

type MeshRunResult = {
  workflowId: string;
  modelUsed: string;
  status: "completed" | "failed" | "partial";
  summary: string;
  plan: MeshPlan;
  artifacts: MeshArtifactSummary[];
};

export function buildMeshSessionDocument(input: {
  goal: string;
  defaultDriverModel: string;
  result: MeshRunResult;
}) {
  const planLines = input.result.plan.steps.map((step, index) => [
    `${index + 1}. ${step.title}`,
    `   role: ${step.ownerRole}`,
    `   success criteria: ${step.successCriteria}`,
    `   expected artifact: ${step.expectedArtifact ?? "Not specified"}`,
    `   on success: ${step.nextStepOnSuccess ?? "end"}`,
    `   on failure: ${step.nextStepOnFailure ?? "stop"}`,
  ].join("\n"));

  const artifactLines = input.result.artifacts.length > 0
    ? input.result.artifacts.map((artifact, index) => [
        `## Artifact ${index + 1}: ${artifact.title}`,
        `Role: ${artifact.role}`,
        "",
        artifact.summary,
      ].join("\n"))
    : ["No workflow artifacts were stored."];

  return [
    "# Mesh Workflow Record",
    "",
    `Goal: ${input.goal}`,
    `Workflow ID: ${input.result.workflowId}`,
    `Status: ${input.result.status}`,
    `Planner model: ${input.result.modelUsed}`,
    `Default driver model after mesh: ${input.defaultDriverModel}`,
    "",
    "## Final Output",
    "",
    input.result.summary || "Mesh completed with no final output.",
    "",
    "## Plan",
    "",
    ...planLines,
    "",
    "## Artifact Summaries",
    "",
    ...artifactLines,
  ].join("\n");
}

export function buildMeshResultMessage(input: {
  goal: string;
  defaultDriverModel: string;
  result: MeshRunResult;
}) {
  return [
    "[Mesh result]",
    `Goal: ${input.goal}`,
    `Workflow ID: ${input.result.workflowId}`,
    `Status: ${input.result.status}`,
    `Planner model: ${input.result.modelUsed}`,
    `Default driver model remains: ${input.defaultDriverModel}`,
    "",
    input.result.summary || "Mesh completed with no final output.",
  ].join("\n");
}

export function persistMeshRequestToSession(input: {
  sessionId: string;
  goal: string;
  defaultDriverModel: string;
}) {
  getAppContext().memory.addMessage("user", `[Mesh request]\nGoal: ${input.goal}`, {
    sessionId: input.sessionId,
    metadata: {
      source: "mesh_request",
      defaultDriverModel: input.defaultDriverModel,
    },
  });
}

export function persistMeshResultToSession(input: {
  sessionId: string;
  goal: string;
  defaultDriverModel: string;
  result: MeshRunResult;
}) {
  const app = getAppContext();
  const recordContent = buildMeshSessionDocument({
    goal: input.goal,
    defaultDriverModel: input.defaultDriverModel,
    result: input.result,
  });

  app.memory.addMessage("model", buildMeshResultMessage({
    goal: input.goal,
    defaultDriverModel: input.defaultDriverModel,
    result: input.result,
  }), {
    sessionId: input.sessionId,
    modelUsed: input.defaultDriverModel,
    metadata: {
      source: "mesh_result",
      workflowId: input.result.workflowId,
      workflowStatus: input.result.status,
      meshPlannerModel: input.result.modelUsed,
      artifactCount: input.result.artifacts.length,
    },
  });

  app.memory.addDocument({
    sessionId: input.sessionId,
    filename: `mesh-${input.result.workflowId}.md`,
    mediaType: "text/markdown",
    content: recordContent,
    metadata: {
      source: "mesh_result",
      workflowId: input.result.workflowId,
      workflowStatus: input.result.status,
      meshPlannerModel: input.result.modelUsed,
      defaultDriverModel: input.defaultDriverModel,
    },
  });
}

export function persistMeshFailureToSession(input: {
  sessionId: string;
  goal: string;
  defaultDriverModel: string;
  errorMessage: string;
}) {
  getAppContext().memory.addMessage("model", [
    "[Mesh failure]",
    `Goal: ${input.goal}`,
    `Default driver model remains: ${input.defaultDriverModel}`,
    "",
    input.errorMessage,
  ].join("\n"), {
    sessionId: input.sessionId,
    modelUsed: input.defaultDriverModel,
    metadata: {
      source: "mesh_failure",
      defaultDriverModel: input.defaultDriverModel,
    },
  });
}
