import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getEncoding } from "js-tiktoken";
import { allToolSchemas } from "../server/tools/registry.js";

const baselineCommit = "746f6fd";
const serialization =
  "JSON.stringify of the ordered ListTools array with name, description, and inputSchema";
const tokenizer = "js-tiktoken cl100k_base";

interface AdvertisedTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

function advertisedOnly(
  tools: Array<AdvertisedTool & Record<string, unknown>>,
): AdvertisedTool[] {
  return tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

async function loadBaselineTools(commit: string): Promise<AdvertisedTool[]> {
  const temp = mkdtempSync(join(tmpdir(), "gitbridge-schema-audit-"));
  try {
    const archive = execFileSync("git", ["archive", commit, "server"], {
      maxBuffer: 20 * 1024 * 1024,
    });
    execFileSync("tar", ["-x", "-C", temp], { input: archive });
    symlinkSync(join(process.cwd(), "node_modules"), join(temp, "node_modules"), "dir");
    const registryUrl = pathToFileURL(
      join(temp, "server/tools/registry.ts"),
    ).href;
    const registry = (await import(registryUrl)) as {
      allToolSchemas: Array<AdvertisedTool & Record<string, unknown>>;
    };
    return advertisedOnly(registry.allToolSchemas);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const encoding = getEncoding("cl100k_base");
function measure(tools: AdvertisedTool[]) {
  const serialized = JSON.stringify(tools);
  return {
    total: {
      chars: serialized.length,
      bytes: Buffer.byteLength(serialized),
      tokens: encoding.encode(serialized).length,
    },
    perToolTokens: Object.fromEntries(
      tools.map((tool) => [
        tool.name,
        encoding.encode(JSON.stringify(tool)).length,
      ]),
    ) as Record<string, number>,
  };
}

const baselineTools = await loadBaselineTools(baselineCommit);
const currentTools = advertisedOnly(allToolSchemas);
const baseline = measure(baselineTools);
const current = measure(currentTools);
const currentByName = new Map(currentTools.map((tool) => [tool.name, tool]));
const comparableCurrentTools = baselineTools
  .map((tool) => currentByName.get(tool.name))
  .filter((tool): tool is AdvertisedTool => tool !== undefined);
const comparableCurrent = measure(comparableCurrentTools);
const tokenReductionPercent =
  ((baseline.total.tokens - comparableCurrent.total.tokens) /
    baseline.total.tokens) *
  100;

const missingTools = baselineTools
  .map((tool) => tool.name)
  .filter((name) => !(name in current.perToolTokens));
const unexpectedTools = currentTools
  .map((tool) => tool.name)
  .filter((name) => !(name in baseline.perToolTokens));

console.log(
  JSON.stringify(
    {
      methodology: { baselineCommit, tokenizer, serialization },
      baseline: baseline.total,
      currentComparable: comparableCurrent.total,
      currentWithAddedTools: current.total,
      tokenReductionPercent: Number(tokenReductionPercent.toFixed(2)),
      addedTools: Object.fromEntries(
        unexpectedTools.map((name) => [name, current.perToolTokens[name]]),
      ),
      perTool: Object.fromEntries(
        Object.entries(baseline.perToolTokens).map(([name, tokens]) => [
          name,
          {
            baselineTokens: tokens,
            currentTokens: current.perToolTokens[name],
          },
        ]),
      ),
    },
    null,
    2,
  ),
);

if (missingTools.length > 0) {
  console.error({ missingTools });
  process.exit(1);
}
if (tokenReductionPercent < 30) {
  console.error(
    `Schema reduction ${tokenReductionPercent.toFixed(2)}% is below the 30% target.`,
  );
  process.exit(1);
}