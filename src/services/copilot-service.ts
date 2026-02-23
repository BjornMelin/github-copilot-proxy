import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import {
  OpenAIMessage,
  OpenAICompletionRequest,
  ResponsesInput,
  ResponsesContentPart,
  Tool,
  ToolCall
} from '../types/openai.js';
import { CopilotCompletionResponse } from '../types/github.js';
import { getMachineId } from '../utils/machine-id.js';
import { logger } from '../utils/logger.js';

const MODEL_MAPPING: Record<string, string> = {
  // ── Anthropic Claude ─────────────────────────────────────────────
  'claude-haiku-4.5':            'claude-haiku-4.5',
  'claude-4.5-haiku':            'claude-haiku-4.5',
  'claude-opus-4.5':             'claude-opus-4.5',
  'claude-4.5-opus':             'claude-opus-4.5',
  'claude-opus-4.6':             'claude-opus-4.6',
  'claude-4.6-opus':             'claude-opus-4.6',
  'claude-opus-4.6-fast':        'claude-opus-4.6-fast',
  'claude-sonnet-4':             'claude-sonnet-4',
  'claude-4-sonnet':             'claude-sonnet-4',
  'claude-sonnet-4.5':           'claude-sonnet-4.5',
  'claude-4.5-sonnet':           'claude-sonnet-4.5',
  'claude-sonnet-4.6':           'claude-sonnet-4.6',
  'claude-4.6-sonnet':           'claude-sonnet-4.6',

  // ── OpenAI GPT ──────────────────────────────────────────────────
  'gpt-4o':                      'gpt-4o',
  'gpt-4.1':                     'gpt-4.1',
  'gpt-5-mini':                  'gpt-5-mini',
  'gpt-5.1':                     'gpt-5.1',
  'gpt-5.1-codex':               'gpt-5.1-codex',
  'gpt-5.1-codex-mini':          'gpt-5.1-codex-mini',
  'gpt-5.1-codex-max':           'gpt-5.1-codex-max',
  'gpt-5.2':                     'gpt-5.2',
  'gpt-5.2-codex':               'gpt-5.2-codex',
  'gpt-5.3-codex':               'gpt-5.3-codex',

  // ── Google Gemini ───────────────────────────────────────────────
  'gemini-2.5-pro':              'gemini-2.5-pro',
  'gemini-3-flash':              'gemini-3-flash',
  'gemini-3-pro':                'gemini-3-pro',
  'gemini-3.1-pro':              'gemini-3.1-pro',

  // ── xAI ─────────────────────────────────────────────────────────
  'grok-code-fast-1':            'grok-code-fast-1',

  // ── GitHub fine-tuned ───────────────────────────────────────────
  'raptor-mini':                 'raptor-mini',
  'goldeneye':                   'goldeneye',

  // ── Backward-compatible aliases for retired models ──────────────
  'claude-3.5-sonnet':           'claude-sonnet-4.6',   // retired 2025-11-06
  'claude-3-opus':               'claude-opus-4.6',     // retired
  'claude-3-sonnet':             'claude-sonnet-4.6',   // retired
  'claude-opus-4':               'claude-opus-4.6',     // retired 2025-10-23
  'claude-4-opus':               'claude-opus-4.6',     // retired
  'claude-opus-4.1':             'claude-opus-4.6',     // retired 2026-02-17
  'gpt-4':                       'gpt-4.1',             // legacy
  'gpt-4-turbo':                 'gpt-4.1',             // legacy
  'gpt-4o-mini':                 'gpt-5-mini',          // legacy
  'gpt-3.5-turbo':               'gpt-4.1',             // legacy
  'gpt-5':                       'gpt-5.2',             // retired 2026-02-17
  'gpt-5-codex':                 'gpt-5.2-codex',       // retired 2026-02-17
  'o1':                          'gpt-5-mini',          // retired 2025-10-23
  'o1-preview':                  'gpt-5-mini',          // retired 2025-10-23
  'o1-mini':                     'gpt-5-mini',          // retired 2025-10-23
  'o3':                          'gpt-5.2',             // retired 2025-10-23
  'o3-mini':                     'gpt-5-mini',          // retired 2025-10-23
  'o4-mini':                     'gpt-5-mini',          // retired 2025-10-23
  'gemini-2.0-flash':            'gemini-2.5-pro',      // retired 2025-10-23
  'gemini-3-pro-preview':        'gemini-3-pro',        // alias
  'gemini-3-flash-preview':      'gemini-3-flash',      // alias

  // ── Default ─────────────────────────────────────────────────────
  'default':                     'gpt-4o'
};

