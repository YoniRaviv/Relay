import { registerSettingsHandlers } from './settings';
import { registerProjectHandlers } from './project';
import { registerPrdHandlers } from './prd';
import { registerBrainstormHandlers } from './brainstorm';
import { registerTasksHandlers } from './tasks';
import { registerAgentHandlers } from './agent';
import { registerGitHandlers } from './git';
import { registerReviewHandlers } from './review';
import { registerMetricsHandlers } from './metrics';
import { registerRunnerHandlers } from './runner';

export function registerAllHandlers(): void {
  registerSettingsHandlers();
  registerProjectHandlers();
  registerPrdHandlers();
  registerBrainstormHandlers();
  registerTasksHandlers();
  registerAgentHandlers();
  registerGitHandlers();
  registerReviewHandlers();
  registerMetricsHandlers();
  registerRunnerHandlers();
}
