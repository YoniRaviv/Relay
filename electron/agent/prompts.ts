import type { ImageAttachment } from '../../shared/types';

export interface ClarifyQuestion {
  id: string;
  question: string;
  options?: string[];
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
  | { type: 'text'; text: string };

export function buildContentBlocks(
  textPrompt: string,
  attachments?: ImageAttachment[]
): string | ContentBlock[] {
  if (!attachments?.length) return textPrompt;

  const imageBlocks: ContentBlock[] = attachments.map(att => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: att.mediaType, data: att.base64Data },
  }));

  return [...imageBlocks, { type: 'text' as const, text: textPrompt }];
}

function projectContextBlock(projectContext?: string): string {
  if (!projectContext) return '';
  return `\n\n## Project Context\nThe following is known about the project where this feature will be built:\n${projectContext}`;
}

export function buildClarifyPrompt(featureDescription: string, projectContext?: string, hasAttachments?: boolean): string {
  const imageHint = hasAttachments
    ? '\n\nReference images are attached. Analyze the visual designs carefully — incorporate layout, component structure, colors, spacing, and interaction patterns you observe into your questions and response.'
    : '';
  return `You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". A user wants to build the following feature. Before writing a PRD, ask 3-5 essential clarifying questions to fill in gaps.

## Feature Request
${featureDescription}${projectContextBlock(projectContext)}${imageHint}

## Instructions
Identify what's unclear or underspecified. Focus on:
- Problem definition and target users
- Core functionality and scope boundaries
- Success criteria and key constraints
- Integration points or dependencies

For each question, provide 2-4 suggested answer options when applicable (to help the user respond quickly).

## Output Format
Return ONLY a JSON array, no other text:
\`\`\`json
[
  {
    "id": "q1",
    "question": "The clarifying question?",
    "options": ["Option A", "Option B", "Option C"]
  }
]
\`\`\`

If the feature description is already very detailed and clear, return fewer questions. Never ask more than 5.`;
}

export const PRD_PROMPT_VERSION = '2026-05-v3';

