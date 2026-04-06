export function parseModelId(modelId: string) {
  const trimmed = modelId.trim();
  const separatorIndex = trimmed.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error(`Invalid model id "${modelId}". Expected "provider:model-name".`);
  }

  return {
    providerId: trimmed.slice(0, separatorIndex),
    modelName: trimmed.slice(separatorIndex + 1),
  };
}

export class ActiveModelState {
  constructor(private currentModelId: string) {}

  getCurrentModel() {
    return this.currentModelId;
  }

  setCurrentModel(modelId: string) {
    this.currentModelId = modelId.trim();
  }
}
