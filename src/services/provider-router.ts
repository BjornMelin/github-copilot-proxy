import { config } from '../config/index.js';
import { AppError } from '../middleware/error-handler.js';
import { OpenAICompletionRequest, OpenAIMessage } from '../types/openai.js';

export type CompletionProvider = 'copilot' | 'vision';

export interface ProviderModelDefinition {
  id: string;
  provider: CompletionProvider;
  ownedBy: string;
}

export interface ProviderRoutingOptions {
  copilotDefaultModel: string;
  copilotModels: string[];
  visionEnabled: boolean;
  visionDefaultModel: string;
  visionModels: string[];
  visionOwner: string;
}

export interface ResolvedCompletionProvider {
  provider: CompletionProvider;
  model: string;
  hasImageInput: boolean;
}

function createProviderError(message: string, status: number, code: string): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code;
  return error;
}

export function getProviderRoutingOptions(): ProviderRoutingOptions {
  return {
    copilotDefaultModel: config.github.copilot.defaultModel,
    copilotModels: config.github.copilot.models,
    visionEnabled: config.providers.vision.enabled,
    visionDefaultModel: config.providers.vision.defaultModel,
    visionModels: config.providers.vision.models,
    visionOwner: config.providers.vision.name,
  };
}

export function hasImageInput(messages: OpenAIMessage[]): boolean {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => part.type === 'image_url' && Boolean(part.image_url.url));
  });
}

export function getAvailableModels(
  options: ProviderRoutingOptions = getProviderRoutingOptions()
): ProviderModelDefinition[] {
  const models = new Map<string, ProviderModelDefinition>();

  for (const model of options.copilotModels) {
    models.set(model, {
      id: model,
      provider: 'copilot',
      ownedBy: 'github-copilot',
    });
  }

  if (options.visionEnabled) {
    for (const model of options.visionModels) {
      models.set(model, {
        id: model,
        provider: 'vision',
        ownedBy: options.visionOwner,
      });
    }
  }

  return [...models.values()];
}

export function resolveCompletionProvider(
  request: Pick<OpenAICompletionRequest, 'messages' | 'model'>,
  options: ProviderRoutingOptions = getProviderRoutingOptions()
): ResolvedCompletionProvider {
  const requestedModel = request.model?.trim() || options.copilotDefaultModel;
  const imageInput = hasImageInput(request.messages);
  const usesVisionModel = options.visionModels.includes(requestedModel);
  const usesCopilotModel = options.copilotModels.includes(requestedModel);

  if (imageInput || usesVisionModel) {
    if (!options.visionEnabled) {
      throw createProviderError(
        'Image inputs or vision models require a configured vision backend.',
        501,
        'vision_backend_not_configured'
      );
    }

    const resolvedVisionModel = usesVisionModel
      ? requestedModel
      : options.visionDefaultModel || options.visionModels[0] || requestedModel;

    return {
      provider: 'vision',
      model: resolvedVisionModel,
      hasImageInput: imageInput,
    };
  }

  if (!usesCopilotModel) {
    throw createProviderError(
      `Model '${requestedModel}' is not available from the configured providers.`,
      404,
      'model_not_found'
    );
  }

  return {
    provider: 'copilot',
    model: requestedModel,
    hasImageInput: false,
  };
}