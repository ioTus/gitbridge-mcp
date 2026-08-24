import { performance } from "node:perf_hooks";
import { scheduleToolActivity } from "../server/lib/tool-activity.js";

const sampleCount = 1000;
const baseline: number[] = [];
const enabled: number[] = [];
let completed = 0;

const completion = new Promise<void>((resolve) => {
  for (let i = 0; i < sampleCount; i++) {
    let start = performance.now();
    void i;
    baseline.push(performance.now() - start);

    start = performance.now();
    scheduleToolActivity(
      { tool: "read_file", outcome: "success", duration_ms: 0 },
      {
        schedule(callback) {
          setImmediate(() => {
            callback();
            completed++;
            if (completed === sampleCount) resolve();
          });
        },
        persistLocal() {},
        async persistAnalytics() {},
      },
    );
    enabled.push(performance.now() - start);
  }
});

await completion;

function percentile(samples: number[], value: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * value)] ?? 0;
}

const result = {
  calls: sampleCount,
  baseline: {
    p50Ms: percentile(baseline, 0.5),
    p95Ms: percentile(baseline, 0.95),
  },
  loggingEnabled: {
    p50Ms: percentile(enabled, 0.5),
    p95Ms: percentile(enabled, 0.95),
  },
};
const p50Delta = result.loggingEnabled.p50Ms - result.baseline.p50Ms;
const p95Delta = result.loggingEnabled.p95Ms - result.baseline.p95Ms;

console.log(JSON.stringify({ ...result, p50Delta, p95Delta }, null, 2));
if (p50Delta >= 0.05 || p95Delta >= 0.1) {
  console.error("Off-path logging scheduling exceeded the noise threshold.");
  process.exit(1);
}