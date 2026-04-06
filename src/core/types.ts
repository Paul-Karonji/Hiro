import type { LanguageModel, ToolSet } from "ai";
import type { SessionRecord, SessionType } from "../memory/sqlite";

export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

export type SwarmRole = string;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface AgentDirectiveSpeak {
  type: "speak";
  text: string;
}

export interface AgentDirectiveNotify {
  type: "notify";
  message: string;
}

export interface AgentDirectiveArtifact {
  type: "artifact";
  title: string;
  content: string;
}

export type AgentDirective = AgentDirectiveSpeak | AgentDirectiveNotify | AgentDirectiveArtifact;

export interface ToolTraceEntry {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export type AgentBinaryInput = string | Uint8Array;

export type AgentImageInput =
  | string
  | {
      data: AgentBinaryInput;
      mediaType?: string;
    };

export interface AgentDocumentInput {
  data: AgentBinaryInput;
  filename?: string;
  mediaType?: string;
}

export interface AgentTurnRequest {
  sessionId: string;
  userText: string;
  isVoiceMessage?: boolean;
  images?: AgentImageInput[];
  documents?: AgentDocumentInput[];
  modelOverride?: string | null;
  allowBackgroundTasks?: boolean;
  enableSpeech?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface AgentTurnResult {
  sessionId: string;
  text: string;
  directives: AgentDirective[];
  stepsUsed: number;
  modelUsed: string;
  trace: ToolTraceEntry[];
  finishReason: string;
  usage?: unknown;
}

export interface ToolExecutionContext {
  sessionId: string;
  sessionType: SessionType;
  session: SessionRecord;
  modelUsed: string;
  request: AgentTurnRequest;
  directives: AgentDirective[];
  trace: ToolTraceEntry[];
}

export interface RuntimeTool {
  definition: ToolDefinition;
  execute(args: any, context: ToolExecutionContext): Promise<unknown>;
}

export interface RuntimeConfig {
  defaultActiveModel: string;
  enabledProviders: string[];
  channel: string;
  memory: string;
  toolPlugins: string[];
  roleModelOverrides: Partial<Record<SwarmRole, string>>;
  sessions: {
    routingEnabled: boolean;
    idleResetHours: number;
    dailyResetHour: number | null;
    timezone: string;
  };
  agent: {
    maxSteps: number;
    recentMessages: number;
    maxTokens: number;
  };
  swarm: {
    maxParallel: number;
  };
  mesh: {
    maxSteps: number;
  };
}

export interface ResolvedModelRef {
  modelId: string;
  providerId: string;
  modelName: string;
  model: LanguageModel;
}

export interface SessionSendResult {
  session: SessionRecord;
  result: AgentTurnResult;
}

export interface SwarmRunResult {
  summary: string;
  childSessionIds: string[];
  artifacts: Array<{ role: SwarmRole; content: string; sessionId: string }>;
  reviewNotes: string | null;
}

export interface MeshPlanStep {
  id: string;
  title: string;
  ownerRole: SwarmRole;
  successCriteria: string;
  expectedArtifact: string | null;
  nextStepOnSuccess: string | null;
  nextStepOnFailure: string | null;
}

export interface MeshPlan {
  goal: string;
  initialStepId: string;
  steps: MeshPlanStep[];
}

export type AIToolSet = ToolSet;
