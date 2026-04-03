import fs from 'node:fs';
import path from 'node:path';
import type { ReviewFinding } from '../../shared/types';

// ── Convention file detection ──

const CONVENTION_FILES = [
  'CLAUDE.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
  'AGENTS.md',
  'CONVENTIONS.md',
];

export function readConventionsFiles(projectPath: string): string {
  const found: string[] = [];
  for (const file of CONVENTION_FILES) {
    const fullPath = path.join(projectPath, file);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8').trim();
        if (content) found.push(`--- ${file} ---\n${content}`);
      }
    } catch { /* ignore read errors */ }
  }
  return found.length > 0 ? found.join('\n\n') : 'No conventions file found.';
}

// ── Stack-specific best practice rules ──

const STACK_RULES: Record<string, string> = {
  react: `React: Hook rules (no conditional hooks, exhaustive effect deps), key props on lists, avoid inline object/array creation in JSX props, prefer useMemo/useCallback for expensive operations, controlled vs uncontrolled components, avoid direct DOM manipulation`,
  nextjs: `Next.js: Use server components by default, client components only when needed, proper use of 'use client' directive, correct data fetching patterns (server actions vs API routes), proper image optimization with next/image`,
  vue: `Vue: Proper reactivity (no direct mutation of reactive objects), computed vs methods, correct use of v-model, proper component lifecycle, avoid memory leaks in watchers`,
  express: `Express/Node: Async error handling (wrap async routes in try-catch or use express-async-errors), middleware ordering matters, CORS configuration, rate limiting on public endpoints, don't block the event loop`,
  fastify: `Fastify: Schema validation on routes, proper hook ordering, async handler errors, serialization configuration`,
  prisma: `Prisma/SQL: Avoid N+1 queries (use include/select), use transactions for multi-step operations, parameterized queries only, connection pooling awareness, migration safety`,
  postgresql: `PostgreSQL: Parameterized queries, index usage, connection management, transaction isolation`,
  mongodb: `MongoDB: Schema validation, index usage, proper ObjectId handling, aggregation pipeline efficiency`,
  go: `Go: Goroutine leak prevention (always cancel contexts), defer for cleanup, error wrapping with fmt.Errorf/errors.Join, context propagation through call chains, avoid naked goroutines without error handling`,
  rust: `Rust: Prefer safe code over unsafe blocks, proper error handling with Result/Option (no unwrap in production), ownership and borrowing patterns, async runtime (Tokio) best practices`,
  python: `Python: Async/await consistency (don't mix sync and async I/O), type hints on public APIs, context managers for resource cleanup, avoid mutable default arguments, proper exception handling hierarchy`,
  django: `Django: ORM query optimization (select_related/prefetch_related), proper model validation, CSRF protection, secure settings for production`,
  fastapi: `FastAPI: Pydantic model validation, proper dependency injection, async database sessions, proper error responses`,
  ruby: `Ruby: Method visibility (private/protected), proper exception handling, avoid monkey-patching, memory-conscious iteration`,
  rails: `Rails: Strong parameters, N+1 query prevention (includes/eager_load), proper migration patterns, CSRF and XSS protection`,
  typescript: `TypeScript: Strict mode compliance, proper type narrowing (no type assertions when narrowing works), discriminated unions over type casting, avoid 'any' type`,
};

export function getStackRules(frameworks: string[]): string {
  const rules = frameworks
    .map(f => STACK_RULES[f])
    .filter(Boolean);
  return rules.length > 0 ? rules.join('\n') : 'Follow general programming best practices.';
}

// ── Analyze prompt (Phase 1) ──

export function buildAnalyzePrompt(
  stackProfile: string,
  conventions: string,
  stackRules: string,
): string {
  return `You are a senior code reviewer. You review code changes for a ${stackProfile} project.

## Project Conventions
${conventions}

## Review Categories

**Security**: Injection (SQL, XSS, command), auth bypass, secrets in code, insecure crypto, SSRF, path traversal, insecure deserialization
**Performance**: N+1 queries, missing indexes, unnecessary re-renders, unbounded loops, memory leaks, missing memoization, bundle size
**Race Conditions**: Shared mutable state, concurrent access without locks, async ordering issues, TOCTOU bugs
**Error Handling**: Swallowed errors, missing try/catch on async ops, unhelpful error messages, missing cleanup in finally
**Best Practices**: ${stackRules}
**Conventions**: Naming consistency, file organization, import patterns, project-specific rules from conventions above
**Accessibility**: (Frontend only) Missing ARIA labels, keyboard navigation gaps, color contrast issues, semantic HTML

## Severity Definitions
- critical: Will cause bugs, security holes, or data loss in production
- warning: Will degrade quality, performance, or maintainability
- info: Style/convention suggestions that won't cause runtime issues

## Output Format
Return ONLY a JSON array. Each element:
{
  "id": "f-{index}",
  "severity": "critical" | "warning" | "info",
  "category": "Security" | "Performance" | "Race Condition" | "Error Handling" | "Best Practices" | "Conventions" | "Accessibility",
  "file": "relative/path.ext",
  "line": <number>,
  "title": "Short descriptive title",
  "description": "What the issue is and why it matters",
  "suggestion": "Specific fix recommendation"
}

## Rules
- Only report REAL issues found in the diff. No padding, no filler.
- Reference specific code from the diff. Be precise.
- If no issues found, return an empty array [].
- Do not report issues in code that wasn't changed in this diff.
- Use the project conventions (if provided) to check convention compliance.`;
}

// ── Fix prompt (Phase 2) ──

export function buildFixPrompt(findings: ReviewFinding[]): string {
  return `Apply these specific fixes to the codebase. For each finding, make the minimal change needed to resolve the issue. Do not refactor surrounding code or make changes beyond what each finding describes.

## Findings to fix:
${JSON.stringify(findings, null, 2)}`;
}
