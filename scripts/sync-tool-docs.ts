import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { allToolSchemas, phase2ToolSchemas } from "../server/tools/registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CATEGORY_LABELS: Record<string, string> = {
  file: "File Tools",
  issue: "Issue Tools",
  search: "Search & History",
  branch: "Branch Management",
  advanced: "Advanced File Operations",
  repo: "Repo Management",
  project: "Project Boards",
};

const CATEGORY_ORDER = ["file", "issue", "search", "branch", "advanced", "repo", "project"];

function replaceBlock(content: string, newBody: string, startComment: string): string {
  const startRe = /<!-- TOOLS:START[^>]*-->/;
  const endMarker = "<!-- TOOLS:END -->";
  const startMatch = content.match(startRe);
  if (!startMatch) throw new Error("TOOLS:START marker not found");
  const endIdx = content.indexOf(endMarker);
  if (endIdx === -1) throw new Error("TOOLS:END marker not found");
  const startIdx = content.indexOf(startMatch[0]);
  return content.slice(0, startIdx) + startComment + "\n" + newBody + endMarker + content.slice(endIdx + endMarker.length);
}

function readmeBlock(): string {
  const byCategory: Record<string, typeof allToolSchemas> = {};
  for (const tool of allToolSchemas) {
    (byCategory[tool.category] ??= []).push(tool);
  }
  const sections = CATEGORY_ORDER
    .filter((cat) => byCategory[cat]?.length)
    .map((cat) => {
      const rows = byCategory[cat].map((t) => `| \`${t.name}\` | ${t.description} |`).join("\n");
      return `### ${CATEGORY_LABELS[cat]}\n\n| Tool | Description |\n|------|-------------|\n${rows}`;
    });
  return sections.join("\n\n") + "\n";
}

function imeBlock(): string {
  const rows = allToolSchemas.map((t) => `| \`${t.name}\` | ${CATEGORY_LABELS[t.category] ?? t.category} | ${t.description} |`).join("\n");
  const footer = `All tools require \`owner\` and \`repo\` parameters except \`create_repo\`
(which takes \`name\` and optional \`org\`) and \`get_project_board\`
(where \`repo\` is optional — only \`owner\` and \`project_number\` are required).
Write tools prefix responses with \`✅ Writing to: {owner}/{repo}\`.
Project tools require the PAT to have the \`project\` scope for
GitHub Projects V2 access.`;
  return `### Live (V2):\n\n| Tool | Category | What it does |\n|------|----------|-------------|\n${rows}\n\n${footer}\n`;
}

const activeCount = allToolSchemas.length;
const phase2Count = phase2ToolSchemas.length;
const readmeComment = `<!-- TOOLS:START — When adding or modifying tools, update this table AND the tables in IME.md and replit.md. Tool count: ${activeCount} -->`;
const imeComment = `<!-- TOOLS:START — When adding or modifying tools, update this table AND the tables in README.md and replit.md. Tool count: ${activeCount} -->`;

const readmePath = resolve(ROOT, "README.md");
writeFileSync(readmePath, replaceBlock(readFileSync(readmePath, "utf-8"), readmeBlock(), readmeComment));
console.log("✅ README.md updated");

const imePath = resolve(ROOT, "IME.md");
writeFileSync(imePath, replaceBlock(readFileSync(imePath, "utf-8"), imeBlock(), imeComment));
console.log("✅ IME.md updated");

const replitPath = resolve(ROOT, "replit.md");
const replitContent = readFileSync(replitPath, "utf-8");
const updatedReplit = replitContent.replace(
  /`server\/tools\/` — Individual tool implementations \(\d+ active \+ \d+ Phase 2 stubs\)/,
  `\`server/tools/\` — Individual tool implementations (${activeCount} active + ${phase2Count} Phase 2 stubs)`
);
writeFileSync(replitPath, updatedReplit);
console.log("✅ replit.md updated");

console.log(`\nDone — ${activeCount} active tools documented.`);
