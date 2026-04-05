import express from 'express';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { v4 as uuidv4 } from 'uuid';
import { 
  isTokenValid, 
  getCopilotToken,
  refreshCopilotToken 
} from '../services/auth-service.js';
import { 
  normalizeStopSequences,
  convertMessagesToCopilotPrompt,
  detectLanguageFromMessages,
  makeCompletionRequest
} from '../services/copilot-service.js';
import { OpenAICompletionRequest, OpenAICompletion } from '../types/openai.js';
import { AppError } from '../middleware/error-handler.js';
import { config } from '../config/index.js';
import { getMachineId } from '../utils/machine-id.js';
import { logger } from '../utils/logger.js';
import { trackRequest } from '../services/usage-service.js';
import {
  getAvailableModels,
  resolveCompletionProvider,
  type ProviderModelDefinition,
} from '../services/provider-router.js';
import {
  makeVisionCompletionRequest,
  streamVisionCompletion,
} from '../services/vision-service.js';

export const openaiRoutes = express.Router();

function buildModel(model: ProviderModelDefinition) {
  return {
    id: model.id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: model.ownedBy,
  };
}

function createAuthError(message: string, code: string): AppError {
  const error = new Error(message) as AppError;
  error.status = 401;
  error.code = code;
  return error;
}

async function getValidatedCopilotToken(): Promise<string> {
  const token = getCopilotToken();

  if (!token) {
    throw createAuthError('Authentication required', 'authentication_required');
  }

  if (!isTokenValid()) {
    try {
      await refreshCopilotToken();
    } catch (error) {
      logger.error('Token refresh failed in route handler:', error);
      throw createAuthError('Authentication failed', 'authentication_failed');
    }
  }

  const validatedToken = getCopilotToken();
  if (!validatedToken?.token) {
    throw createAuthError('Authentication required', 'authentication_required');
  }

  return validatedToken.token;
}

function handleStreamingRouteError(
  res: express.Response,
  error: unknown,
  next: express.NextFunction
): void {
  if (!res.headersSent) {
    next(error);
    return;
  }

  try {
    res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
    res.end();
  } catch (streamError) {
    logger.error('Error sending stream failure response:', streamError);
  }
}

// GET /v1/models - List available models
openaiRoutes.get('/models', (req, res) => {
  res.json({
    object: 'list',
    data: getAvailableModels().map(buildModel)
  });
});

openaiRoutes.get('/models/:model', (req, res, next) => {
  const model = getAvailableModels().find((candidate) => candidate.id === req.params.model);

  if (!model) {
    const error = new Error(`Model '${req.params.model}' not found`) as AppError;
    error.status = 404;
    error.code = 'model_not_found';
    return next(error);
  }

  return res.json(buildModel(model));
});

// POST /v1/chat/completions - Create a completion
openaiRoutes.post('/chat/completions', async (req, res, next) => {
  // Track this request
  const sessionId = res.locals.sessionId;
  trackRequest(sessionId, 0); // Initial tracking, token count will be updated later

  try {
    const request = req.body as OpenAICompletionRequest;
    const { messages, stream = false } = request;
    
    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const error = new Error('Messages array is required') as AppError;
      error.status = 400;
      error.code = 'invalid_request';
      return next(error);
    }

    const resolvedProvider = resolveCompletionProvider({
      messages,
      model: request.model,
    });

    const resolvedRequest: OpenAICompletionRequest = {
      ...request,
      model: resolvedProvider.model,
    };

    if (resolvedProvider.provider === 'vision') {
      if (stream) {
        try {
          await streamVisionCompletion(resolvedRequest, res);
        } catch (error) {
          handleStreamingRouteError(res, error, next);
        }
        return;
      }

      const completion = await makeVisionCompletionRequest(resolvedRequest);
      trackRequest(sessionId, completion.usage?.total_tokens || 0);
      return res.json(completion);
    }

    const copilotToken = await getValidatedCopilotToken();

    if (stream) {
      try {
        await handleStreamingCompletion(resolvedRequest, res, sessionId, copilotToken);
      } catch (error) {
        handleStreamingRouteError(res, error, next);
      }
      return;
    }

    const completionData = await makeCompletionRequest(resolvedRequest, copilotToken);
    
    const openAIResponse: OpenAICompletion = {
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: resolvedRequest.model,
      choices: completionData.choices.map((choice, index) => ({
        index,
        message: {
          role: 'assistant',
          content: choice.text,
        },
        finish_reason: choice.finish_reason || 'stop',
      })),
      usage: completionData.usage
    };
    
    trackRequest(sessionId, openAIResponse.usage?.total_tokens || 0);
    res.json(openAIResponse);
  } catch (error) {
    next(error);
  }
});