export function buildPrdPrompt(featureDescription: string, clarifications?: string, projectContext?: string, hasAttachments?: boolean, includeTests?: boolean): string {
  const clarificationBlock = clarifications
    ? `\n\n## Clarifications\nThe following questions were answered to refine the requirements:\n${clarifications}`
    : '';

  const imageHint = hasAttachments
    ? '\n\nReference images are attached. Analyze the visual designs carefully — incorporate layout, component structure, colors, spacing, and interaction patterns you observe into your response.'
    : '';

  const testingSection = includeTests
    ? `\n## 5. Testing Decisions\nWhat tests we will write and why. Specify the testing layers (unit, integration, e2e), what each layer should cover, the testing framework/tools, and any acceptance criteria that depend on tests passing. Be specific — not "we'll write unit tests" but "Vitest unit tests for the parser covering malformed input, empty input, and the three documented edge cases".`
    : '';

  const sectionNumbering = includeTests
    ? '5. Testing Decisions, 6. Out of Scope, 7. Further Notes'
    : '5. Out of Scope, 6. Further Notes';

  return `You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". Generate a detailed Product Requirements Document (PRD) for the following feature request.

## Feature Request
${featureDescription}${clarificationBlock}${projectContextBlock(projectContext)}${imageHint}

## Output Format
Write the PRD in markdown. The first heading MUST be a concise feature name (3-5 words, not a sentence) formatted as \`# PRD: [Concise Feature Name]\`. Then sections in this exact order: 1. Problem Statement, 2. Solution, 3. User Stories, 4. Implementation Decisions, ${sectionNumbering}.

## 1. Problem Statement
Describe the problem **from the user's perspective**. What pain are they experiencing today? Why does this matter? Frame it as the user would — not as a technical gap.

## 2. Solution
Describe the solution **from the user's perspective**. What changes for them? What new capability do they have? Keep this focused on user-facing behavior — not implementation.

## 3. User Stories
Write formal user stories, numbered \`US-001\` through \`US-NNN\`, each in the exact format: **"As a [role], I want [capability], so that [benefit]"**. Each story should be independently demoable. Aim for 3–8 stories that fully cover the feature.

- US-001: As a [role], I want [capability], so that [benefit].
- US-002: As a [role], I want [capability], so that [benefit].
(etc.)

## 4. Implementation Decisions
Describe the technical shape of the solution as a vertical tracer bullet — the layers an end-to-end implementation cuts through. Be concrete: vague decisions force the coding agent to make undocumented choices. Use the project context to follow existing patterns (ORM, naming conventions, folder layout, framework idioms) — do not invent new conventions when the project already has one.

### 4.1 Data Contract
The concrete entities, fields, and relationships this feature introduces or extends. List:
- **Entity/model names** (e.g., \`Post\`, \`Subscription\`, \`AuditLog\`) using the project's existing naming style
- **Fields** — each field's name, type, nullability, and default
- **Lifecycle / visibility state** explicitly — if records have any "active vs. inactive" notion, dictate the exact mechanism: a \`published: boolean\`, a \`status: 'draft' | 'live' | 'archived'\` enum, a soft-delete column, etc. State which values the feature treats as visible to end users — the agent must write the corresponding query gates.
- **Relationships** to existing models, following the project's relationship conventions

### 4.2 Tracer Bullet Slices
Enumerate the **vertical slices** that, taken together, deliver this feature. This is the most important section — it becomes the input for task decomposition.

**Each slice must:**
- Describe **one demoable end-to-end behavior** — what the user does and what they see in response
- Cut through every layer it needs in a single behavior — data + server + UI + wiring all shipped together
- Stand on real persistence from day one (no mocks, fixtures, or static placeholder records)
- Respect the lifecycle/visibility state from §4.1 (e.g. only show \`published\` rows)
- Be independently shippable — you could pause development after any slice and the feature still works for the slices delivered so far

**Order slices as a tracer bullet:** the first slice is the thinnest possible end-to-end version (the bullet that hits the target, even if it's small). Later slices add richness, edit/delete, edge cases.

**Format each slice like this:**
> **Slice 1 — [Short behavior name]**
> *Behavior:* [One sentence describing what the user does and what happens, end-to-end.]
> *Cuts through:* [terse list of the data, server, and UI elements this slice touches — by entity/role, not by file path.]

Aim for 3–6 slices. Do **not** describe the layers as separate numbered sections — every slice is itself a layer-cutting behavior, not a step in a layered sequence. If you find yourself listing "1. Schema 2. Server 3. UI" as separate items, you're writing a horizontal plan; rewrite as slices.

### 4.3 Other Implementation Decisions
Public contracts between modules, key dependencies, error and edge-case handling rules, performance constraints. Entity, field, and module names are encouraged — they are the data contract. **Do NOT reference file paths or directory locations** (e.g. \`src/...\`, \`electron/...\`, \`shared/...\`) — paths go stale fast. Describe components by their role (e.g. "the task store", "the agent runtime"), not by location.
${testingSection}
## ${includeTests ? '6' : '5'}. Out of Scope
What is explicitly NOT included in this feature. Be specific about adjacent things people might assume are in scope but aren't, and briefly say why each is deferred.

## ${includeTests ? '7' : '6'}. Further Notes
Anything else that doesn't fit above: open questions, related work, future considerations, references to related features or docs.

## Constraints
- Be thorough but practical. Focus on what needs to be built and why, not how to build it line-by-line.
- §4 must commit to a concrete data contract — entity names, field names, types, and lifecycle/visibility state. Vagueness here forces the coding agent to invent shapes that won't match existing conventions.
- Do NOT reference file paths or directory locations (e.g. \`src/foo.ts\`, \`electron/bar/\`, \`shared/...\`). Entity names, field names, and module roles are encouraged — those are the contract — but file locations rot fast.
- Do NOT include code snippets, function-body pseudocode, or "implementation hints" of more than a sentence. The agent has the codebase; the PRD is the contract, not the playbook.
- Avoid mock data, hard-coded fixtures, or static placeholders in the production implementation. Every feature should plug into a real data lifecycle from day one.
- Every user story must be in the formal "As a X, I want Y, so that Z" form — not bare bullet points.${includeTests ? '' : '\n- Do NOT include any testing requirements, test files, or testing sections — tests are explicitly out of scope for this PRD.'}`
}

