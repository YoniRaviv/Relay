export function buildPrdPrompt(featureDescription: string): string {
  return `You are a senior product manager. Generate a detailed Product Requirements Document (PRD) for the following feature request.

## Feature Request
${featureDescription}

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

export function buildDecomposePrompt(prdMarkdown: string): string {
  return `You are a senior software architect. Decompose the following PRD into implementation tasks.

## PRD
${prdMarkdown}

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
