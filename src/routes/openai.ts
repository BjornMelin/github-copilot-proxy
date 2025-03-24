import express from 'express';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { v4 as uuidv4 } from 'uuid';
import { 
  isTokenValid, 
  getCopilotToken,
  refreshCopilotToken 
} from '../services/auth-service.js';
import { 
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

export const openaiRoutes = express.Router();

// Authentication middleware
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!isTokenValid()) {
    const error = new Error('Authentication required') as AppError;
    error.status = 401;
    error.code = 'authentication_required';
    return next(error);
  }

  try {
    // Check if token needs refreshing
    if (getCopilotToken() && !isTokenValid()) {
      await refreshCopilotToken();
    }
    next();
  } catch (error) {
    logger.error('Token refresh failed in middleware:', error);
    const authError = new Error('Authentication failed') as AppError;
    authError.status = 401;
    authError.code = 'authentication_failed';
    next(authError);
  }
};

// GET /v1/models - List available models
openaiRoutes.get('/models', requireAuth, (req, res) => {
  // Return a simple model list that includes models compatible with GitHub Copilot
  res.json({
    object: 'list',
    data: [
      {
        id: 'gpt-4',
        object: 'model',
        created: Date.now(),
        owned_by: 'github-copilot',
      },
      {
        id: 'gpt-4o',
        object: 'model',
        created: Date.now(),
        owned_by: 'github-copilot',
      },
      {
        id: 'gpt-3.5-turbo',
        object: 'model',
        created: Date.now(),
        owned_by: 'github-copilot',
      }
    ]
  });
});

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
      handleStreamingCompletion(req, res, next);
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
  next: express.NextFunction
) {
  try {
    const request = req.body as OpenAICompletionRequest;
    const { messages, temperature, max_tokens, top_p, n, model = 'gpt-4' } = request;
    
    const copilotToken = getCopilotToken();
    if (!copilotToken || !copilotToken.token) {
      const error = new Error('Authentication required') as AppError;
      error.status = 401;
      error.code = 'authentication_required';
      return next(error);
    }
    
    // Convert OpenAI messages to Copilot format
    const prompt = convertMessagesToCopilotPrompt(messages);
    const suffix = ""; // Empty for chat completions
    
    // Get machine ID for request
    const machineId = getMachineId();
    
    // Set appropriate headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const completionsUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_COMPLETIONS;
    
    // Set up event source for streaming
    await fetchEventSource(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${copilotToken.token}`,
        'X-Request-Id': uuidv4(),
        'Machine-Id': machineId,
        'User-Agent': 'GitHubCopilotChat/0.12.0',
        'Editor-Version': 'Cursor-IDE/1.0.0',
        'Editor-Plugin-Version': 'copilot-cursor/1.0.0',
        'Openai-Organization': 'github-copilot',
        'Openai-Intent': 'copilot-ghost'
      },
      body: JSON.stringify({
        prompt,
        suffix,
        max_tokens: max_tokens || 500,
        temperature: temperature || 0.7,
        top_p: top_p || 1,
        n: n || 1,
        stream: true,
        stop: ["\n\n"],
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
          res.write('data: [DONE]\n\n');
          return;
        }
        
        try {
          // Parse the data
          const data = JSON.parse(msg.data);
          
          // Convert to ChatCompletions format
          const openAiFormatted = {
            id: `chatcmpl-${uuidv4()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: {
                  content: data.choices[0].text
                },
                finish_reason: data.choices[0].finish_reason || null
              }
            ]
          };
          
          res.write(`data: ${JSON.stringify(openAiFormatted)}\n\n`);
        
        // Note: For streaming, we don't have accurate token counts
        // We'll estimate based on response length
        if (data.choices[0].text) {
          const estimatedTokens = Math.ceil(data.choices[0].text.length / 4);
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
        res.end();
      }
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
