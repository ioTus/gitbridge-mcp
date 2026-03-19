import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { activeToolSchemas, phase2ToolSchemas, type ToolSchema } from "../server/tools/registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

interface DocToolInfo {
  name: string;
  category: string;
  description: string;
}

function loadTools(): { phase1: DocToolInfo[]; phase2: DocToolInfo[] } {
  const phase1: DocToolInfo[] = activeToolSchemas.map((s: ToolSchema) => ({
    name: s.name,
    category: s.category,
    description: s.description,
  }));

  const phase2: DocToolInfo[] = phase2ToolSchemas.map((s: ToolSchema) => ({
    name: s.name,
    category: s.category,
    description: s.description.replace("[Phase 2] ", ""),
  }));

  return { phase1, phase2 };
}

const categoryLabels: Record<string, string> = {
  file: "File Tools",
  issue: "Issue Tools",
  search: "Search & History",
  advanced: "Advanced File Operations",
  repo: "Repo Management",
  branch: "Branch Management",
  project: "Project Boards",
};
const categoryOrder = ["file", "issue", "search", "advanced", "repo", "branch", "project"];

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function groupByCategory(tools: DocToolInfo[]): Record<string, DocToolInfo[]> {
  const groups: Record<string, DocToolInfo[]> = {};
  for (const t of tools) {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  }
  return groups;
}

function generateReadmeTools(phase1: DocToolInfo[], phase2: DocToolInfo[]): string {
  const grouped = groupByCategory(phase1);
  const lines: string[] = [];

  for (const cat of sortCategories(Object.keys(grouped))) {
    const label = categoryLabels[cat] || cat;
    lines.push(`### ${label}`);
    lines.push("");
    lines.push("| Tool | Description |");
    lines.push("|------|-------------|");
    for (const t of grouped[cat]) {
      lines.push(`| \`${t.name}\` | ${t.description} |`);
    }
    lines.push("");
  }

  if (phase2.length > 0) {
    lines.push("### Phase 2 (Registered stubs, not yet implemented)");
    lines.push("");
    lines.push("| Tool | Description |");
    lines.push("|------|-------------|");
    for (const t of phase2) {
      lines.push(`| \`${t.name}\` | ${t.description} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateClaudeTools(phase1: DocToolInfo[], phase2: DocToolInfo[]): string {
  const lines: string[] = [];

  lines.push("### Live (V2):");
  lines.push("");
  lines.push("| Tool | Category | What it does |");
  lines.push("|------|----------|-------------|");
  for (const t of phase1) {
    const catLabel = categoryLabels[t.category] || t.category;
    lines.push(`| \`${t.name}\` | ${catLabel} | ${t.description} |`);
  }
  lines.push("");
  lines.push("All tools require `owner` and `repo` parameters except `create_repo`");
  lines.push("(which takes `name` and optional `org`). Write tools prefix responses");
  lines.push("with `✅ Writing to: {owner}/{repo}`.");
  lines.push("");

  if (phase2.length > 0) {
    lines.push("### Planned (Phase 2 stubs — registered but not yet implemented):");
    lines.push("");
    lines.push("| Tool | What it does |");
    lines.push("|------|-------------|");
    for (const t of phase2) {
      lines.push(`| \`${t.name}\` | ${t.description} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateReplitTools(phase1: DocToolInfo[], phase2: DocToolInfo[]): string {
  const grouped = groupByCategory(phase1);
  const lines: string[] = [];
  const totalActive = phase1.length;
  const totalStubs = phase2.length;

  lines.push(`- \`server/tools/\` — Individual tool implementations (${totalActive} active + ${totalStubs} Phase 2 stubs)`);

  for (const cat of sortCategories(Object.keys(grouped))) {
    const label = categoryLabels[cat] || cat;
    const toolList = grouped[cat].map((t) => `\`${t.name}.ts\``).join(", ");
    lines.push(`  - ${label}: ${toolList}`);
  }

  const stubNames = phase2.map((t) => t.name).join(", ");
  lines.push(`  - Stubs: \`phase2_stubs.ts\` (${stubNames})`);
  lines.push("");

  return lines.join("\n");
}

function replaceSection(content: string, startMarker: string, endMarker: string, newContent: string, filePath: string): string {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Markers not found in ${filePath}: ${startMarker} / ${endMarker}`);
  }
  return content.substring(0, startIdx + startMarker.length) + "\n" + newContent + content.substring(endIdx);
}

function main() {
  const { phase1, phase2 } = loadTools();
  console.log(`Loaded ${phase1.length} active tools, ${phase2.length} Phase 2 stubs`);

  const readmePath = path.join(ROOT, "README.md");
  let readme = fs.readFileSync(readmePath, "utf-8");
  readme = replaceSection(readme, "<!-- TOOLS:START -->", "<!-- TOOLS:END -->", generateReadmeTools(phase1, phase2), readmePath);
  fs.writeFileSync(readmePath, readme);
  console.log("Updated README.md");

  const imePath = path.join(ROOT, "IME.md");
  let ime = fs.readFileSync(imePath, "utf-8");
  ime = replaceSection(ime, "<!-- TOOLS:START -->", "<!-- TOOLS:END -->", generateClaudeTools(phase1, phase2), imePath);
  fs.writeFileSync(imePath, ime);
  console.log("Updated IME.md");

  const replitPath = path.join(ROOT, "replit.md");
  let replit = fs.readFileSync(replitPath, "utf-8");
  replit = replaceSection(replit, "<!-- TOOLS:START -->", "<!-- TOOLS:END -->", generateReplitTools(phase1, phase2), replitPath);
  fs.writeFileSync(replitPath, replit);
  console.log("Updated replit.md");
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
