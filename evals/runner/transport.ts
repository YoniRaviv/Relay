import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { query } from '@anthropic-ai/claude-agent-sdk';

let _claudePath: string | undefined;
function getClaudePath(): string {
    if (!_claudePath) {
        try {
            _claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
        } catch {
            _claudePath = `${os.homedir()}/.local/bin/claude`;
        }
    }
    return _claudePath;
}

function buildEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.CLAUDECODE;
    const homedir = os.homedir();
    const extraPaths = [
        `${homedir}/.local/bin`,
        `${homedir}/.nvm/versions/node/current/bin`,
        '/usr/local/bin',
        '/opt/homebrew/bin',
    ];
    env.PATH = [...extraPaths, env.PATH ?? ''].join(':');
    return env;
}

export interface QueryResult {
    text: string;
    usage: { input_tokens: number; output_tokens: number };
}

const DISALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookEdit'];

export async function runQuery(opts: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
    maxTurns?: number;
}): Promise<QueryResult> {
    const session = query({
        prompt: opts.userPrompt,
        options: {
            systemPrompt: opts.systemPrompt,
            model: opts.model,
            cwd: os.tmpdir(),
            maxTurns: opts.maxTurns ?? 5,
            allowedTools: [],
            disallowedTools: DISALLOWED_TOOLS,
            permissionMode: 'acceptEdits',
            persistSession: false,
            pathToClaudeCodeExecutable: getClaudePath(),
            env: buildEnv(),
        },
    });

    const chunks: string[] = [];
    let usage = { input_tokens: 0, output_tokens: 0 };
    let resultError: string | undefined;

    for await (const message of session) {
        if (message.type === 'assistant') {
            for (const block of message.message.content) {
                if (block.type === 'text') chunks.push(block.text);
            }
        } else if (message.type === 'result') {
            const r = message as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; subtype?: string; errors?: string[] };
            if (r.usage) {
                usage = {
                    input_tokens: (r.usage.input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0),
                    output_tokens: r.usage.output_tokens ?? 0,
                };
            }
            if (r.subtype !== 'success') {
                resultError = r.errors?.join(', ') ?? `Result subtype: ${r.subtype}`;
            }
        }
    }

    if (resultError) throw new Error(resultError);
    return { text: chunks.join(''), usage };
}
