import { getAppContext } from "../core/appContext";
import type { AgentTurnRequest } from "../core/types";
import { PRIMARY_SESSION_ID } from "../memory/sqlite";

export interface AgentResponse {
  text: string;
  speakText: string | null;
}

export function getActiveModelName() {
  return getAppContext().modelState.getCurrentModel();
}

export function setActiveModel(modelId: string) {
  const app = getAppContext();
  app.providerRouter.assertModelSelection(modelId);
  app.modelState.setCurrentModel(modelId);
  console.log(`[Engine] Model switched to: ${modelId}`);
}

export function getActiveModel() {
  const app = getAppContext();
  return app.providerRouter.resolveChatModel(app.modelState.getCurrentModel());
}

export function getActiveEmbeddingModel() {
  const app = getAppContext();
  return app.providerRouter.resolveEmbeddingModel(app.modelState.getCurrentModel());
}

export function getActiveEmbeddingModelCandidates() {
  const app = getAppContext();
  return app.providerRouter.resolveEmbeddingModels(app.modelState.getCurrentModel());
}

export async function processMessageWithEngine(
  userText: string,
  isVoiceMessage = false,
  options?: Partial<AgentTurnRequest>,
): Promise<AgentResponse> {
  const result = await getAppContext().runtime.runTurn({
    sessionId: options?.sessionId ?? PRIMARY_SESSION_ID,
    userText,
    isVoiceMessage,
    images: options?.images,
    documents: options?.documents,
    modelOverride: options?.modelOverride ?? null,
    allowBackgroundTasks: options?.allowBackgroundTasks,
    enableSpeech: options?.enableSpeech,
    metadata: options?.metadata ?? null,
  });

  const speakDirective = result.directives.find((directive) => directive.type === "speak");

  return {
    text: result.text,
    speakText: speakDirective?.type === "speak" ? speakDirective.text : null,
  };
}
