import { describe, expect, it } from '@jest/globals';
import { resolveCompletionProvider, hasImageInput, getAvailableModels, type ProviderRoutingOptions } from './provider-router.js';
import { OpenAIMessage } from '../types/openai.js';

const routingOptions: ProviderRoutingOptions = {
  copilotDefaultModel: 'gpt-4.1',
  copilotModels: ['gpt-4.1', 'gpt-4o'],
  visionEnabled: true,
  visionDefaultModel: 'gpt-4o',
  visionModels: ['gpt-4o', 'claude-opus-4.1'],
  visionOwner: 'vision-backend',
};

describe('Provider Router', () => {
  describe('hasImageInput', () => {
    it('detects image parts in message arrays', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this screenshot' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ];

      expect(hasImageInput(messages)).toBe(true);
    });
  });

  describe('resolveCompletionProvider', () => {
    it('routes image inputs to the vision backend', () => {
      const result = resolveCompletionProvider(
        {
          model: 'gpt-4.1',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What is in this image?' },
                { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
              ],
            },
          ],
        },
        routingOptions
      );

      expect(result).toEqual({
        provider: 'vision',
        model: 'gpt-4o',
        hasImageInput: true,
      });
    });

    it('routes configured vision models to the vision backend', () => {
      const result = resolveCompletionProvider(
        {
          model: 'claude-opus-4.1',
          messages: [{ role: 'user', content: 'Summarize this design.' }],
        },
        routingOptions
      );

      expect(result.provider).toBe('vision');
      expect(result.model).toBe('claude-opus-4.1');
    });

    it('routes plain text Copilot models to Copilot', () => {
      const result = resolveCompletionProvider(
        {
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Write a TypeScript function.' }],
        },
        routingOptions
      );

      expect(result.provider).toBe('copilot');
    });
  });

  describe('getAvailableModels', () => {
    it('deduplicates overlapping model ids and prefers the last configured provider', () => {
      const models = getAvailableModels(routingOptions);
      const gpt4o = models.find((model) => model.id === 'gpt-4o');

      expect(gpt4o?.provider).toBe('vision');
    });
  });
});