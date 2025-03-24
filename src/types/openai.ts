export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | null;
  name?: string;
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
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: any[];
  function_call?: 'auto' | 'none' | { name: string };
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
