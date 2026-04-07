const USER_VISIBLE_PREFIXES = [
  "Planning mesh workflow",
  "Mesh FSM initialized",
  "Starting step:",
  "Step APPROVED:",
  "Step REJECTED:",
  "Model failover:",
  "No recovery route",
  "Routing error:",
  "Max iterations",
  "Mesh workflow finished",
];

export function toUserVisibleMeshProgress(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("violently failed")) {
    return trimmed;
  }

  for (const prefix of USER_VISIBLE_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return trimmed;
    }
  }

  return null;
}

export function renderMeshProgressSummary(lines: string[]) {
  const recentLines = lines.slice(-3);
  return [
    "Mesh is running.",
    ...recentLines,
  ].join("\n");
}
