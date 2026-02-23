import express from 'express';
import fetch from 'node-fetch';
import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { v4 as uuidv4 } from 'uuid';
import { 
  isTokenValid, 
  getCopilotToken,
  refreshCopilotToken,
  hasGithubToken
} from '../services/auth-service.js';
import { 
  convertMessagesToCopilotPrompt,
  detectLanguageFromMessages,
  makeCompletionRequest,
  convertResponsesInputToMessages,
  mapToCopilotModel,
  convertToolsForCopilot,
  fixToolMessagePairing
} from '../services/copilot-service.js';
import { 
  OpenAICompletionRequest, 
  OpenAICompletion,
  ResponsesRequest,
  ResponsesResponse,
  ResponsesOutput,
  OpenAIMessage,
  LegacyCompletionRequest,
  LegacyCompletion
} from '../types/openai.js';
import { AppError } from '../middleware/error-handler.js';
import { config } from '../config/index.js';
import { getMachineId } from '../utils/machine-id.js';
import { logger } from '../utils/logger.js';
import { trackRequest } from '../services/usage-service.js';

export const openaiRoutes = express.Router();

// Authentication middleware
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // If token is valid, proceed
    if (isTokenValid()) {
      return next();
    }
    
    // Try to refresh token if we have a GitHub token
    if (hasGithubToken()) {
      logger.debug('Token expired, attempting refresh...');
      try {
        await refreshCopilotToken();
        logger.info('Token refreshed successfully');
        return next();
      } catch (refreshError) {
        logger.error('Token refresh failed:', refreshError);
        // Fall through to return 401
      }
    }
    
    // No valid token and couldn't refresh
    const error = new Error('Authentication required') as AppError;
    error.status = 401;
    error.code = 'authentication_required';
    return next(error);
  } catch (error) {
    logger.error('Auth middleware error:', error);
    const authError = new Error('Authentication failed') as AppError;
    authError.status = 401;
    authError.code = 'authentication_failed';
    next(authError);
  }
};

