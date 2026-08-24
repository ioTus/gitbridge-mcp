import { persistToolAnalyticsEvent } from "./tool-analytics.js";
import { persistToolCall, type PersistToolCallInput } from "./tool-log.js";

interface ToolActivityDependencies {
  schedule?: (callback: () => void) => void;
  persistLocal?: (input: PersistToolCallInput) => void;
  persistAnalytics?: typeof persistToolAnalyticsEvent;
}

export function scheduleToolActivity(
  input: PersistToolCallInput,
  dependencies: ToolActivityDependencies = {},
): void {
  const schedule = dependencies.schedule ?? setImmediate;
  const persistLocal = dependencies.persistLocal ?? persistToolCall;
  const persistAnalytics =
    dependencies.persistAnalytics ?? persistToolAnalyticsEvent;

  schedule(() => {
    persistLocal(input);
    void persistAnalytics({
      tool: input.tool,
      args: input.args,
      outcome: input.outcome,
      errorClass: input.error_class,
    });
  });
}