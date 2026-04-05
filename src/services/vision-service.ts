import { Response } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../middleware/error-handler.js';
import { OpenAICompletion, OpenAICompletionRequest } from '../types/openai.js';
import { logger } from '../utils/logger.js';

function createVisionError(message: string, status: number, code: string): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code;
  return error;
}

function getVisionChatCompletionsUrl(): string {
  if (!config.providers.vision.enabled || !config.providers.vision.baseUrl) {
    throw createVisionError('Vision backend is not configured.', 501, 'vision_backend_not_configured');
  }

  return `${config.providers.vision.baseUrl}/chat/completions`;
}

function getVisionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.providers.vision.apiKey) {
    headers.Authorization = `Bearer ${config.providers.vision.apiKey}`;
  }

  return headers;
}

async function parseUpstreamError(response: globalThis.Response): Promise<AppError> {
  let message = `Vision backend error: ${response.status} ${response.statusText}`;

  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json() as { error?: { message?: string; code?: string } };
      message = payload.error?.message || message;
      return createVisionError(message, response.status, payload.error?.code || 'vision_backend_error');
    }

    const text = await response.text();
    if (text) {
      message = text;
    }
  } catch (error) {
    logger.warn('Unable to parse vision backend error response', { error });
  }

  return createVisionError(message, response.status, 'vision_backend_error');
}

export async function makeVisionCompletionRequest(
  request: OpenAICompletionRequest
): Promise<OpenAICompletion> {
  const response = await fetch(getVisionChatCompletionsUrl(), {
    method: 'POST',
    headers: getVisionHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await parseUpstreamError(response);
  }

  return await response.json() as OpenAICompletion;
}

export async function streamVisionCompletion(
  request: OpenAICompletionRequest,
  res: Response
): Promise<void> {
  const response = await fetch(getVisionChatCompletionsUrl(), {
    method: 'POST',
    headers: getVisionHeaders(),
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok) {
    throw await parseUpstreamError(response);
  }

  if (!response.body) {
    throw createVisionError('Vision backend returned an empty stream.', 502, 'vision_backend_empty_stream');
  }

  res.status(response.status);
  res.setHeader('Content-Type', response.headers.get('content-type') || 'text/event-stream');
  res.setHeader('Cache-Control', response.headers.get('cache-control') || 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (error) {
    logger.error('Error proxying vision stream', { error });
    throw createVisionError('Failed to proxy vision stream.', 502, 'vision_stream_proxy_failed');
  }
}