export function mapToCopilotModel(requestedModel: string): string {
  const mapped = MODEL_MAPPING[requestedModel.toLowerCase()];
  if (mapped) {
    logger.debug('Model mapped', { from: requestedModel, to: mapped });
    return mapped;
  }
  logger.warn('Unknown model requested, using as-is', { requestedModel });
  return requestedModel;
}

// Convert tools from various formats (Responses API, custom, etc.) to Copilot-compatible format
export function convertToolsForCopilot(tools?: any[]): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  
  const convertedTools: Tool[] = [];
  
  for (const tool of tools) {
    // Skip invalid tools
    if (!tool) continue;
    
    // Handle standard function type
    if (tool.type === 'function' && tool.function) {
      // Ensure the function has a valid name
      if (tool.function.name && typeof tool.function.name === 'string' && tool.function.name.length > 0) {
        convertedTools.push({
          type: 'function' as const,
          function: {
            name: tool.function.name,
            description: tool.function.description || '',
            parameters: tool.function.parameters || { type: 'object', properties: {} },
            strict: tool.function.strict
          }
        });
      } else {
        logger.warn('Skipping tool with invalid function name', { tool: JSON.stringify(tool).substring(0, 200) });
      }
    }
    // Handle custom type (some APIs use this)
    else if (tool.type === 'custom' && tool.custom) {
      if (tool.custom.name && typeof tool.custom.name === 'string' && tool.custom.name.length > 0) {
        convertedTools.push({
          type: 'function' as const,
          function: {
            name: tool.custom.name,
            description: tool.custom.description || '',
            parameters: tool.custom.parameters || { type: 'object', properties: {} }
          }
        });
      } else {
        logger.warn('Skipping custom tool with invalid name', { tool: JSON.stringify(tool).substring(0, 200) });
      }
    }
    // Handle direct function definition (legacy format)
    else if (tool.name && typeof tool.name === 'string') {
      convertedTools.push({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || { type: 'object', properties: {} }
        }
      });
    }
    // Handle web_search_preview and other special types - skip these
    else if (tool.type === 'web_search_preview' || tool.type === 'code_interpreter' || tool.type === 'file_search') {
      logger.debug('Skipping unsupported tool type', { toolType: tool.type });
    }
    else {
      logger.warn('Skipping tool with unrecognized format', { tool: JSON.stringify(tool).substring(0, 200) });
    }
  }
  
  if (convertedTools.length === 0) {
    return undefined;
  }
  
  logger.debug('Tools converted for Copilot', { 
    originalCount: tools.length, 
    convertedCount: convertedTools.length,
    toolNames: convertedTools.map(t => t.function.name)
  });
  
  return convertedTools;
}

/**
 * Validates and fixes message history to ensure tool_use/tool_result pairing is correct.
 * Claude requires that each tool_result references a tool_use from the immediately preceding assistant message.
 */
export function fixToolMessagePairing(messages: OpenAIMessage[]): OpenAIMessage[] {
  const fixed: OpenAIMessage[] = [];
  const toolUseIds = new Set<string>();
  const orphanedToolResults: string[] = [];
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Track tool_use IDs from assistant messages
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) toolUseIds.add(tc.id);
      }
    }
    
    // For tool messages, check if the tool_call_id exists
    if (msg.role === 'tool' && msg.tool_call_id) {
      if (!toolUseIds.has(msg.tool_call_id)) {
        // This tool_result references a tool_use that doesn't exist
        // Convert it to a regular user message with context
        orphanedToolResults.push(msg.tool_call_id);
        fixed.push({
          role: 'user',
          content: `[Previous tool result: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : msg.content}${typeof msg.content === 'string' && msg.content.length > 200 ? '...' : ''}]`
        });
        continue;
      }
    }
    
    fixed.push(msg);
  }
  
  // Log summary of orphaned tool results (not each one individually)
  if (orphanedToolResults.length > 0) {
    logger.debug('Fixed orphaned tool_results in message history', {
      count: orphanedToolResults.length,
      toolCallIds: orphanedToolResults.slice(0, 3).map(id => id.substring(0, 20) + '...'),
      hasMore: orphanedToolResults.length > 3
    });
  }
  
  return fixed;
}

