import { getAppContext } from "../core/appContext";
import type { SwarmRole } from "../core/types";

export const runSwarmDeclaration = {
  name: "run_swarm",
  description: "Run a bounded multi-agent swarm using researcher, coder, and reviewer roles to tackle a complex task.",
  parameters: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "The high-level task or problem for the swarm to solve.",
      },
      deliverable: {
        type: "string",
        description: "Optional expected output shape for the swarm.",
      },
      roles: {
        type: "array",
        description: "Optional subset of swarm roles to run.",
        items: {
          type: "string",
          enum: ["researcher", "coder", "reviewer"],
        },
      },
    },
    required: ["goal"],
  },
};

export async function runSwarmExecutor(args: Record<string, any>, sessionId: string) {
  const roles = Array.isArray(args.roles)
    ? args.roles.filter((role): role is SwarmRole =>
        role === "researcher" || role === "coder" || role === "reviewer",
      )
    : undefined;

  const result = await getAppContext().swarm.runSwarm({
    goal: String(args.goal),
    deliverable: args.deliverable ? String(args.deliverable) : null,
    parentSessionId: sessionId,
    roles,
  });

  return [
    `Swarm completed with ${result.childSessionIds.length} child session(s).`,
    `Child Sessions: ${result.childSessionIds.join(", ")}`,
    "",
    result.summary,
  ].join("\n");
}
