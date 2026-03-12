import Anthropic from '@anthropic-ai/sdk';
import { BrowserWindow } from 'electron';
import type { PromptContent } from './prompts';

let client: Anthropic | null = null;

export function getClient(apiKey: string): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function resetClient(): void {
  client = null;
}

export async function streamText(
  apiKey: string,
  systemPrompt: string,
  userMessage: PromptContent,
  win: BrowserWindow,
  channel: string
): Promise<string> {
  const anthropic = getClient(apiKey);
  let fullText = '';

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage as Anthropic.MessageCreateParams['messages'][0]['content'] }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      win.webContents.send(channel, { type: 'delta', text: event.delta.text });
    }
  }

  win.webContents.send(channel, { type: 'done', text: fullText });
  return fullText;
}

export async function generateText(
  apiKey: string,
  systemPrompt: string,
  userMessage: PromptContent,
): Promise<string> {
  const anthropic = getClient(apiKey);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage as Anthropic.MessageCreateParams['messages'][0]['content'] }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}
