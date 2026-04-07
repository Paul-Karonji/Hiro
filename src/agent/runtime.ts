import { generateText } from "ai";
import { getAppContext } from "../core/appContext";
import { parseModelId } from "../core/modelState";
import { loadSkillsAsPrompt } from "../tools/skills";
import { compactConversationInBackground, extractCoreFactsInBackground } from "./backgroundTasks";
import {
  buildImageMemorySummary,
  formatImageMemoriesForSystemPrompt,
  withStoredImageMemory,
} from "./imageMemory";
import {
  appendDocumentPrompt,
  buildDocumentAttachmentMarker,
  formatRecentDocumentsForSystemPrompt,
} from "./documentMemory";
import type { TurnDocumentContext } from "./documentMemory";
import type { ActiveModelState } from "../core/modelState";
import type { ProviderRouter } from "../core/providerRouter";
import type {
  AgentImageInput,
  RuntimeConfig,
  AgentTurnRequest,
  AgentTurnResult,
  ToolExecutionContext,
} from "../core/types";
import type { ToolRegistry } from "../core/toolRegistry";
import { DefaultMemoryService } from "../memory/service";
import { PRIMARY_SESSION_ID, type SessionRecord, dbQueries } from "../memory/sqlite";
import type { SessionService } from "../sessions/service";
import { extractDocumentText } from "../documents/extract";
import { buildCapabilitiesPrompt, resolveActiveRuntimeTools, resolveSessionPlatform } from "./capabilities";
import type { RuntimeTool } from "../core/types";

type AgentRuntimeDependencies = {
  memory: DefaultMemoryService;
  sessions: SessionService;
  toolRegistry: ToolRegistry;
  providerRouter: ProviderRouter;
  modelState: ActiveModelState;
  runtimeConfig: RuntimeConfig;
};

type StepArtifacts = {
  toolResults: string[];
  toolResultsForSwarm: string[];
  toolCallNames: string[];
};

const SWARM_REJECTION_SIGNAL_PATTERNS = [
  /\b(?:could not|couldn't|cannot|can't|unable to|failed to)\b/i,
  /\bno (?:usable|relevant|credible|verifiable|sufficient|supporting) (?:source|sources|data|evidence|records|results)\b/i,
  /\binsufficient (?:source|sources|data|evidence|coverage|material)\b/i,
  /\boff[- ]scope\b/i,
  /\bfinal decision\s*:\s*rejected\b/i,
  /\bstatus\s*:\s*rejected\b/i,
  /\bnot approved\b/i,
  /\bneeds? (?:revision|rework|more verification)\b/i,
  /\bsend (?:it )?back for revision\b/i,
  /\bdoes not meet (?:the )?(?:criteria|requirements|standard)\b/i,
  /\brate[- ]limit(?:ed|ing)?\b/i,
  /\btry again later\b/i,
  /^error:/i,
];

const SWARM_APPROVAL_SIGNAL_PATTERNS = [
  /\bfinal decision\s*:\s*approved\b/i,
  /\bstatus\s*:\s*approved\b/i,
  /\bthis (?:report|draft|deliverable|work) is approved\b/i,
  /\bapproval granted\b/i,
  /\bmeets? (?:all )?(?:the )?(?:success criteria|criteria|requirements|standard)\b/i,
  /\bpasses? (?:review|validation|verification|qa)\b/i,
  /\bready to proceed\b/i,
  /\bvalidated and accurate\b/i,
  /\baccurate and within scope\b/i,
  /\bacceptable as (?:the )?final deliverable\b/i,
];

function collectStepArtifacts(steps: any[] | undefined): StepArtifacts {
  const toolResults: string[] = [];
  const toolResultsForSwarm: string[] = [];
  const toolCallNames: string[] = [];

  for (const step of steps || []) {
    if (step.toolResults && step.toolResults.length > 0) {
      for (const tr of step.toolResults) {
        const r = (tr as any).result ?? (tr as any).output;
        const resultStr = typeof r === "string" ? r : JSON.stringify(r ?? "");
        if (resultStr) toolResults.push(resultStr);
      }
    }

    if (step.toolCalls && step.toolCalls.length > 0) {
      for (const call of step.toolCalls) {
        const callArgs = (call as any).args || (call as any).arguments || {};
        toolCallNames.push(call.toolName);
        toolResultsForSwarm.push(`[TOOL INVOCATION: ${call.toolName}]\n${typeof callArgs === "object" ? JSON.stringify(callArgs, null, 2) : callArgs}`);
      }
    }
  }

  return { toolResults, toolResultsForSwarm, toolCallNames };
}