// GET /v1/models - List available models
openaiRoutes.get('/models', requireAuth, (req, res) => {
  // Return models available from GitHub Copilot API
  const timestamp = Math.floor(Date.now() / 1000);
  res.json({
    object: 'list',
    data: [
      // ── Anthropic Claude ─────────────────────────────────────────
      { id: 'claude-haiku-4.5',       object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-opus-4.5',        object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-opus-4.6',        object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-opus-4.6-fast',   object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-sonnet-4',        object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-sonnet-4.5',      object: 'model', created: timestamp, owned_by: 'anthropic' },
      { id: 'claude-sonnet-4.6',      object: 'model', created: timestamp, owned_by: 'anthropic' },

      // ── OpenAI GPT ──────────────────────────────────────────────
      { id: 'gpt-4o',                 object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-4.1',                object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5-mini',             object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.1',                object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.1-codex',          object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.1-codex-mini',     object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.1-codex-max',      object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.2',                object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.2-codex',          object: 'model', created: timestamp, owned_by: 'openai' },
      { id: 'gpt-5.3-codex',          object: 'model', created: timestamp, owned_by: 'openai' },

      // ── Google Gemini ───────────────────────────────────────────
      { id: 'gemini-2.5-pro',         object: 'model', created: timestamp, owned_by: 'google' },
      { id: 'gemini-3-flash',         object: 'model', created: timestamp, owned_by: 'google' },
      { id: 'gemini-3-pro',           object: 'model', created: timestamp, owned_by: 'google' },
      { id: 'gemini-3.1-pro',         object: 'model', created: timestamp, owned_by: 'google' },

      // ── xAI ─────────────────────────────────────────────────────
      { id: 'grok-code-fast-1',       object: 'model', created: timestamp, owned_by: 'xai' },

      // ── GitHub fine-tuned ───────────────────────────────────────
      { id: 'raptor-mini',            object: 'model', created: timestamp, owned_by: 'github' },
      { id: 'goldeneye',              object: 'model', created: timestamp, owned_by: 'github' },
    ]
  });
});

// POST /v1/completions - Legacy completions API (for Cursor tab completions)
openaiRoutes.post('/completions', requireAuth, async (req, res, next) => {
  const sessionId = res.locals.sessionId || `session-${uuidv4()}`;
  trackRequest(sessionId, 0);
  
  try {
    const request = req.body as LegacyCompletionRequest;
    const { prompt, stream = false, model = 'gpt-4o' } = request;
    
    // Validate request
    if (!prompt) {
      const error = new Error('Prompt is required') as AppError;
      error.status = 400;
      error.code = 'invalid_request';
      return next(error);
    }
    
    const copilotToken = getCopilotToken();
    if (!copilotToken) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    // Handle streaming response
    if (stream) {
      handleStreamingLegacyCompletion(req, res, next, sessionId);
    } else {
      // Handle non-streaming response
      try {
        const machineId = getMachineId();
        const completionsUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_COMPLETIONS;
        
        const promptText = Array.isArray(prompt) ? prompt.join('\n') : prompt;
        
        const response = await fetch(completionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${copilotToken.token}`,
            'X-Request-Id': uuidv4(),
            'Vscode-Machineid': machineId,
            'Vscode-Sessionid': sessionId,
            'User-Agent': 'GitHubCopilotChat/0.22.2',
            'Editor-Version': 'vscode/1.96.0',
            'Editor-Plugin-Version': 'copilot-chat/0.22.2',
            'Copilot-Integration-Id': 'vscode-chat',
            'Openai-Intent': 'copilot-ghost'
          },
          body: JSON.stringify({
            prompt: promptText,
            suffix: request.suffix || '',
            max_tokens: request.max_tokens || 500,
            temperature: request.temperature || 0.1,
            top_p: request.top_p || 1,
            n: request.n || 1,
            stream: false,
            stop: request.stop || ['\n\n'],
            extra: {
              language: 'typescript', // Default, could be detected
              next_indent: 0,
              trim_by_indentation: true,
            }
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Completions API error', { status: response.status, error: errorText });
          throw new Error(`Completions API error: ${response.status}`);
        }
        
        const data = await response.json() as any;
        
        // Convert to OpenAI format
        const legacyResponse: LegacyCompletion = {
          id: `cmpl-${uuidv4()}`,
          object: 'text_completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: (data.choices || []).map((choice: any, index: number) => ({
            text: choice.text || '',
            index,
            logprobs: null,
            finish_reason: choice.finish_reason || 'stop',
          })),
          usage: data.usage
        };
        
        // Track token usage
        const totalTokens = legacyResponse.usage?.total_tokens || 0;
        trackRequest(sessionId, totalTokens);
        
        res.json(legacyResponse);
      } catch (error) {
        logger.error('Error in non-streaming legacy completion:', error);
        next(error);
      }
    }
  } catch (error) {
    next(error);
  }
});

// Handle streaming legacy completions (for Cursor tab completions)
async function handleStreamingLegacyCompletion(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
  sessionId: string
) {
  try {
    const request = req.body as LegacyCompletionRequest;
    const { prompt, model = 'gpt-4o' } = request;
    
    const copilotToken = getCopilotToken();
    if (!copilotToken || !copilotToken.token) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    const machineId = getMachineId();
    
    // Set appropriate headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    
    const completionsUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_COMPLETIONS;
    const promptText = Array.isArray(prompt) ? prompt.join('\n') : prompt;
    
    const response = await fetch(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${copilotToken.token}`,
        'X-Request-Id': uuidv4(),
        'Vscode-Machineid': machineId,
        'Vscode-Sessionid': sessionId,
        'User-Agent': 'GitHubCopilotChat/0.22.2',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.22.2',
        'Copilot-Integration-Id': 'vscode-chat',
        'Openai-Intent': 'copilot-ghost'
      },
      body: JSON.stringify({
        prompt: promptText,
        suffix: request.suffix || '',
        max_tokens: request.max_tokens || 500,
        temperature: request.temperature || 0.1,
        top_p: request.top_p || 1,
        n: request.n || 1,
        stream: true,
        stop: request.stop || ['\n\n'],
        extra: {
          language: 'typescript',
          next_indent: 0,
          trim_by_indentation: true,
        }
      }),
    });

    if (!response.ok) {
      logger.error('Stream connection error', {
        status: response.status,
        statusText: response.statusText
      });
      throw new Error(`Stream connection error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Create SSE parser
    const parser = createParser({
      onEvent(event: EventSourceMessage) {
        const data = event.data;
        
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.text || '';
          
          // Convert to legacy completion format
          const legacyFormatted = {
            id: `cmpl-${uuidv4()}`,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                text: text,
                index: 0,
                logprobs: null,
                finish_reason: parsed.choices?.[0]?.finish_reason || null
              }
            ]
          };
          
          res.write(`data: ${JSON.stringify(legacyFormatted)}\n\n`);
          
          if (text) {
            const estimatedTokens = Math.ceil(text.length / 4);
            trackRequest(sessionId, estimatedTokens);
          }
        } catch (error) {
          logger.error('Error parsing stream message:', error);
          res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
        }
      }
    });

    // Process the stream
    const reader = response.body;
    reader.on('data', (chunk: Buffer) => {
      parser.feed(chunk.toString());
    });

    reader.on('end', () => {
      res.end();
    });

    reader.on('error', (err: Error) => {
      logger.error('SSE stream error:', err);
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    });

  } catch (error) {
    logger.error('Error in streaming legacy completion:', error);
    
    if (!res.headersSent) {
      return next(error);
    }
    
    try {
      res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
      res.end();
    } catch (streamError) {
      logger.error('Error sending error response to stream:', streamError);
    }
  }
}

// POST /v1/chat/completions - Create a completion
openaiRoutes.post('/chat/completions', requireAuth, async (req, res, next) => {
  // Track this request
  const sessionId = res.locals.sessionId;
  trackRequest(sessionId, 0); // Initial tracking, token count will be updated later
  try {
    const request = req.body as OpenAICompletionRequest;
    const { messages, stream = false, model = 'gpt-4' } = request;
    
    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const error = new Error('Messages array is required') as AppError;
      error.status = 400;
      error.code = 'invalid_request';
      return next(error);
    }
    
    const copilotToken = getCopilotToken();
    if (!copilotToken) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    // Handle streaming response
    if (stream) {
      handleStreamingCompletion(req, res, next, sessionId);
    } else {
      // Handle non-streaming response
      try {
        const completionData = await makeCompletionRequest(request, copilotToken.token);
        
        // Convert to OpenAI format
        const openAIResponse: OpenAICompletion = {
          id: `chatcmpl-${uuidv4()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
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
        
        // Track token usage
        const totalTokens = openAIResponse.usage?.total_tokens || 0;
        trackRequest(sessionId, totalTokens);
        
        res.json(openAIResponse);
      } catch (error) {
        logger.error('Error in non-streaming completion:', error);
        next(error);
      }
    }
  } catch (error) {
    next(error);
  }
});

// Handle streaming completions
async function handleStreamingCompletion(
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction,
  sessionId: string
) {
  try {
    const request = req.body as OpenAICompletionRequest;
    const { messages: rawMessages, temperature, max_tokens, top_p, n, model = 'gpt-4' } = request;
    const messages = fixToolMessagePairing(rawMessages);
    
    const copilotToken = getCopilotToken();
    if (!copilotToken || !copilotToken.token) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    // Get machine ID for request
    const machineId = getMachineId();
    
    // Set appropriate headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders(); // Ensure headers are sent immediately
    
    const chatUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_CHAT;
    
    // Make streaming request using node-fetch with chat completions format
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${copilotToken.token}`,
        'X-Request-Id': uuidv4(),
        'Vscode-Machineid': machineId,
        'Vscode-Sessionid': sessionId,
        'User-Agent': 'GitHubCopilotChat/0.22.2',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.22.2',
        'Copilot-Integration-Id': 'vscode-chat',
        'Openai-Intent': 'conversation-agent'
      },
      body: JSON.stringify({
        model: mapToCopilotModel(model || 'gpt-4o'),
        messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature || 0.7,
        top_p: top_p || 1,
        n: n || 1,
        stream: true,
        ...(request.tools && request.tools.length > 0 && { tools: request.tools }),
        ...(request.tool_choice && { tool_choice: request.tool_choice }),
        ...(request.parallel_tool_calls !== undefined && { parallel_tool_calls: request.parallel_tool_calls })
      }),
    });

    if (!response.ok) {
      logger.error('Stream connection error', {
        status: response.status,
        statusText: response.statusText
      });
      throw new Error(`Stream connection error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Create SSE parser (v3.x API)
    const parser = createParser({
      onEvent(event: EventSourceMessage) {
        const data = event.data;
        
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          return;
        }
        
        try {
          // Parse the data - chat completions format
          const parsed = JSON.parse(data);
          
          // Chat completions uses delta.content, not text
          const content = parsed.choices?.[0]?.delta?.content || '';
          
          // Convert to ChatCompletions format
          const openAiFormatted = {
            id: parsed.id || `chatcmpl-${uuidv4()}`,
            object: 'chat.completion.chunk',
            created: parsed.created || Math.floor(Date.now() / 1000),
            model: parsed.model || model,
            choices: [
              {
                index: 0,
                delta: {
                  content: content,
                  ...(parsed.choices?.[0]?.delta?.tool_calls && { tool_calls: parsed.choices[0].delta.tool_calls })
                },
                finish_reason: parsed.choices?.[0]?.finish_reason || null
              }
            ]
          };
          
          res.write(`data: ${JSON.stringify(openAiFormatted)}\n\n`);
        
          // Note: For streaming, we don't have accurate token counts
          // We'll estimate based on response length
          if (content) {
            const estimatedTokens = Math.ceil(content.length / 4);
            trackRequest(sessionId, estimatedTokens);
          }
        } catch (error) {
          logger.error('Error parsing stream message:', error);
          res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
        }
      }
    });

    // Process the stream
    const reader = response.body;
    reader.on('data', (chunk: Buffer) => {
      parser.feed(chunk.toString());
    });

    reader.on('end', () => {
      res.end();
    });

    reader.on('error', (err: Error) => {
      logger.error('SSE stream error:', err);
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    });

  } catch (error) {
    logger.error('Error in streaming completion:', error);
    
    // Try to send error to client if response headers haven't been sent
    if (!res.headersSent) {
      return next(error);
    }
    
    // Otherwise try to write error to stream
    try {
      res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
      res.end();
    } catch (streamError) {
      logger.error('Error sending error response to stream:', streamError);
    }
  }
}

// POST /v1/responses - OpenAI Responses API (newer format)
openaiRoutes.post('/responses', requireAuth, async (req, res, next) => {
  const sessionId = res.locals.sessionId || 'default';
  trackRequest(sessionId, 0);
  
  try {
    const request = req.body as ResponsesRequest;
    const { input, instructions, stream = false, model = 'gpt-4' } = request;
    
    logger.debug('Responses API request', { 
      stream, 
      model, 
      hasInput: !!input,
      inputType: typeof input 
    });
    
    // Validate request
    if (!input) {
      const error = new Error('Input is required') as AppError;
      error.status = 400;
      error.code = 'invalid_request';
      return next(error);
    }
    
    const copilotToken = getCopilotToken();
    if (!copilotToken) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    // Convert Responses API input to OpenAI messages format
    const rawMessages = convertResponsesInputToMessages(input, instructions);
    const messages = fixToolMessagePairing(rawMessages);
    
    // Handle streaming response
    if (stream) {
      handleStreamingResponses(req, res, next, sessionId, messages, model);
    } else {
      // Handle non-streaming response
      try {
        const completionRequest: OpenAICompletionRequest = {
          model,
          messages,
          temperature: request.temperature,
          max_tokens: request.max_output_tokens,
          top_p: request.top_p,
        };
        
        const completionData = await makeCompletionRequest(completionRequest, copilotToken.token);
        
        // Convert to Responses API format
        const responseId = `resp_${uuidv4()}`;
        const outputId = `msg_${uuidv4()}`;
        
        const responseOutput: ResponsesOutput = {
          type: 'message',
          id: outputId,
          status: 'completed',
          role: 'assistant',
          content: completionData.choices.map(choice => ({
            type: 'output_text' as const,
            text: choice.text
          }))
        };
        
        const response: ResponsesResponse = {
          id: responseId,
          object: 'response',
          created_at: Math.floor(Date.now() / 1000),
          model,
          status: 'completed',
          output: [responseOutput],
          usage: completionData.usage ? {
            input_tokens: completionData.usage.prompt_tokens,
            output_tokens: completionData.usage.completion_tokens,
            total_tokens: completionData.usage.total_tokens
          } : undefined,
          metadata: request.metadata
        };
        
        // Track token usage
        const totalTokens = response.usage?.total_tokens || 0;
        trackRequest(sessionId, totalTokens);
        
        res.json(response);
      } catch (error) {
        logger.error('Error in non-streaming responses:', error);
        next(error);
      }
    }
  } catch (error) {
    next(error);
  }
});

// Handle streaming for Responses API
async function handleStreamingResponses(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
  sessionId: string,
  messages: OpenAIMessage[],
  model: string
) {
  try {
    const request = req.body as ResponsesRequest;
    
    const copilotToken = getCopilotToken();
    if (!copilotToken || !copilotToken.token) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    const machineId = getMachineId();
    
    // Set appropriate headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders(); // Ensure headers are sent immediately
    
    const chatUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_CHAT;
    const responseId = `resp_${uuidv4()}`;
    const outputId = `msg_${uuidv4()}`;
    const contentPartId = `cp_${uuidv4()}`;
    let accumulatedText = '';
    let firstChunk = true;
    let completionSent = false;
    const startTime = Date.now();
    
    // Track tool calls for logging
    const toolCallsReceived: Array<{id: string, name: string, argumentsLength: number}> = [];
    let totalChunks = 0;
    
    // Convert tools to Copilot-compatible format
    const convertedTools = convertToolsForCopilot(request.tools);
    
    // Fix tool message pairing to avoid orphaned tool_results
    const fixedMessages = fixToolMessagePairing(messages);
    
    // Debug log the request being made
    const mappedModel = mapToCopilotModel(model || 'gpt-4o');
    logger.debug('Responses API streaming request details', {
      chatUrl,
      requestedModel: model,
      mappedModel,
      originalMessageCount: messages.length,
      fixedMessageCount: fixedMessages.length,
      hasTools: !!convertedTools,
      originalToolCount: request.tools?.length || 0,
      convertedToolCount: convertedTools?.length || 0
    });
    
    // Send initial response.created event
    res.write(`event: response.created\ndata: ${JSON.stringify({
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        model,
        status: 'in_progress',
        output: []
      }
    })}\n\n`);
    
    // Make streaming request using node-fetch with chat completions format
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${copilotToken.token}`,
        'X-Request-Id': uuidv4(),
        'Vscode-Machineid': machineId,
        'Vscode-Sessionid': sessionId,
        'User-Agent': 'GitHubCopilotChat/0.22.2',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.22.2',
        'Copilot-Integration-Id': 'vscode-chat',
        'Openai-Intent': 'conversation-agent'
      },
      body: JSON.stringify({
        model: mapToCopilotModel(model || 'gpt-4o'),
        messages: fixedMessages,
        max_tokens: request.max_output_tokens || 4096,
        temperature: request.temperature || 0.7,
        top_p: request.top_p || 1,
        n: 1,
        stream: true,
        ...(convertedTools && convertedTools.length > 0 && { tools: convertedTools }),
        ...(request.tool_choice && { tool_choice: request.tool_choice }),
        ...(request.parallel_tool_calls !== undefined && { parallel_tool_calls: request.parallel_tool_calls })
      }),
    });

    if (!response.ok) {
      // Read the error response body to understand the actual error
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = 'Unable to read error body';
      }
      logger.error('Stream connection error (Responses API)', {
        status: response.status,
        statusText: response.statusText,
        errorBody,
        requestModel: model,
        mappedModel: mapToCopilotModel(model || 'gpt-4o')
      });
      throw new Error(`Stream connection error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Create SSE parser (v3.x API)
    const parser = createParser({
      onEvent(event: EventSourceMessage) {
        const data = event.data;
        
        if (data === '[DONE]') {
          if (completionSent) return;
          completionSent = true;
          
          // Send response.output_text.done
          res.write(`event: response.output_text.done\ndata: ${JSON.stringify({
            type: 'response.output_text.done',
            item_id: outputId,
            output_index: 0,
            content_index: 0,
            text: accumulatedText
          })}\n\n`);
          
          // Send response.output_item.done
          res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
            type: 'response.output_item.done',
            item: {
              type: 'message',
              id: outputId,
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: accumulatedText }]
            },
            output_index: 0
          })}\n\n`);
          
          // Send response.completed event
          res.write(`event: response.completed\ndata: ${JSON.stringify({
            type: 'response.completed',
            response: {
              id: responseId,
              object: 'response',
              created_at: Math.floor(Date.now() / 1000),
              model,
              status: 'completed',
              output: [{
                type: 'message',
                id: outputId,
                status: 'completed',
                role: 'assistant',
                content: [{ type: 'output_text', text: accumulatedText }]
              }]
            }
          })}\n\n`);
          
          // Send response.done (final event)
          res.write(`event: response.done\ndata: ${JSON.stringify({
            type: 'response.done',
            response: {
              id: responseId,
              object: 'response',
              created_at: Math.floor(Date.now() / 1000),
              model,
              status: 'completed',
              output: [{
                type: 'message',
                id: outputId,
                status: 'completed',
                role: 'assistant',
                content: [{ type: 'output_text', text: accumulatedText }]
              }]
            }
          })}\n\n`);
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          // Chat completions uses delta.content, not text
          const text = parsed.choices?.[0]?.delta?.content || '';
          
          // Handle tool_calls from the model
          const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
          if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
              if (toolCall.id && toolCall.function?.name) {
                // Log tool call received
                logger.info('Tool call received', {
                  responseId,
                  toolId: toolCall.id,
                  toolName: toolCall.function.name,
                  model: mappedModel
                });
                
                // Track for final summary
                toolCallsReceived.push({
                  id: toolCall.id,
                  name: toolCall.function.name,
                  argumentsLength: (toolCall.function.arguments || '').length
                });
                
                // Send function_call output item
                const functionCallId = `call_${uuidv4()}`;
                res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
                  type: 'response.output_item.added',
                  item: {
                    type: 'function_call',
                    id: functionCallId,
                    call_id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments || '',
                    status: 'in_progress'
                  },
                  output_index: 0
                })}\n\n`);
              } else if (toolCall.function?.arguments) {
                // Stream function arguments delta
                res.write(`event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
                  type: 'response.function_call_arguments.delta',
                  delta: toolCall.function.arguments
                })}\n\n`);
              }
            }
          }

          if (text) {
            // On first chunk, send output_item.added and content_part.added
            if (firstChunk) {
              firstChunk = false;
              
              // Send response.output_item.added
              res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
                type: 'response.output_item.added',
                item: {
                  type: 'message',
                  id: outputId,
                  status: 'in_progress',
                  role: 'assistant',
                  content: []
                },
                output_index: 0
              })}\n\n`);
              
              // Send response.content_part.added
              res.write(`event: response.content_part.added\ndata: ${JSON.stringify({
                type: 'response.content_part.added',
                item_id: outputId,
                output_index: 0,
                content_index: 0,
                part: {
                  type: 'output_text',
                  text: ''
                }
              })}\n\n`);
            }
            
            accumulatedText += text;
            
            // Send response.output_text.delta event
            const deltaEvent = {
              type: 'response.output_text.delta',
              item_id: outputId,
              output_index: 0,
              content_index: 0,
              delta: text
            };
            res.write(`event: response.output_text.delta\ndata: ${JSON.stringify(deltaEvent)}\n\n`);
            
            // Track tokens (silently)
            const estimatedTokens = Math.ceil(text.length / 4);
            trackRequest(sessionId, estimatedTokens);
          }
        } catch (error) {
          logger.error('Error parsing stream message:', error);
          res.write(`event: error\ndata: ${JSON.stringify({ 
            type: 'error',
            error: { message: String(error) } 
          })}\n\n`);
        }
      }
    });

    // Process the stream for Responses API
    const reader = response.body;
    reader.on('data', (chunk: Buffer) => {
      totalChunks++;
      parser.feed(chunk.toString());
    });

    reader.on('end', () => {
      const duration = Date.now() - startTime;
      const estimatedTokens = Math.ceil(accumulatedText.length / 4);
      
      // Comprehensive final response log
      logger.info('Response stream completed', { 
        responseId,
        model: mappedModel,
        duration: `${duration}ms`,
        textLength: accumulatedText.length,
        estimatedTokens,
        totalChunks,
        toolCallCount: toolCallsReceived.length,
        toolsCalled: toolCallsReceived.map(t => t.name),
        preview: accumulatedText.substring(0, 100) + (accumulatedText.length > 100 ? '...' : '')
      });
      
      // Send completion events when stream ends (Copilot doesn't send [DONE])
      if (accumulatedText.length > 0 && !completionSent) {
        completionSent = true;
        // Send response.output_text.done
        res.write(`event: response.output_text.done\ndata: ${JSON.stringify({
          type: 'response.output_text.done',
          item_id: outputId,
          output_index: 0,
          content_index: 0,
          text: accumulatedText
        })}\n\n`);
        
        // Send response.output_item.done
        res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          item: {
            type: 'message',
            id: outputId,
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: accumulatedText }]
          },
          output_index: 0
        })}\n\n`);
        
        // Send response.completed event
        res.write(`event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: responseId,
            object: 'response',
            created_at: Math.floor(Date.now() / 1000),
            model,
            status: 'completed',
            output: [{
              type: 'message',
              id: outputId,
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: accumulatedText }]
            }]
          }
        })}\n\n`);
        
        // Send response.done (final event)
        res.write(`event: response.done\ndata: ${JSON.stringify({
          type: 'response.done',
          response: {
            id: responseId,
            object: 'response',
            created_at: Math.floor(Date.now() / 1000),
            model,
            status: 'completed',
            output: [{
              type: 'message',
              id: outputId,
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: accumulatedText }]
            }]
          }
        })}\n\n`);
      }
      
      res.end();
    });

    reader.on('error', (err: Error) => {
      logger.error('SSE stream error:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ 
        type: 'error',
        error: { message: String(err) } 
      })}\n\n`);
      res.end();
    });

  } catch (error) {
    logger.error('Error in streaming responses:', error);
    
    if (!res.headersSent) {
      return next(error);
    }
    
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ 
        type: 'error',
        error: { message: String(error) } 
      })}\n\n`);
      res.end();
    } catch (streamError) {
      logger.error('Error sending error response to stream:', streamError);
    }
  }
}





