// ============================================
// UPDATED TYPES - E:\work\openClaw\github-copilot-proxy\src\types\openai.ts
// ============================================

// Tool definition for function calling
export interface ToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  strict?: boolean;
}

export interface Tool {
  type: 'function';
  function: ToolFunction;
}

// Tool call in assistant message
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface OpenAICompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  // Legacy function calling
  functions?: any[];
  function_call?: 'auto' | 'none' | { name: string };
  // Modern tool calling
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
}

export interface OpenAICompletionChoice {
  index: number;
  message?: OpenAIMessage;
  delta?: Partial<OpenAIMessage> & { tool_calls?: Partial<ToolCall>[] };
  finish_reason: string | null;
}

export interface OpenAICompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAICompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OpenAIModelList {
  object: string;
  data: OpenAIModel[];
}

// Legacy Completions API Types (for /v1/completions - used by Cursor tab completions)
export interface LegacyCompletionRequest {
  model: string;
  prompt: string | string[];
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  best_of?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

export interface LegacyCompletionChoice {
  text: string;
  index: number;
  logprobs: null;
  finish_reason: string | null;
}

export interface LegacyCompletion {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: LegacyCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// OpenAI Responses API Types
export interface ResponsesInput {
  type?: 'message' | 'function_call_output';
  role?: 'user' | 'assistant' | 'system' | 'developer';
  content?: string | ResponsesContentPart[];
  call_id?: string;
  output?: string;
}

export interface ResponsesContentPart {
  type: 'input_text' | 'output_text' | 'text';
  text: string;
}

// Responses API tool output
export interface ResponsesToolOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: 'completed' | 'in_progress';
}

export interface ResponsesRequest {
  model: string;
  input: string | ResponsesInput[];
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  parallel_tool_calls?: boolean;
  metadata?: Record<string, string>;
  store?: boolean;
  previous_response_id?: string;
}

export interface ResponsesOutput {
  type: 'message' | 'function_call';
  id: string;
  status: 'completed' | 'in_progress' | 'incomplete';
  role?: 'assistant';
  content?: ResponsesContentPart[];
  // For function_call type
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  status: 'completed' | 'in_progress' | 'incomplete' | 'failed';
  output: ResponsesOutput[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, string>;
  error?: {
    code: string;
    message: string;
  };
}
