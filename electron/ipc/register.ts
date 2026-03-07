import { registerSettingsHandlers } from './settings';
import { registerProjectHandlers } from './project';
import { registerPrdHandlers } from './prd';
import { registerTasksHandlers } from './tasks';
import { registerAgentHandlers } from './agent';
import { registerGitHandlers } from './git';
import { registerMetricsHandlers } from './metrics';

export function registerAllHandlers(): void {
  registerSettingsHandlers();
  registerProjectHandlers();
  registerPrdHandlers();
  registerTasksHandlers();
  registerAgentHandlers();
  registerGitHandlers();
  registerMetricsHandlers();
}
