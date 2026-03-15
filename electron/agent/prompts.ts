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
  return `You are a senior product manager. When signing or attributing the document, use the author name "Relay Agent". A user wants to build the following feature. Before writing a PRD, ask 3-5 essential clarifying questions to fill in gaps.

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

  return `You are a senior product manager. When signing or attributing the document, use the author name "Relay Agent". Generate a detailed Product Requirements Document (PRD) for the following feature request.

## Feature Request
${featureDescription}${clarificationBlock}${projectContextBlock(projectContext)}${imageHint}

## Output Format
Write the PRD in markdown with the following sections:

# PRD: [Feature Title]

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

## 5. Non-Functional Requirements
Performance, security, accessibility requirements.

## 6. Technical Considerations
Architecture notes, constraints, dependencies.

## 7. Out of Scope
What is explicitly NOT included.

## 8. Success Metrics
How to measure if the feature is successful.

Be thorough but practical. Focus on what needs to be built, not how to build it.`
}

export function buildDecomposePrompt(prdMarkdown: string, projectContext?: string): string {
  return `You are a senior software architect. Decompose the following PRD into implementation tasks.

## PRD
${prdMarkdown}${projectContextBlock(projectContext)}

## Instructions
Break this PRD into sequential implementation tasks. Each task should be:
- Small enough to complete in a single coding session
- Self-contained with clear acceptance criteria
- Ordered by dependency (foundations first)

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

Aim for 5-15 tasks. Order them so each task builds on the previous ones. Assign priority based on importance and dependency order.`
}
