import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { 
  OpenAIMessage, 
  OpenAICompletionRequest 
} from '../types/openai.js';
import { CopilotCompletionResponse } from '../types/github.js';
import { getMachineId } from '../utils/machine-id.js';
import { logger } from '../utils/logger.js';

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
  
  let systemPrompt = '';
  let userPrompts = '';
  let assistantResponses = '';
  
  // Process messages in order to construct a coherent prompt
  for (const message of messages) {
    if (!message.role || !message.content) continue;
    
    switch (message.role) {
      case 'system':
        systemPrompt += message.content + '\n\n';
        break;
      case 'user':
        userPrompts += 'User: ' + message.content + '\n\n';
        break;
      case 'assistant':
        assistantResponses += 'Assistant: ' + message.content + '\n\n';
        break;
    }
  }
  
  // Ensure it ends with a user message to prompt a response
  const lastMessage = messages[messages.length - 1];
  const needsAssistantPrompt = lastMessage.role !== 'user';
  
  return systemPrompt + userPrompts + assistantResponses + (needsAssistantPrompt ? '' : 'Assistant: ');
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
  if (!lastUserMessage || !lastUserMessage.content) {
    return 'javascript';
  }
  
  const content = lastUserMessage.content;
  
  // Check for code blocks with language specifications
  const codeBlockMatch = content.match(/```(\w+)/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].toLowerCase();
  }
  
  // Check for file extensions in the message
  const fileExtensionMatch = content.match(/\.([a-zA-Z0-9]+)(?:\s|"|')/);
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
  const { messages, temperature, max_tokens, top_p, n } = request;
  
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
    'User-Agent': 'GitHubCopilotChat/0.12.0',
    'Editor-Version': 'Cursor-IDE/1.0.0',
    'Editor-Plugin-Version': 'copilot-cursor/1.0.0',
    'Openai-Organization': 'github-copilot',
    'Openai-Intent': 'copilot-ghost'
  };
  
  const body = {
    prompt,
    suffix,
    max_tokens: max_tokens || 500,
    temperature: temperature || 0.7,
    top_p: top_p || 1,
    n: n || 1,
    stream: false,
    stop: ["\n\n"],
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
