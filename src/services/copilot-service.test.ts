import { 
  convertMessagesToCopilotPrompt, 
  detectLanguageFromMessages 
} from './copilot-service.js';
import { OpenAIMessage } from '../types/openai.js';

describe('Copilot Service', () => {
  describe('convertMessagesToCopilotPrompt', () => {
    it('should handle empty messages array', () => {
      expect(convertMessagesToCopilotPrompt([])).toBe('');
    });
    
    it('should handle system message', () => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' }
      ];
      expect(convertMessagesToCopilotPrompt(messages))
        .toBe('You are a helpful assistant.\n\n');
    });
    
    it('should handle user message', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'Hello!' }
      ];
      expect(convertMessagesToCopilotPrompt(messages))
        .toBe('User: Hello!\n\nAssistant: ');
    });
    
    it('should handle assistant message', () => {
      const messages: OpenAIMessage[] = [
        { role: 'assistant', content: 'Hi there!' }
      ];
      expect(convertMessagesToCopilotPrompt(messages))
        .toBe('Assistant: Hi there!\n\n');
    });
    
    it('should handle conversation flow', () => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I\'m doing well, thank you!' },
        { role: 'user', content: 'Tell me a joke.' }
      ];
      expect(convertMessagesToCopilotPrompt(messages))
        .toBe('You are a helpful assistant.\n\nUser: How are you?\n\nAssistant: I\'m doing well, thank you!\n\nUser: Tell me a joke.\n\nAssistant: ');
    });
  });
  
  describe('detectLanguageFromMessages', () => {
    it('should default to javascript for empty messages', () => {
      expect(detectLanguageFromMessages([])).toBe('javascript');
    });
    
    it('should detect language from code blocks', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'Can you explain this code?\n```python\nprint("Hello")\n```' }
      ];
      expect(detectLanguageFromMessages(messages)).toBe('python');
    });
    
    it('should detect language from file extensions', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'What\'s wrong with my file.cpp?' }
      ];
      expect(detectLanguageFromMessages(messages)).toBe('cpp');
    });
    
    it('should map common file extensions correctly', () => {
      const extensionTests = [
        { ext: 'js', expected: 'javascript' },
        { ext: 'ts', expected: 'typescript' },
        { ext: 'py', expected: 'python' },
        { ext: 'java', expected: 'java' },
        { ext: 'cs', expected: 'csharp' },
        { ext: 'go', expected: 'go' },
        { ext: 'rb', expected: 'ruby' },
        { ext: 'php', expected: 'php' }
      ];
      
      for (const test of extensionTests) {
        const messages: OpenAIMessage[] = [
          { role: 'user', content: `Check my code.${test.ext} file` }
        ];
        expect(detectLanguageFromMessages(messages)).toBe(test.expected);
      }
    });
    
    it('should use last user message for language detection', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'Can you explain this Python code?' },
        { role: 'assistant', content: 'Sure, I can help with Python.' },
        { role: 'user', content: 'Actually, I need help with my code.ts file.' }
      ];
      expect(detectLanguageFromMessages(messages)).toBe('typescript');
    });
    
    it('should default to javascript when no language indicators are present', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'How do I write a function?' }
      ];
      expect(detectLanguageFromMessages(messages)).toBe('javascript');
    });
  });
});
