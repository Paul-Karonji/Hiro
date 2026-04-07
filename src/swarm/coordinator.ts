import type { AgentRuntime } from "../agent/runtime";
import type { RuntimeConfig, SwarmRole, SwarmRunResult } from "../core/types";
import type { SessionService } from "../sessions/service";

const DEFAULT_TOOL_ALLOWLIST = [
  "get_current_time",
  "search_memory",
  "search_documents",
  "search_web",
  "read_webpage",
  "export_file",
  "send_file_to_user",
  "read_file",
  "list_directory",
  "write_file",
  "delete_file",
  "run_shell_command",
  "sessions_list",
  "sessions_history",
  "query_analytics",
];

function formatArtifacts(artifacts: Array<{ role: SwarmRole; content: string }>) {
  if (artifacts.length === 0) {
    return "No prior swarm artifacts are available.";
  }

  return artifacts
    .map((artifact) => `[${artifact.role.toUpperCase()} OUTPUT]\n${artifact.content}`)
    .join("\n\n");
}

export class SwarmCoordinator {
  constructor(
    private readonly runtime: AgentRuntime,
    private readonly sessions: SessionService,
    private readonly runtimeConfig: RuntimeConfig,
  ) {}

  private createRolePrompt(role: SwarmRole, goal: string, deliverable: string | null, priorArtifacts: Array<{ role: SwarmRole; content: string }>) {
    const deliverableText = deliverable ? `Expected deliverable: ${deliverable}` : "Expected deliverable: produce the most useful output for the goal.";

    let baseInstructions = `You are the ${role.toUpperCase()}. Turn the task into an actionable output aligned with your role. Be concrete and produce working steps or detailed content.\nCRITICAL: You MUST output the FULL content of your deliverables directly in your final textual response. Do not just summarize what you did.`;

    if (role.toLowerCase().includes("review") || role.toLowerCase().includes("evaluator")) {
      baseInstructions += `\n\nCRITICAL REVIEW INSTRUCTION: Critique the prior artifacts. Identify gaps, bugs, or missing pieces. Your response must contain your full review content, and the FINAL LINE MUST be exactly [APPROVED] or [REJECTED]. Never omit the decision marker and never return an empty response.`;
    } else {
      // For general roles in an FSM, if they finish their task, they implicitly approve passing it to the next step.
      baseInstructions += `\n\nCRITICAL ROUTING INSTRUCTION: Once you have confidently finished your task, your FINAL LINE MUST be exactly [APPROVED] to signal the workflow controller to proceed to the next step. If you encountered an unrecoverable failure and need the workflow to abort, your FINAL LINE MUST be exactly [REJECTED]. Never omit the decision marker and never return an empty response.`;
    }

    return `${baseInstructions}\n\nGoal: ${goal}\n${deliverableText}\n\nPrior working artifacts (Use these as context/dependencies):\n\n${formatArtifacts(priorArtifacts)}`;
  }

  async runRoleTask(input: {
    role: SwarmRole;
    goal: string;
    deliverable?: string | null;
    parentSessionId: string;
    priorArtifacts?: Array<{ role: SwarmRole; content: string }>;
    modelOverride?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const session = this.sessions.createSwarmSession({
      role: input.role,
      title: `Swarm ${input.role}`,
      instructions: `You are the ${input.role.toUpperCase()}.`,
      parentSessionId: input.parentSessionId,
      allowedTools: DEFAULT_TOOL_ALLOWLIST,
      modelOverride: input.modelOverride ?? this.runtimeConfig.roleModelOverrides[input.role as any] ?? null,
      metadata: input.metadata ?? null,
    });

    const result = await this.runtime.runTurn({
      sessionId: session.id,
      userText: this.createRolePrompt(input.role, input.goal, input.deliverable ?? null, input.priorArtifacts ?? []),
      allowBackgroundTasks: false,
      enableSpeech: false,
      metadata: { source: "swarm_role", role: input.role },
    });

    return { session, result };
  }

  async runSwarm(input: {
    goal: string;
    deliverable?: string | null;
    parentSessionId: string;
    roles?: SwarmRole[];
  }): Promise<SwarmRunResult> {
    const roles: SwarmRole[] = input.roles && input.roles.length > 0
      ? input.roles
      : ["researcher", "coder", "reviewer"];

    const childSessionIds: string[] = [];
    const artifacts: Array<{ role: SwarmRole; content: string; sessionId: string }> = [];

    for (const role of roles) {
      const { session, result } = await this.runRoleTask({
        role,
        goal: input.goal,
        deliverable: input.deliverable ?? null,
        parentSessionId: input.parentSessionId,
        priorArtifacts: artifacts.map((artifact) => ({ role: artifact.role, content: artifact.content })),
      });

      childSessionIds.push(session.id);
      artifacts.push({
        role,
        content: result.text,
        sessionId: session.id,
      });
    }

    const primaryArtifact = artifacts[artifacts.length - 1];

    return {
      summary: primaryArtifact?.content || "Swarm completed with no output.",
      childSessionIds,
      artifacts,
      reviewNotes: null,
    };
  }
}
