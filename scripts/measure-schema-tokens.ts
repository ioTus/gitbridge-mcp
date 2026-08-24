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

const issue44BaselineCommit = "746f6fd";
const retirementBaselineCommit = "8655251";
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

const baselineTools = await loadBaselineTools(issue44BaselineCommit);
const retirementBaselineTools = await loadBaselineTools(
  retirementBaselineCommit,
);
const currentTools = advertisedOnly(allToolSchemas);
const postRetirementAddedTools = currentTools
  .map((tool) => tool.name)
  .filter(
    (name) =>
      !retirementBaselineTools.some((baselineTool) => baselineTool.name === name),
  );
const postRetirementTools = currentTools.filter(
  (tool) => !postRetirementAddedTools.includes(tool.name),
);
const baseline = measure(baselineTools);
const retirementBaseline = measure(retirementBaselineTools);
const current = measure(currentTools);
const postRetirement = measure(postRetirementTools);
const retirementBaselineByName = new Map(
  retirementBaselineTools.map((tool) => [tool.name, tool]),
);
const issue44ComparableTools = baselineTools
  .map((tool) => retirementBaselineByName.get(tool.name))
  .filter((tool): tool is AdvertisedTool => tool !== undefined);
const issue44Comparable = measure(issue44ComparableTools);
const issue44ReductionPercent =
  ((baseline.total.tokens - issue44Comparable.total.tokens) /
    baseline.total.tokens) *
  100;
const retirementReductionPercent =
  ((retirementBaseline.total.tokens - postRetirement.total.tokens) /
    retirementBaseline.total.tokens) *
  100;
const addedSinceIssue44 = retirementBaselineTools
  .map((tool) => tool.name)
  .filter((name) => !(name in baseline.perToolTokens));
const retiredTools = retirementBaselineTools
  .map((tool) => tool.name)
  .filter((name) => !(name in current.perToolTokens));

console.log(
  JSON.stringify(
    {
      methodology: {
        issue44BaselineCommit,
        retirementBaselineCommit,
        tokenizer,
        serialization,
      },
      issue44: {
        baseline: baseline.total,
        optimizedComparable: issue44Comparable.total,
        tokenReductionPercent: Number(issue44ReductionPercent.toFixed(2)),
        addedTools: Object.fromEntries(
          addedSinceIssue44.map((name) => [
            name,
            retirementBaseline.perToolTokens[name],
          ]),
        ),
      },
      retirement: {
        before: retirementBaseline.total,
        after: postRetirement.total,
        beforeToolCount: retirementBaselineTools.length,
        afterToolCount: postRetirementTools.length,
        retiredTools,
        tokenReductionPercent: Number(
          retirementReductionPercent.toFixed(2),
        ),
      },
      current: {
        total: current.total,
        toolCount: currentTools.length,
        addedAfterRetirement: Object.fromEntries(
          postRetirementAddedTools.map((name) => [
            name,
            current.perToolTokens[name],
          ]),
        ),
      },
    },
    null,
    2,
  ),
);

const expectedRetiredTools = [
  "read_file",
  "write_file",
  "patch_file",
  "check_file_status",
].sort();
if (
  JSON.stringify([...retiredTools].sort()) !==
  JSON.stringify(expectedRetiredTools)
) {
  console.error({ expectedRetiredTools, retiredTools });
  process.exit(1);
}
if (issue44ReductionPercent < 30) {
  console.error(
    `Issue #44 schema reduction ${issue44ReductionPercent.toFixed(2)}% is below the 30% target.`,
  );
  process.exit(1);
}
if (
  retirementBaselineTools.length !== 25 ||
  postRetirementTools.length !== 21 ||
  retirementReductionPercent <= 0
) {
  console.error("Issue #45 retirement audit did not produce 25 -> 21.");
  process.exit(1);
}
if (
  currentTools.length !== 22 ||
  JSON.stringify(postRetirementAddedTools) !==
    JSON.stringify(["session_bootstrap"])
) {
  console.error({
    expectedCurrentToolCount: 22,
    postRetirementAddedTools,
  });
  process.exit(1);
}