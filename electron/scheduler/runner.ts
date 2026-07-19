import { buildPrompt, buildQueryOptions, mapResult, type QueryOptions, type MappedResult, type ResultEnvelope } from './dispatch';
import type { ScheduledJob } from './types';

/** The subset of Agent-SDK messages the runner reads. Minimal so runs are testable with a fake. */
export interface SdkMessage extends ResultEnvelope {
  type: string;         // 'system' | 'assistant' | 'result' | ...
  session_id?: string;  // present on the system/init message
  message?: { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
}

/** Injected SDK seam: prod wraps `query()`, tests pass a fake async-iterable. */
export type Sdk = (args: { prompt: string; options: QueryOptions & Record<string, unknown> }) => AsyncIterable<SdkMessage>;

/** Where a run's outcomes are written (an adapter over updateTask in prod; a recorder in tests). */
export interface RunSink {
  setSession(jobId: string, sessionId: string): void;
  event(jobId: string, type: 'text' | 'tool', text: string): void;
  tokens(jobId: string, total: number): void;
  finish(jobId: string, result: MappedResult): void;
  fail(jobId: string, reason: string): void;
}

/** One-line summary of a tool_use input for the activity feed. */
function toolArg(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const o = input as Record<string, unknown>;
  const v = o.file_path ?? o.command ?? o.path ?? o.url ?? o.pattern ?? o.prompt ?? '';
  return String(v).slice(0, 160);
}

/**
 * Run one local job through the SDK to completion, driving `sink`. Never throws.
 * `extra.resume` continues a prior session (approval gate); `extra.prompt` overrides the built
 * prompt (the approval message). No result message or a thrown error → sink.fail.
 */
export async function runLocalJob(
  job: ScheduledJob,
  sdk: Sdk,
  sink: RunSink,
  extra?: { resume?: string; prompt?: string; pathToClaudeCodeExecutable?: string; maxBudgetUsd?: number },
): Promise<void> {
  try {
    const prompt = extra?.prompt ?? buildPrompt(job);
    const options = buildQueryOptions(job, extra);
    let last: SdkMessage | null = null;
    let liveTokens = 0;
    for await (const msg of sdk({ prompt, options: { ...options } })) {
      if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) sink.setSession(job.id, msg.session_id);
      if (msg.type === 'assistant' && msg.message) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        for (const b of blocks as { type?: string; text?: string; name?: string; input?: unknown }[]) {
          if (b.type === 'text' && b.text?.trim()) sink.event(job.id, 'text', b.text.trim().slice(0, 500));
          else if (b.type === 'tool_use' && b.name) sink.event(job.id, 'tool', `${b.name} ${toolArg(b.input)}`.trim());
        }
        const u = msg.message.usage;
        if (u) { liveTokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0); sink.tokens(job.id, liveTokens); }
      }
      if (msg.type === 'result') last = msg;
    }
    if (!last) { sink.fail(job.id, 'run ended with no result message'); return; }
    sink.finish(job.id, mapResult(last));
  } catch (e) {
    sink.fail(job.id, `run failed: ${(e as Error).message}`);
  }
}