export function buildBrainstormSystemPrompt(projectContext?: string): string {
  const contextBlock = projectContext
    ? `\n\n## Project Context\n${projectContext}`
    : '';

  return `You are a senior software architect helping design a feature through structured dialogue.${contextBlock}

## Response Format
You MUST respond with EXACTLY ONE JSON object per message. No text outside the JSON. No markdown code fences.
The JSON must be one of these types:

### question — Ask one clarifying question
{"type":"question","question":"Your question here?","options":["Option A","Option B","Option C"]}
- The "options" array is optional — omit it for open-ended questions
- Ask ONE question at a time, never multiple
- Prefer providing 2-4 multiple-choice options when possible (easier to answer)
- Focus on: purpose, constraints, success criteria, scope boundaries

### approaches — Present 2-3 architectural approaches
{"type":"approaches","summary":"Brief context for the options","approaches":[{"title":"Approach A","description":"What it involves","tradeoffs":"Pros and cons"},{"title":"Approach B","description":"What it involves","tradeoffs":"Pros and cons"}],"recommendation":"Approach A"}
- Always include 2-3 approaches with clear tradeoffs
- "recommendation" must match one of the approach titles
- Lead with your recommended option

### design-section — Present one section of the design for approval
{"type":"design-section","title":"Section Name","content":"Markdown content describing this section..."}
- Present ONE section at a time for incremental approval
- Content can use markdown for formatting
- Scale to complexity: brief if straightforward, detailed if nuanced

### ready — Signal the design is complete
{"type":"ready","summary":"Brief summary of the complete design we agreed on"}
- Use ONLY after all design sections have been presented and approved
- Summary should recap key decisions

## Conversation Flow
1. Start with 2-4 clarifying questions (one per message) to understand purpose, scope, constraints
2. If the request describes multiple independent subsystems, flag this immediately
3. After enough clarity, present approaches
4. Once an approach is chosen, present design sections one at a time (architecture, components, data flow, etc.)
5. After all sections are approved, send a ready message

## Key Principles
- YAGNI ruthlessly — remove unnecessary complexity from designs
- Follow existing codebase patterns from the project context
- Reference specific files, functions, and patterns when relevant
- Design for isolation and clarity — smaller units with clear purposes
- Be concise — don't over-explain`;
}

export function buildBrainstormFinalizePrompt(): string {
  return `Based on our brainstorming conversation, produce a comprehensive design document that will be used to generate implementation tasks for an autonomous coding agent.

Format as:

# Design: [Concise Feature Name]

## Problem Statement
What we're solving and why.

## Proposed Approach
The approach we agreed on, with key technical decisions.

## Technical Design
Architecture, components, data flow, file structure. Be specific — reference actual files and patterns from the project.

## Scope & Boundaries
What's included and explicitly excluded.

## Key Decisions Made
Decisions from our conversation and their reasoning.

## Acceptance Criteria
How to verify the feature works correctly.

Include ALL decisions and details we discussed. Be specific enough that an autonomous coding agent can decompose this into buildable tasks.

## Self-Review (do this before outputting)
Before producing the final document, verify:
1. No placeholders (TBD, TODO, "to be determined") — resolve them with reasonable choices
2. No contradictions between sections
3. Scope is focused enough for a single implementation plan
4. No ambiguous requirements — pick one interpretation and make it explicit`;
}

export const DECOMPOSE_PROMPT_VERSION = '2026-05-v3';

