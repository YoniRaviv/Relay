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

export function buildPrdPrompt(featureDescription: string, clarifications?: string, projectContext?: string, hasAttachments?: boolean): string {
  const clarificationBlock = clarifications
    ? `\n\n## Clarifications\nThe following questions were answered to refine the requirements:\n${clarifications}`
    : '';

  const imageHint = hasAttachments
    ? '\n\nReference images are attached. Analyze the visual designs carefully — incorporate layout, component structure, colors, spacing, and interaction patterns you observe into your response.'
    : '';

  return `You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". Generate a detailed Product Requirements Document (PRD) for the following feature request.

## Feature Request
${featureDescription}${clarificationBlock}${projectContextBlock(projectContext)}${imageHint}

## Output Format
Write the PRD in markdown with the following sections. IMPORTANT: The first heading MUST be a concise feature name (3-5 words, not a sentence), formatted as:

# PRD: [Concise Feature Name]

## 1. Introduction
Brief overview of the feature and its purpose.

## 2. Goals & Objectives
- List of specific, measurable goals

## 3. User Stories
Write user stories in the format: "As a [role], I want [capability] so that [benefit]"
- US-001: ...
- US-002: ...
(etc.)

## 4. Functional Requirements
Detailed requirements organized by area.

## 5. Non-Functional Requirements & Success Metrics
Brief notes on performance, security, accessibility, and how to know the feature works correctly.

## 6. Technical Considerations
Architecture notes, constraints, dependencies.

## 7. Out of Scope
What is explicitly NOT included.

Be thorough but practical. Focus on what needs to be built, not how to build it.`
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

export function buildDecomposePrompt(prdMarkdown: string, projectContext?: string): string {
  return `You are a senior software architect. Decompose the following specification into implementation tasks.

## Specification
${prdMarkdown}${projectContextBlock(projectContext)}

## Instructions
Break this specification into sequential implementation tasks. The document may be a formal PRD or a design document from a brainstorming session — either way, extract concrete buildable tasks from it. Each task will be executed by an autonomous AI coding agent with full file read/write access in a single session with limited context.

Guidelines:
- **Task sizing**: Each task must be completable in one agent session. If a task touches more than 5-8 files or requires more than 3 conceptual steps, split it. Aim for 5-12 tasks.
- **Dependency order**: Schema/data changes first, then backend logic, then UI components, then integration/polish.
- Every task must produce a visible, functional change.
- Do NOT create separate tasks for: types/interfaces, error handling, tests, documentation, or validation. These belong as acceptance criteria within the task that implements the feature.
- If the project directory is empty or has no source code, the first task should scaffold the project (stack, folder structure, dependencies, config). If the project already has code, work within the existing structure — no scaffolding tasks.
- Acceptance criteria must be specific and verifiable — not vague ("works correctly"). Each criterion should be something the agent can check.

## Output Format
Return a JSON array of tasks. ONLY output the JSON, no other text.

\`\`\`json
[
  {
    "storyId": "US-001",
    "title": "Short descriptive title",
    "description": "What needs to be built and how",
    "acceptanceCriteria": "- Criterion 1\\n- Criterion 2\\n- Criterion 3",
    "priority": "high|medium|low"
  }
]
\`\`\`

Order tasks so each builds on the previous ones. Assign priority based on importance and dependency order.`
}