export async function makeCompletionRequest(
  request: OpenAICompletionRequest,
  copilotToken: string
): Promise<CopilotCompletionResponse> {
  const { model, temperature, max_tokens, top_p, n, tools, tool_choice, parallel_tool_calls } = request;
  
  // Fix tool message pairing before sending
  const messages = fixToolMessagePairing(request.messages);
  
  const machineId = getMachineId();
  const chatUrl = config.github.copilot.apiEndpoints.GITHUB_COPILOT_CHAT;
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${copilotToken}`,
    'X-Request-Id': uuidv4(),
    'Vscode-Machineid': machineId,
    'Vscode-Sessionid': uuidv4(),
    'User-Agent': 'GitHubCopilotChat/0.22.2',
    'Editor-Version': 'vscode/1.96.0',
    'Editor-Plugin-Version': 'copilot-chat/0.22.2',
    'Copilot-Integration-Id': 'vscode-chat',
    'Openai-Intent': 'conversation-agent'
  };

  const copilotModel = mapToCopilotModel(model || 'gpt-4o');

  const body: Record<string, any> = {
    model: copilotModel,
    messages,
    max_tokens: max_tokens || 4096,
    temperature: temperature || 0.7,
    top_p: top_p || 1,
    n: n || 1,
    stream: false
  };

  if (tools && tools.length > 0) {
    body.tools = convertToolsForCopilot(tools);
    logger.debug('Including tools in request', { toolCount: tools.length, toolNames: tools.map(t => t.function.name) });
  }

  if (tool_choice) {
    body.tool_choice = tool_choice;
  }

  if (parallel_tool_calls !== undefined) {
    body.parallel_tool_calls = parallel_tool_calls;
  }

  try {
    logger.debug('Making chat completion request to Copilot', { 
      chatUrl, 
      model: copilotModel, 
      hasTools: !!tools,
      toolChoice: tool_choice,
      messageCount: messages.length
    });
    
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Copilot API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
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

export function convertResponsesInputToMessages(
  input: string | ResponsesInput[],
  instructions?: string
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return messages;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item.type === 'function_call_output') {
        messages.push({
          role: 'tool',
          content: item.output || '',
          tool_call_id: item.call_id
        });
        continue;
      }

      if (item.type === 'message' || (item.role && !item.type)) {
        let content: string;
        
        if (typeof item.content === 'string') {
          content = item.content;
        } else if (Array.isArray(item.content)) {
          content = item.content
            .filter((part): part is ResponsesContentPart =>
              part.type === 'input_text' || part.type === 'output_text' || part.type === 'text'
            )
            .map(part => part.text)
            .join('');
        } else {
          content = '';
        }

        const itemRole = item.role === 'user' ? 'user' :
                         item.role === 'assistant' ? 'assistant' :
                         item.role === 'system' ? 'system' :
                         item.role === 'developer' ? 'system' : 'user';

        messages.push({
          role: itemRole as 'system' | 'user' | 'assistant' | 'function' | 'tool',
          content
        });
      }
    }
  }

  return messages;
}

export function convertMessagesToCopilotPrompt(messages: OpenAIMessage[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return '';

  let prompt = '';
  for (const message of messages) {
    if (!message.role || !message.content) continue;
    switch (message.role) {
      case 'system': prompt += message.content + '\n\n'; break;
      case 'user': prompt += 'User: ' + message.content + '\n\n'; break;
      case 'assistant': prompt += 'Assistant: ' + message.content + '\n\n'; break;
    }
  }

  const lastMessage = messages[messages.length - 1];
  const needsAssistantPrompt = lastMessage.role === 'user';
  return prompt + (needsAssistantPrompt ? 'Assistant: ' : '');
}

export function detectLanguageFromMessages(messages: OpenAIMessage[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return 'javascript';
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage || !lastUserMessage.content) return 'javascript';

  const content = lastUserMessage.content;
  const codeBlockMatch = content.match(/```(\w+)/);
  if (codeBlockMatch && codeBlockMatch[1]) return codeBlockMatch[1].toLowerCase();

  const fileExtensionMatch = content.match(/\.([a-zA-Z0-9]+)(?:\s|"|'|$|\?)/);
  if (fileExtensionMatch && fileExtensionMatch[1]) {
    const ext = fileExtensionMatch[1].toLowerCase();
    const extToLang: Record<string, string> = {
      'js': 'javascript', 'ts': 'typescript', 'py': 'python', 'java': 'java',
      'c': 'c', 'cpp': 'cpp', 'cs': 'csharp', 'go': 'go', 'rb': 'ruby',
      'php': 'php', 'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown'
    };
    return extToLang[ext] || 'javascript';
  }
  return 'javascript';
}