export function buildDecomposePrompt(prdMarkdown: string, projectContext?: string, includeTests?: boolean): string {
  const testsRule = includeTests
    ? '- Tests are part of each task — list specific test expectations in `acceptanceCriteria` for the slice they belong to. Do NOT create standalone "write tests" tasks.'
    : '- Do NOT include tests, test files, or testing requirements in any task. Tests are explicitly out of scope for this feature.';

  return `You are a senior software architect. Decompose the following specification into implementation tasks.

## Specification
${prdMarkdown}${projectContextBlock(projectContext)}

## Instructions
Break this specification into vertical, end-to-end implementation slices. The document may be a formal PRD or a design document from a brainstorming session — either way, extract concrete buildable tasks. Each task will be executed by an autonomous AI coding agent in a fresh session with a limited 200K context window — so each task must be self-contained and small.

### Vertical slicing (the core rule)
Each task = one **demoable end-to-end behavior**. A user does something, and they see/get a result, all delivered together. The data, server, and UI changes the behavior needs ship in the same task — never as separate tasks.

**If the PRD has a §4.2 "Tracer Bullet Slices" section, each slice listed there should map to roughly one task. That section is your starting point — refine, split, or merge slices as needed for sizing, but preserve the tracer-bullet ordering.**

Do NOT decompose by layer. The following are antipatterns and must be avoided:
- A task titled "Schema migration" or "Add database columns" with no UI or behavior
- A task titled "Backend API endpoints" separate from the feature that consumes them
- A task titled "Frontend UI" that depends on a backend task that hasn't shipped yet
- Any task that says "set up types/interfaces" as its own unit
- A task list that reads like \`1. Data → 2. Server → 3. UI → 4. Wiring\` — that is a layered sequence dressed as tasks; rewrite each item as a behavior that ships its own data + server + UI

### Worked example — same feature, bad vs. good

**Bad (horizontal, layer-scoped):**
1. Schema: add \`comments\` table
2. API: comment CRUD endpoints
3. UI: comment thread component
4. Wire UI to API

**Bad (static placeholder — almost as bad as horizontal):**
1. Render hard-coded mock comments beneath a post
2. Replace mocks with real data later

**Good (vertical, tracer-bullet, real data from day one):**
1. Submit a comment from the form, persist it, query it back, and render the real list beneath the post (schema + insert + read + render — the simplest end-to-end pipeline). Use only the visibility state the user can see (e.g., only \`published\` rows).
2. Edit and delete own comment (CRUD parity with permission check)
3. Threaded replies (one level — feature complete for v1)

Each "good" task touches data + server + UI together, runs against real persistence, can be demoed end-to-end, and stops at a coherent stopping point.

### Definition of Done per slice
- Every task's acceptance criteria must include at least one verifiable end-to-end check ("after this task, doing X in the UI causes Y to be persisted and Z to render on reload"). Layer-only checks ("the migration runs", "the endpoint returns 200") are insufficient on their own.
- If the feature has a lifecycle/visibility state (e.g. \`published\`, \`status\`, soft-delete), every read path the slice introduces must respect that gate — call this out explicitly in acceptance criteria.

### Sizing & coverage
- Aim for 4–10 tasks. If a slice is too big to fit in one agent session (more than 5–8 files of net new/changed code, or more than 3 conceptual steps), split it into thinner slices.
- Each task must reference the user stories it covers via \`userStoriesCovered: ["US-001", ...]\`. Every user story in the PRD must be covered by at least one task.
- Order tasks as a tracer bullet — earliest tasks deliver the simplest end-to-end version; later tasks layer on richness.

### Other rules
- Every task must produce a visible, functional change at the end, against real data — not mocks or fixtures.
- Do NOT create tasks that exist only to scaffold static/mock data, hard-coded fixtures, or placeholder records. The first slice should already wire real persistence. Mock tasks force a rewrite later and waste tokens.
${testsRule}
- Do NOT create separate tasks for: types/interfaces, error handling, documentation, validation, or refactoring. These are baked into the slice that needs them.
- If the project directory is empty or has no source code, the first task should scaffold the minimum stack (folder structure, deps, config) needed for slice #2 to land. Otherwise, work within the existing structure — no scaffolding tasks.
- Acceptance criteria must be specific and verifiable. Reject vague language like "works correctly", "as expected", "properly", "appropriately". Each criterion should be something the agent can check by inspecting the code or running it.

## Output Format
Return a JSON array of tasks. ONLY output the JSON, no other text. Every task must include \`userStoriesCovered\`.

\`\`\`json
[
  {
    "storyId": "US-001",
    "title": "Short descriptive title (a slice, not a layer)",
    "description": "What ships when this task lands and how — describe the end-to-end behavior, not which files to touch",
    "acceptanceCriteria": "- Criterion 1\\n- Criterion 2\\n- Criterion 3",
    "priority": "high|medium|low",
    "userStoriesCovered": ["US-001", "US-003"]
  }
]
\`\`\`

Assign priority based on tracer-bullet order — the first slice is the highest priority. Do not output any other text outside the JSON array.`
}
