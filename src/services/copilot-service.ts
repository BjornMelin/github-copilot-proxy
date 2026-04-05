import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { 
  OpenAIContentPart,
  OpenAIMessage, 
  OpenAICompletionRequest 
} from '../types/openai.js';
import { CopilotCompletionResponse } from '../types/github.js';
import { getMachineId } from '../utils/machine-id.js';
import { logger } from '../utils/logger.js';

function getTextFromContentParts(parts: OpenAIContentPart[]): string {
  return parts
    .filter((part): part is Extract<OpenAIContentPart, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

export function getMessageTextContent(content: OpenAIMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return getTextFromContentParts(content);
  }

  return '';
}

export function normalizeStopSequences(stop?: string | string[]): string[] | undefined {
  if (!stop) {
    return undefined;
  }

  if (typeof stop === 'string') {
    return [stop];
  }

  return stop.filter(Boolean);
}

/**
 * Converts OpenAI messages format to GitHub Copilot prompt format
 * 
 * @param messages Array of OpenAI messages
 * @returns Formatted prompt string for Copilot
 */
export function convertMessagesToCopilotPrompt(messages: OpenAIMessage[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  const promptParts: string[] = [];
  let lastRole: OpenAIMessage['role'] | null = null;

  for (const message of messages) {
    const content = getMessageTextContent(message.content);

    if (!message.role || !content) {
      continue;
    }

    switch (message.role) {
      case 'system':
      case 'developer':
        promptParts.push(`System: ${content}`);
        break;
      case 'user':
        promptParts.push(`User: ${content}`);
        break;
      case 'assistant':
        promptParts.push(`Assistant: ${content}`);
        break;
      case 'tool':
      case 'function':
        promptParts.push(`Tool: ${content}`);
        break;
    }

    lastRole = message.role;
  }

  if (lastRole && lastRole !== 'assistant') {
    promptParts.push('Assistant: ');
  }

  return promptParts.join('\n\n');
}

/**
 * Detects programming language from the message content
 * 
 * @param messages Array of OpenAI messages
 * @returns Detected language or default to javascript
 */
export function detectLanguageFromMessages(messages: OpenAIMessage[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return 'javascript';
  }
  
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) {
    return 'javascript';
  }

  const content = getMessageTextContent(lastUserMessage.content);
  if (!content) {
    return 'javascript';
  }
  
  // Check for code blocks with language specifications
  const codeBlockMatch = content.match(/```(\w+)/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].toLowerCase();
  }
  
  // Check for file extensions in the message
  const fileExtensionMatch = content.match(/\.([a-zA-Z0-9]+)(?:\s|"|'|$|[?!.,:;])/);
  if (fileExtensionMatch && fileExtensionMatch[1]) {
    const ext = fileExtensionMatch[1].toLowerCase();
    const extToLang: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rb': 'ruby',
      'php': 'php',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    return extToLang[ext] || 'javascript';
  }
  
  return 'javascript';
}

/**
 * Makes a non-streaming request to GitHub Copilot API
 * 
 * @param request OpenAI-format completion request
 * @param copilotToken Copilot authentication token
 * @returns Promise with the completion response
 */
export async function makeCompletionRequest(
  request: OpenAICompletionRequest,
  copilotToken: string
): Promise<CopilotCompletionResponse> {
  const { messages, temperature, max_tokens, max_completion_tokens, top_p, n, stop } = request;
  
  // Convert OpenAI format to Copilot format
  const prompt = convertMessagesToCopilotPrompt(messages);
  const suffix = ""; // Empty for chat completions
  
  // Get machine ID for request
  const machineId = getMachineId();
  
  // Prepare request parameters
  const completionsUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_COMPLETIONS;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${copilotToken}`,
    'X-Request-Id': uuidv4(),
    'Machine-Id': machineId,
    'User-Agent': config.github.copilot.clientHeaders.userAgent,
    'Editor-Version': config.github.copilot.clientHeaders.editorVersion,
    'Editor-Plugin-Version': config.github.copilot.clientHeaders.editorPluginVersion,
    'Openai-Organization': config.github.copilot.clientHeaders.openAIOrganization,
    'Openai-Intent': config.github.copilot.clientHeaders.openAIIntent
  };

  const normalizedStop = normalizeStopSequences(stop);
  
  const body = {
    prompt,
    suffix,
    max_tokens: max_tokens ?? max_completion_tokens ?? 500,
    temperature: temperature ?? 0.7,
    top_p: top_p ?? 1,
    n: n ?? 1,
    stream: false,
    ...(normalizedStop ? { stop: normalizedStop } : {}),
    extra: {
      language: detectLanguageFromMessages(messages),
      next_indent: 0,
      trim_by_indentation: true,
    }
  };
  
  try {
    logger.debug('Making completion request to Copilot', { completionsUrl });
    
    const response = await fetch(completionsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      logger.error('Copilot API error', { 
        status: response.status, 
        statusText: response.statusText 
      });
      throw new Error(`Copilot API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as CopilotCompletionResponse;
    return data;
  } catch (error) {
    logger.error('Error making completion request', { error });
    throw error;
  }
}