export function isPseudoToolOutput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return /"tool_code"\s*:/i.test(trimmed)
    || /DueSync\.[A-Za-z_]+\(/i.test(trimmed)
    || /print\s*\(\s*DueSync\./i.test(trimmed)
    || /```(?:json|python)?[\s\S]*?(tool_code|DueSync\.|print\s*\()/i.test(trimmed);
}

function hasExplicitSwarmRoutingMarker(text: string) {
  return /\[(approved|rejected)\]/i.test(text);
}

function stripSwarmRoutingMarkers(text: string) {
  return text.replace(/\[(approved|rejected)\]/gi, "").trim();
}

const SWARM_PROVISIONAL_RESPONSE_PATTERNS = [
  /^(let me|i(?:'ll| will)|i need to|i should|next[, ]+i(?:'ll| will))/i,
  /\bbefore producing\b/i,
  /\bbefore finali[sz]ing\b/i,
  /\bneed to verify\b/i,
  /\bverify the current status\b/i,
  /\bstill verifying\b/i,
  /\bwill verify\b/i,
  /\bthen produce\b/i,
];

export function isSwarmProvisionalResponse(text: string) {
  const stripped = stripSwarmRoutingMarkers(text).replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length > 240) {
    return false;
  }

  return SWARM_PROVISIONAL_RESPONSE_PATTERNS.some((pattern) => pattern.test(stripped));
}

function isReviewRole(role: string | null) {
  const normalizedRole = (role ?? "").toLowerCase();
  return normalizedRole.includes("review") || normalizedRole.includes("evaluator");
}

export function inferSwarmRoutingMarker(text: string, role: string | null): "[APPROVED]" | "[REJECTED]" | null {
  const trimmed = text.trim();
  if (!trimmed || hasExplicitSwarmRoutingMarker(trimmed)) {
    return null;
  }

  if (isPseudoToolOutput(trimmed)) {
    return "[REJECTED]";
  }

  if (SWARM_REJECTION_SIGNAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "[REJECTED]";
  }

  if (isReviewRole(role)) {
    if (SWARM_APPROVAL_SIGNAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return "[APPROVED]";
    }
    return null;
  }

  const normalized = trimmed.replace(/\s+/g, " ").trim();
  if (normalized.length < 80) {
    return null;
  }

  return "[APPROVED]";
}

export function normalizeSwarmRoutingOutput(text: string, role: string | null) {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (isSwarmProvisionalResponse(trimmed)) {
    return `${stripSwarmRoutingMarkers(trimmed)}\n\n[REJECTED]`;
  }

  if (hasExplicitSwarmRoutingMarker(trimmed)) {
    return trimmed;
  }

  const inferredMarker = inferSwarmRoutingMarker(trimmed, role);
  if (!inferredMarker) {
    return trimmed;
  }

  return `${trimmed}\n\n${inferredMarker}`;
}

function buildImageContentParts(images: AgentImageInput[] | undefined) {
  return (images ?? []).map((image) =>
    typeof image === "string"
      ? { type: "image" as const, image }
      : {
          type: "image" as const,
          image: image.data,
          mediaType: image.mediaType,
        },
  );
}

export function buildUserMessageContent(userPrompt: string, images: AgentImageInput[] | undefined) {
  const imageParts = buildImageContentParts(images);
  if (imageParts.length === 0) {
    return userPrompt;
  }

  return [{ type: "text" as const, text: userPrompt }, ...imageParts];
}

export class AgentRuntime {
  private backgroundTasksRunning = 0;

  constructor(private readonly deps: AgentRuntimeDependencies) {}

  private isAlibabaToolSchemaError(modelId: string, error: any) {
    try {
      if (parseModelId(modelId).providerId !== "alibaba") {
        return false;
      }
    } catch {
      return false;
    }

    const haystack = [
      error?.message,
      error?.cause?.message,
      error?.responseBody,
      error?.cause?.value?.error?.message,
    ]
      .filter(Boolean)
      .join("\n");

    return haystack.includes("InternalError.Algo.InvalidParameter")
      || (haystack.includes("Invalid JSON response") && haystack.includes("tool:"));
  }

  private resolveAlibabaToolFallbackModel(modelId: string) {
    const candidates = [
      "openrouter:qwen/qwen3.6-plus:free",
      "google:gemini-2.5-flash",
      "mistral:mistral-large-latest",
    ];

    for (const candidate of candidates) {
      if (candidate === modelId) {
        continue;
      }

      const validation = this.deps.providerRouter.validateModelSelection(candidate);
      if (validation.ok) {
        return candidate;
      }
    }

    return null;
  }

  private async generateTextWithAlibabaToolFallback(
    modelId: string,
    settings: Record<string, unknown>,
  ): Promise<{ result: Awaited<ReturnType<typeof generateText>>; modelId: string }> {
    const run = async (targetModelId: string) => generateText({
      ...settings,
      model: this.deps.providerRouter.resolveChatModel(targetModelId),
    } as any);

    try {
      return {
        result: await run(modelId),
        modelId,
      };
    } catch (error: any) {
      if (!this.isAlibabaToolSchemaError(modelId, error)) {
        throw error;
      }

      const fallbackModelId = this.resolveAlibabaToolFallbackModel(modelId);
      if (!fallbackModelId) {
        throw error;
      }

      console.warn(`[Runtime] Alibaba tool schema rejected by provider. Retrying with ${fallbackModelId}.`);
      return {
        result: await run(fallbackModelId),
        modelId: fallbackModelId,
      };
    }
  }

  private async rememberImageContext(
    session: SessionRecord,
    request: AgentTurnRequest,
    finalText: string,
  ) {
    if (!request.images || request.images.length === 0) {
      return;
    }

    const summary = buildImageMemorySummary(request.userText, finalText);
    if (!summary) {
      return;
    }

    const metadata = withStoredImageMemory(session.metadata, {
      summary,
      capturedAt: new Date().toISOString(),
    });

    this.deps.memory.updateSession(session.id, { metadata });
    session.metadata = metadata;

    try {
      await this.deps.memory.storeSemanticMemory(`image-${session.id}-${Date.now()}`, summary);
    } catch {
      // Failing to index semantic memory must not break the user flow.
    }
  }

  private async ingestDocuments(
    session: SessionRecord,
    request: AgentTurnRequest,
  ): Promise<TurnDocumentContext[]> {
    const inputs = request.documents ?? [];
    if (inputs.length === 0) {
      return [];
    }

    const storedDocuments: TurnDocumentContext[] = [];

    for (const input of inputs) {
      const extracted = await extractDocumentText({
        data: input.data,
        filename: input.filename,
        mediaType: input.mediaType,
      });

      const stored = this.deps.memory.addDocument({
        sessionId: session.id,
        filename: extracted.filename ?? `document-${Date.now()}.txt`,
        mediaType: extracted.mediaType,
        content: extracted.text,
        metadata: {
          kind: extracted.kind,
          source: "attachment",
        },
      });

      storedDocuments.push({
        id: stored.id,
        filename: stored.filename,
        mediaType: stored.media_type,
        content: stored.content,
      });

      try {
        await this.deps.memory.storeSemanticMemory(
          `document-${session.id}-${stored.id}`,
          `Document ${stored.filename}\n${stored.content.slice(0, 4000)}`,
        );
      } catch {
        // Failing semantic indexing must never block document ingestion.
      }
    }

    return storedDocuments;
  }

  private async synthesizeToolResults(modelId: string, request: AgentTurnRequest, usableResults: string[]) {
    const combinedContent = usableResults.map((r, i) => `[Source ${i + 1}]:\n${r.substring(0, 6000)}`).join("\n\n");
    const synthResult = await generateText({
      model: this.deps.providerRouter.resolveChatModel(modelId),
      system: "You are a helpful AI assistant. Analyze and summarize the provided source content clearly and concisely. Write a full, useful response.",
      messages: [{
        role: "user" as const,
        content: `User asked: "${request.userText}"\n\nHere is the retrieved content:\n\n${combinedContent}\n\nPlease provide a thorough, well-organized response based on this information.`,
      }],
    } as any);

    return synthResult.text?.trim() || "";
  }

  private async synthesizeSwarmToolResults(
    modelId: string,
    session: SessionRecord,
    request: AgentTurnRequest,
    usableResults: string[],
  ) {
    const combinedContent = usableResults.map((r, i) => `[Source ${i + 1}]:\n${r.substring(0, 6000)}`).join("\n\n");
    const roleName = session.role?.toUpperCase() || "SPECIALIST";
    const synthResult = await generateText({
      model: this.deps.providerRouter.resolveChatModel(modelId),
      system: [
        `You are the ${roleName} in a multi-step workflow.`,
        "Convert the gathered tool results into the actual deliverable for this step.",
        "Do not mention tool calls, JSON schemas, or internal traces.",
        "Write the real final content directly.",
        "If the step is complete, end with [APPROVED].",
        "If the sources are insufficient or off-scope, explain the gap and end with [REJECTED].",
      ].join(" "),
      messages: [{
        role: "user" as const,
        content: `Workflow step instructions:\n${request.userText}\n\nRetrieved source material:\n\n${combinedContent}\n\nProduce the final step output now.`,
      }],
    } as any);

    return synthResult.text?.trim() || "";
  }

  private async runToolRecoveryPass(
    modelId: string,
    request: AgentTurnRequest,
    explicitAllowlist: string[],
    toolContext: ToolExecutionContext,
    storedDocuments: TurnDocumentContext[],
  ) {
    console.log("[Runtime] Running tool recovery pass");

    const recoveryPrompt = appendDocumentPrompt(
      request.userText +
      "\n\nUse the actual built-in tools if external data or connected systems are needed. " +
      "Do not output JSON, pseudo-code, print(...), or tool placeholders.",
      storedDocuments,
    );

    const recoveryContent = buildUserMessageContent(recoveryPrompt, request.images);

    const { result: recoveryResult } = await this.generateTextWithAlibabaToolFallback(modelId, {
      system: "You are Hiro. Tools are available in this runtime. If the user needs live data or connected systems, you MUST call the actual tool. Never describe a tool call in text. Never output JSON wrappers, code fences, print(...), or fields like tool_code.",
      messages: [{ role: "user" as const, content: recoveryContent }],
      tools: this.deps.toolRegistry.buildAiTools(toolContext, explicitAllowlist),
      maxSteps: Math.min(this.deps.runtimeConfig.agent.maxSteps, 8),
    });

    const recoveryText = recoveryResult.text?.trim() || "";
    const recoveryArtifacts = collectStepArtifacts(recoveryResult.steps);
    const usableResults = recoveryArtifacts.toolResults.filter((r) => !/^error:/i.test(r.trim()) && !r.trim().startsWith("Error:"));

    console.log(`[Runtime] Tool recovery finishReason=${recoveryResult.finishReason} textLen=${recoveryText.length} toolCalls=[${recoveryArtifacts.toolCallNames.join(",")}] toolResults=${usableResults.length}`);

    if (usableResults.length > 0) {
      const synthesized = await this.synthesizeToolResults(modelId, request, usableResults);
      if (synthesized) {
        return synthesized;
      }
    }

    if (recoveryText && !isPseudoToolOutput(recoveryText)) {
      return recoveryText;
    }

    return "";
  }

  private resolveSession(sessionId: string) {
    if (sessionId === PRIMARY_SESSION_ID) {
      return this.deps.sessions.ensurePrimarySession();
    }

    const session = this.deps.sessions.getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session "${sessionId}".`);
    }

    return session;
  }

  private buildSystemInstruction(session: SessionRecord, request: AgentTurnRequest, activeTools: RuntimeTool[]) {
    let systemInstruction = `You are Hiro. You are NOT an AI assistant - you are a partner. You use the capabilities and tools actually mounted for this session right now.

${buildCapabilitiesPrompt({
  session,
  tools: activeTools,
  metadata: request.metadata ?? null,
})}

CORE RULES:
- NEVER announce that you are going to execute a tool. DO NOT say "I will search the web now" or "Performing a web search". Just execute the tool silently.
- IMPORTANT: Typing your intention in text DOES NOT execute actions. You MUST invoke the internal JSON tool schema. If you just type text, you will fail the task.
- When the user asks to "render", "show", "chart", "visualise", "draw", or "display" anything - use the render_canvas tool with a self-contained HTML/JS snippet.
- When the user asks you to speak, say something aloud, or reply with voice, call speak_response.
- When the user asks you to create, save, export, draft, or generate a file or document, use export_file instead of only pasting the content in chat.
- In normal Telegram or WhatsApp chat, created files are expected to be attached back to the user by default. Only suppress delivery when the user explicitly asked to save locally or not send the file.
- Use sendToUser in export_file only when you need to override the default behavior, or use send_file_to_user for an existing file.
- Speech text must be natural spoken language with no markdown or bullet points.
- Never claim you are text-only.
`;

    if (session.type === "swarm" && session.role) {
      systemInstruction += `\nCURRENT SWARM ROLE: ${session.role.toUpperCase()}\n`;
    }

    if (session.instructions) {
      systemInstruction += `\nSESSION INSTRUCTIONS:\n${session.instructions}\n`;
    }

    try {
      const activeMissions = dbQueries.getMissions("active");
      if (activeMissions && activeMissions.length > 0) {
        systemInstruction += `\nACTIVE MISSIONS:\nYou are proactively managing the following long-term goals. If the user shares information relevant to these, use the 'add_mission_context' tool to save it:\n`;
        activeMissions.slice(0, 5).forEach((m: any) => {
          systemInstruction += `- [ID: ${m.id}] ${m.title}: ${m.description}\n`;
        });
        systemInstruction += "\n";
      }
    } catch {
      // Ignore if called before init
    }

    systemInstruction += loadSkillsAsPrompt();

    if (request.isVoiceMessage) {
      systemInstruction += "\nCRITICAL CONTEXT: The user just sent a voice message. Reply with voice unless they explicitly asked for text only.\n";
    }

    if (resolveSessionPlatform(session, request.metadata ?? null) === "whatsapp") {
      systemInstruction += "\nCHANNEL: WhatsApp. The speak_response tool is NOT available here. NEVER output 'Done.' as a response - always write your full answer as plain text. Voice synthesis is handled automatically by the system after you respond.\n";
    }

    const recentImageMemories = formatImageMemoriesForSystemPrompt(session.metadata);
    if (recentImageMemories) {
      systemInstruction += "\nRECENT IMAGE MEMORIES (compact text summaries of prior analyzed images; raw images are not stored):\n";
      systemInstruction += `${recentImageMemories}\n`;
      systemInstruction += "If the user refers to a previously shared image, invitation, poster, event, or flyer, use these memories unless the user corrects them.\n";
    }

    const recentDocuments = formatRecentDocumentsForSystemPrompt(this.deps.memory.getRecentDocuments(session.id, 5));
    if (recentDocuments) {
      systemInstruction += "\nRECENT DOCUMENTS (full text is stored locally and searchable with search_documents):\n";
      systemInstruction += `${recentDocuments}\n`;
      systemInstruction += "If the user refers to a PDF, file, attachment, document, CV, report, or contract, use search_documents when needed.\n";
    }

    const coreFacts = this.deps.memory.getCoreFacts();
    if (coreFacts.length > 0) {
      systemInstruction += "\nCORE FACTS ABOUT USER (Most relevant):\n";
      coreFacts.slice(0, 15).forEach((factObj) => {
        systemInstruction += `- ${factObj.fact}\n`;
      });
      systemInstruction += "\n";
    }

    const latestSummary = this.deps.memory.getLatestSummary(session.id);
    if (latestSummary) {
      systemInstruction += `\nSESSION SUMMARY:\n${latestSummary}\n`;
    }

    return systemInstruction;
  }

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const session = this.resolveSession(request.sessionId);
    const requestedModelId = this.deps.sessions.getModelForSession(session, request.modelOverride);
    this.deps.providerRouter.assertModelSelection(requestedModelId);
    const storedDocuments = await this.ingestDocuments(session, request);

    const userPrompt = appendDocumentPrompt(
      request.userText,
      storedDocuments,
    ) + "\n\n[SYSTEM REMINDER: Do NOT state that you are going to perform an action. You MUST physically invoke the tool via the JSON schema. If you just type 'I am searching...' without executing the actual tool-function, it will fail.]";

    const attachmentMarkers: string[] = [];
    if (request.images && request.images.length > 0) {
      attachmentMarkers.push("[Image attached]");
    }

    const savedUserText = buildDocumentAttachmentMarker(
      attachmentMarkers.length > 0
        ? `${attachmentMarkers.join(" ")} ${request.userText}`.trim()
        : request.userText,
      storedDocuments,
    );

    this.deps.memory.addMessage("user", savedUserText, {
      sessionId: session.id,
      metadata: {
        ...(request.metadata ?? {}),
        attachedDocumentIds: storedDocuments.map((document) => document.id),
        attachedDocumentNames: storedDocuments.map((document) => document.filename),
      },
    });

    const recentMessages = this.deps.memory.getRecentMessages(session.id, this.deps.runtimeConfig.agent.recentMessages);
    const messages: any[] = recentMessages.map((message) => ({
      role: message.role === "model" ? "assistant" : "user",
      content: message.content,
    }));

    const finalContent: any = buildUserMessageContent(userPrompt, request.images);

    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      messages[messages.length - 1].content = finalContent;
    } else {
      messages.push({ role: "user", content: finalContent });
    }

    const directives: AgentTurnResult["directives"] = [];
    const trace: AgentTurnResult["trace"] = [];

    const {
      activeToolNames: explicitAllowlist,
      activeTools,
    } = resolveActiveRuntimeTools(this.deps.toolRegistry, {
      session,
      enableSpeech: request.enableSpeech,
      metadata: request.metadata ?? null,
    });

    const toolContext: ToolExecutionContext = {
      sessionId: session.id,
      sessionType: session.type,
      session,
      modelUsed: requestedModelId,
      request,
      directives,
      trace,
    };

    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof generateText>>;
    let modelId = requestedModelId;
    try {
      const generation = await this.generateTextWithAlibabaToolFallback(requestedModelId, {
        system: this.buildSystemInstruction(session, request, activeTools),
        messages,
        tools: this.deps.toolRegistry.buildAiTools(toolContext, explicitAllowlist),
        maxSteps: this.deps.runtimeConfig.agent.maxSteps,
      });
      result = generation.result;
      modelId = generation.modelId;
      toolContext.modelUsed = modelId;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isEmptyOutputError = msg.includes("model output must contain") || msg.includes("NoContentGeneratedError") || msg.includes("output text or tool calls");
      if (isEmptyOutputError) {
        console.warn("[Runtime] Model returned empty output, returning fallback response.");
        return {
          sessionId: session.id,
          text: "I hit a snag - the model returned an empty response. Please try again, or use `/new` to start a fresh conversation if this keeps happening.",
          directives: [],
          stepsUsed: 0,
          modelUsed: modelId,
          trace,
          finishReason: "error",
          usage: undefined,
        };
      }
      throw err;
    }

    let finalText = result.text || "";
    console.log(`[Runtime] model=${modelId} steps=${result.steps?.length ?? 0} finishReason=${result.finishReason} textLen=${finalText.length}`);

    if (result.steps && result.steps.length > 0) {
      const { toolResults, toolResultsForSwarm, toolCallNames } = collectStepArtifacts(result.steps);
      console.log(`[Runtime] toolCalls=[${toolCallNames.join(",")}] toolResults=${toolResults.length} usableLen=${toolResults.filter(r => !/^error:/i.test(r.trim())).length}`);

      if (session.type === "swarm") {
        const isErrorResult = (s: string) => /^error:/i.test(s.trim()) || s.trim().startsWith("Error:");
        const usableResults = toolResults.filter((r) => !isErrorResult(r));

        if (finalText.trim().length === 0 && usableResults.length > 0) {
          console.log("[Runtime] Swarm empty text after tool calls - running synthesis pass");
          try {
            const synthesized = await this.synthesizeSwarmToolResults(modelId, session, request, usableResults);
            if (synthesized) {
              finalText = synthesized;
              console.log(`[Runtime] Swarm synthesis pass succeeded (${finalText.length} chars)`);
            }
          } catch (synthErr: any) {
            console.error("[Runtime] Swarm synthesis pass failed:", synthErr?.message);
          }
        }

        if (finalText.trim().length === 0 && toolResultsForSwarm.length > 0) {
          finalText = "[REJECTED] I gathered external data, but I could not convert it into a valid workflow deliverable.";
        }

        if (finalText.trim().length === 0) {
          finalText = "No response generated.";
        }
      } else if (session.type === "primary") {
        const isErrorResult = (s: string) => /^error:/i.test(s.trim()) || s.trim().startsWith("Error:");
        const usableResults = toolResults.filter((r) => !isErrorResult(r));

        if (finalText.trim().length === 0) {
          if (usableResults.length > 0) {
            console.log("[Runtime] Empty text after tool calls - running synthesis pass");
            try {
              const synthesized = await this.synthesizeToolResults(modelId, request, usableResults);
              if (synthesized) {
                finalText = synthesized;
                console.log(`[Runtime] Synthesis pass succeeded (${finalText.length} chars)`);
              } else {
                finalText = "I retrieved the information but couldn't generate a summary. Try asking again or use a different model with `/setmodel`.";
              }
            } catch (synthErr: any) {
              console.error("[Runtime] Synthesis pass failed:", synthErr?.message);
              finalText = "I wasn't able to complete that request. Please try again or rephrase.";
            }
          } else {
            console.log("[Runtime] Empty stop with no tool calls - running tool recovery");
            try {
              const recovered = await this.runToolRecoveryPass(modelId, request, explicitAllowlist, toolContext, storedDocuments);
              if (recovered) {
                finalText = recovered;
                console.log(`[Runtime] Tool recovery succeeded (${finalText.length} chars)`);
              } else {
                console.log("[Runtime] Tool recovery produced nothing usable - running direct retry");
                const recentCtx = messages
                  .slice(-6)
                  .map((m: any) => `${m.role === "assistant" ? "Assistant" : "User"}: ${typeof m.content === "string" ? m.content.substring(0, 800) : "[content]"}`)
                  .join("\n");

                const retryResult = await generateText({
                  model: this.deps.providerRouter.resolveChatModel(modelId),
                  system: "You are a helpful AI assistant. Respond directly and helpfully to the user's message. Keep it concise and clear. Never output pseudo tool calls, JSON wrappers, or code blocks unless the user explicitly asks for code.",
                  messages: [{
                    role: "user" as const,
                    content: `Recent conversation:\n${recentCtx}\n\nNow respond to: "${request.userText}"`,
                  }],
                } as any);

                if (retryResult.text?.trim() && !isPseudoToolOutput(retryResult.text)) {
                  finalText = retryResult.text;
                  console.log(`[Runtime] Direct retry succeeded (${finalText.length} chars)`);
                } else {
                  finalText = "I wasn't able to complete that request. Please try again or rephrase.";
                }
              }
            } catch (retryErr: any) {
              console.error("[Runtime] Direct retry failed:", retryErr?.message);
              finalText = "I wasn't able to complete that request. Please try again or rephrase.";
            }
          }
        } else if (toolCallNames.length === 0 && isPseudoToolOutput(finalText)) {
          console.log("[Runtime] Pseudo-tool output detected - running tool recovery");
          try {
            const recovered = await this.runToolRecoveryPass(modelId, request, explicitAllowlist, toolContext, storedDocuments);
            if (recovered) {
              finalText = recovered;
              console.log(`[Runtime] Pseudo-tool recovery succeeded (${finalText.length} chars)`);
            }
          } catch (recoveryErr: any) {
            console.error("[Runtime] Pseudo-tool recovery failed:", recoveryErr?.message);
          }
        }
      }
    } else if (finalText.trim().length === 0) {
      finalText = "No response generated.";
    }

    if (session.type === "swarm") {
      finalText = normalizeSwarmRoutingOutput(finalText, session.role);
    }

    this.deps.memory.addMessage("model", finalText, {
      sessionId: session.id,
      modelUsed: modelId,
      metadata: {
        stepsUsed: result.steps.length,
        finishReason: result.finishReason,
        directives,
        trace,
      },
    });
    this.deps.memory.touchSession(session.id, modelId);

    await this.rememberImageContext(session, request, finalText);

    try {
      const usage = result.totalUsage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
      getAppContext().usageTracker.record({
        model: modelId,
        sessionId: session.id,
        inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? 0,
        outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? 0,
        latencyMs: Date.now() - startedAt,
      });
    } catch {
      // Never let usage tracking break the main flow
    }

    const allowBackgroundTasks = request.allowBackgroundTasks ?? session.type === "primary";
    if (allowBackgroundTasks && this.backgroundTasksRunning < 1) {
      this.backgroundTasksRunning += 1;
      setTimeout(() => {
        Promise.all([
          extractCoreFactsInBackground(request.userText, finalText, session.id),
          compactConversationInBackground(session.id),
        ]).finally(() => {
          this.backgroundTasksRunning -= 1;
        });
      }, 2000);
    }

    return {
      sessionId: session.id,
      text: finalText,
      directives,
      stepsUsed: result.steps.length,
      modelUsed: modelId,
      trace,
      finishReason: String(result.finishReason),
      usage: result.totalUsage,
    };
  }
}
