import { BrowserWindow } from 'electron';
import { Codex } from '@openai/codex-sdk';
import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk';
import { store } from '../ipc/settings';

const DEFAULT_CODEX_MODEL = 'gpt-5.4';

function getModel(): string {
  return (store.get('selectedModel') ?? DEFAULT_CODEX_MODEL) as string;
}

export async function streamText(
  systemPrompt: string,
  userMessage: string,
  win: BrowserWindow,
  channel: string
): Promise<string> {
  const codex = new Codex();
  const thread = codex.startThread({
    model: getModel(),
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
  });

  const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
  let fullText = '';

  const { events } = await thread.runStreamed(fullPrompt);

  for await (const event of events) {
    if (event.type === 'item.completed') {
      const item = (event as ThreadEvent & { item: ThreadItem }).item;
      if (item.type === 'agent_message') {
        const text = item.text;
        fullText += text;
        try {
          if (!win.isDestroyed()) win.webContents.send(channel, { type: 'delta', text });
        } catch { /* suppress */ }
      }
    }
  }

  try {
    if (!win.isDestroyed()) win.webContents.send(channel, { type: 'done', text: fullText });
  } catch { /* suppress */ }
  return fullText;
}

export async function generateText(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const codex = new Codex();
  const thread = codex.startThread({
    model: getModel(),
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
  });

  const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
  let fullText = '';

  const { events } = await thread.runStreamed(fullPrompt);

  for await (const event of events) {
    if (event.type === 'item.completed') {
      const item = (event as ThreadEvent & { item: ThreadItem }).item;
      if (item.type === 'agent_message') {
        fullText += item.text;
      }
    }
  }

  return fullText;
}
