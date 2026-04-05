export interface OpenAITextContentPart {
  type: 'text';
  text: string;
}

export interface OpenAIImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export type OpenAIContentPart = OpenAITextContentPart | OpenAIImageContentPart;

export interface OpenAIMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool' | 'function';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
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
  max_completion_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: unknown[];
  function_call?: 'auto' | 'none' | { name: string };
  tools?: unknown[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: string; function?: { name: string } };
  parallel_tool_calls?: boolean;
  response_format?: { type: string };
  stream_options?: { include_usage?: boolean };
}

export interface OpenAICompletionChoice {
  index: number;
  message?: OpenAIMessage;
  delta?: Partial<OpenAIMessage>;
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
