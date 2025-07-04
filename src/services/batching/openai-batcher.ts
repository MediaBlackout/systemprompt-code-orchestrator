/**
 * @fileoverview Simple batching utility for OpenAI chat completions.
 * Allows executing multiple chat requests with a single helper class.
 */
import { OpenAI } from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BatchItem {
  id: string;
  messages: ChatMessage[];
}

export interface BatchResult {
  id: string;
  content: string;
}

export class OpenAIChatBatcher {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Execute a batch of chat completion requests in parallel.
   * @param requests Array of requests with an id and message list.
   * @param model Chat model to use.
   * @returns Array of batch results.
   */
  async runBatch(requests: BatchItem[], model = 'gpt-3.5-turbo'): Promise<BatchResult[]> {
    const tasks = requests.map(async (r) => {
      const res = await this.openai.chat.completions.create({
        model,
        messages: r.messages,
      });
      const choice = res.choices[0]?.message?.content ?? '';
      return { id: r.id, content: choice } as BatchResult;
    });

    return Promise.all(tasks);
  }
}