// Handle streaming completions
async function handleStreamingCompletion(
  request: OpenAICompletionRequest,
  res: express.Response, 
  sessionId: string,
  copilotAccessToken: string
) {
  try {
    const { messages, temperature, max_tokens, max_completion_tokens, top_p, n, stop, model } = request;
    
    // Convert OpenAI messages to Copilot format
    const prompt = convertMessagesToCopilotPrompt(messages);
    const suffix = ""; // Empty for chat completions
    
    // Get machine ID for request
    const machineId = getMachineId();
    
    // Set appropriate headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const completionId = `chatcmpl-${uuidv4()}`;
    const normalizedStop = normalizeStopSequences(stop);
    let sentRoleChunk = false;
    let streamComplete = false;
    
    const completionsUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_COMPLETIONS;
    
    // Set up event source for streaming
    await fetchEventSource(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${copilotAccessToken}`,
        'X-Request-Id': uuidv4(),
        'Machine-Id': machineId,
        'User-Agent': config.github.copilot.clientHeaders.userAgent,
        'Editor-Version': config.github.copilot.clientHeaders.editorVersion,
        'Editor-Plugin-Version': config.github.copilot.clientHeaders.editorPluginVersion,
        'Openai-Organization': config.github.copilot.clientHeaders.openAIOrganization,
        'Openai-Intent': config.github.copilot.clientHeaders.openAIIntent
      },
      body: JSON.stringify({
        prompt,
        suffix,
        max_tokens: max_tokens ?? max_completion_tokens ?? 500,
        temperature: temperature ?? 0.7,
        top_p: top_p ?? 1,
        n: n ?? 1,
        stream: true,
        ...(normalizedStop ? { stop: normalizedStop } : {}),
        extra: {
          language: detectLanguageFromMessages(messages),
          next_indent: 0,
          trim_by_indentation: true,
        }
      }),
      async onopen(response) {
        if (!response.ok) {
          logger.error('Stream connection error', {
            status: response.status,
            statusText: response.statusText
          });
          throw new Error(`Stream connection error: ${response.status} ${response.statusText}`);
        }
      },
      onmessage(msg) {
        if (msg.data === '[DONE]') {
          streamComplete = true;
          res.write('data: [DONE]\n\n');
          return;
        }
        
        try {
          // Parse the data
          const data = JSON.parse(msg.data);
          const text = data.choices?.[0]?.text || '';
          const finishReason = data.choices?.[0]?.finish_reason || null;

          if (!sentRoleChunk) {
            sentRoleChunk = true;
            res.write(`data: ${JSON.stringify({
              id: completionId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: { role: 'assistant' },
                  finish_reason: null
                }
              ]
            })}\n\n`);
          }
          
          // Convert to ChatCompletions format
          const openAiFormatted = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: text ? { content: text } : {},
                finish_reason: finishReason
              }
            ]
          };
          
          res.write(`data: ${JSON.stringify(openAiFormatted)}\n\n`);
        
        // Note: For streaming, we don't have accurate token counts
        // We'll estimate based on response length
        if (text) {
          const estimatedTokens = Math.ceil(text.length / 4);
          trackRequest(sessionId, estimatedTokens);
        }
        } catch (error) {
          logger.error('Error parsing stream message:', error);
          res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
        }
      },
      onerror(err) {
        logger.error('SSE stream error:', err);
        res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
        res.end();
      },
      onclose() {
        if (!streamComplete) {
          res.write('data: [DONE]\n\n');
        }
        res.end();
      }
    });
  } catch (error) {
    logger.error('Error in streaming completion:', error);
    throw error;
  }
}
