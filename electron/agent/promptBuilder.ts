import type { Task, PRD } from '../../shared/types';

export function buildTaskPrompt(task: Task, prd: PRD | null, rejectionNotes: string | null): string {
  let prompt = `You are an expert software engineer. Complete the following task autonomously.

## Task: ${task.storyId} — ${task.title}

### Description
${task.description}

### Acceptance Criteria
${task.acceptanceCriteria}
`;

  if (prd) {
    prompt += `
### PRD Summary
The task is part of this product requirement:
${prd.markdown.slice(0, 2000)}${prd.markdown.length > 2000 ? '\n...(truncated)' : ''}
`;
  }

  if (rejectionNotes) {
    prompt += `
### Previous Rejection Feedback
This task was previously attempted and rejected with the following notes. Address these issues:
${rejectionNotes}
`;
  }

  if (task.passes > 0) {
    prompt += `
### Note
This is attempt #${task.passes + 1}. Previous attempts did not pass review. Be extra careful to address all acceptance criteria.
`;
  }

  prompt += `
### Instructions
- Read existing code before making changes
- Write clean, well-structured code
- Follow existing patterns and conventions in the codebase
- Make only the changes necessary to complete this task
- Do not modify files unrelated to this task
- Ensure your changes compile without errors
`;

  return prompt;
}
