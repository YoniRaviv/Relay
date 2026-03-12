import type { Attachment, ImageAttachment } from '../../shared/types';

export interface ClarifyQuestion {
  id: string;
  question: string;
  options?: string[];
}

// ── Content block types for multimodal messages ──

export type TextBlock = { type: 'text'; text: string };
export type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
export type ContentBlock = TextBlock | ImageBlock;
export type PromptContent = string | ContentBlock[];

// ── Helpers ──

function projectContextBlock(projectContext?: string): string {
  if (!projectContext) return '';
  return `\n\n## Project Context\nThe following is known about the project where this feature will be built:\n${projectContext}`;
}

function buildAttachmentContent(attachments: Attachment[]): { textContext: string; imageBlocks: ImageBlock[] } {
  let textContext = '';
  const imageBlocks: ImageBlock[] = [];

  for (const att of attachments) {
    if (att.type === 'file') {
      textContext += `\n\n## Attached Document: ${att.name}\n\`\`\`\n${att.content}\n\`\`\``;
    } else if (att.type === 'image') {
      const img = att as ImageAttachment;
      imageBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      });
      textContext += `\n\n[Image attached: ${att.name}]`;
    }
  }

  return { textContext, imageBlocks };
}

function attachmentInstructions(attachments: Attachment[]): string {
  const hasImages = attachments.some(a => a.type === 'image');
  const hasDocs = attachments.some(a => a.type === 'file');

  if (!hasImages && !hasDocs) return '';

  const parts: string[] = [];
  if (hasImages) parts.push('reference the attached images/designs in your analysis');
  if (hasDocs) parts.push('incorporate context from the attached documents');

  return `\n\nIMPORTANT: The user has provided attachments. Please ${parts.join(' and ')}.`;
}

function toPromptContent(textPrompt: string, attachments?: Attachment[]): PromptContent {
  if (!attachments || attachments.length === 0) return textPrompt;

  const { textContext, imageBlocks } = buildAttachmentContent(attachments);
  const fullText = textPrompt + textContext + attachmentInstructions(attachments);

  if (imageBlocks.length === 0) return fullText;

  // Build content blocks: text first, then images, then a closing instruction
  const blocks: ContentBlock[] = [
    { type: 'text', text: fullText },
    ...imageBlocks,
  ];

  if (imageBlocks.length > 0) {
    blocks.push({
      type: 'text',
      text: `The above ${imageBlocks.length === 1 ? 'image shows a design/screenshot' : 'images show designs/screenshots'} relevant to this feature. Analyze ${imageBlocks.length === 1 ? 'it' : 'them'} carefully and incorporate visual details into your output.`,
    });
  }

  return blocks;
}

// ── Prompt builders ──

export function buildClarifyPrompt(featureDescription: string, projectContext?: string, attachments?: Attachment[]): PromptContent {
  const text = `You are a senior product manager. A user wants to build the following feature. Before writing a PRD, ask 3-5 essential clarifying questions to fill in gaps.

## Feature Request
${featureDescription}${projectContextBlock(projectContext)}

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

  return toPromptContent(text, attachments);
}

export function buildPrdPrompt(featureDescription: string, clarifications?: string, projectContext?: string, attachments?: Attachment[]): PromptContent {
  const clarificationBlock = clarifications
    ? `\n\n## Clarifications\nThe following questions were answered to refine the requirements:\n${clarifications}`
    : '';

  const text = `You are a senior product manager. Generate a detailed Product Requirements Document (PRD) for the following feature request.

## Feature Request
${featureDescription}${clarificationBlock}${projectContextBlock(projectContext)}

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

  return toPromptContent(text, attachments);
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
