import fs from "node:fs";
import { allToolSchemas } from "../server/tools/registry.js";

const check = process.argv.includes("--check");
const start = "<!-- TOOLS:START — generated; do not edit; run `npm run docs:tools` -->";
const end = "<!-- TOOLS:END -->";
const categoryLabels: Record<string, string> = {
  file: "File Tools",
  issue: "Issue Tools",
  search: "Search & History",
  advanced: "Advanced File Operations",
  repo: "Repo Management",
  branch: "Branch Management",
  project: "Project Boards",
};

function replaceRegion(path: string, body: string) {
  const current = fs.readFileSync(path, "utf8");
  const pattern = /<!-- TOOLS:START[^\n]*-->[\s\S]*?<!-- TOOLS:END -->/;
  if (!pattern.test(current)) throw new Error(`Missing tool markers in ${path}`);
  const next = current.replace(pattern, `${start}\n${body}\n${end}`);
  if (check && next !== current) {
    console.error(`${path} tool documentation is stale; run npm run docs:tools`);
    process.exitCode = 1;
  } else if (!check && next !== current) {
    fs.writeFileSync(path, next);
  }
}

const groups = new Map<string, typeof allToolSchemas>();
for (const tool of allToolSchemas) {
  const label = categoryLabels[tool.category] ?? tool.category;
  groups.set(label, [...(groups.get(label) ?? []), tool]);
}

const readme = [...groups]
  .map(
    ([category, tools]) =>
      `### ${category}\n\n| Tool | Description |\n|------|-------------|\n${tools
        .map((tool) => `| \`${tool.name}\` | ${tool.description} |`)
        .join("\n")}`,
  )
  .join("\n\n");
replaceRegion("README.md", readme);

const ime = `### Live (V2):\n\n| Tool | Category | What it does |\n|------|----------|-------------|\n${allToolSchemas
  .map(
    (tool) =>
      `| \`${tool.name}\` | ${categoryLabels[tool.category] ?? tool.category} | ${tool.description} |`,
  )
  .join("\n")}`;
replaceRegion("IME.md", ime);

const replit = `- \`server/tools/\` — Individual tool implementations (${allToolSchemas.length} active + 4 permanently retired compatibility names)\n${[
  ...groups,
]
  .map(
    ([category, tools]) =>
      `  - ${category}: ${tools.map((tool) => `\`${tool.name}.ts\``).join(", ")}`,
  )
  .join("\n")}\n  - Retired compatibility names: \`read_file\`, \`write_file\`, \`patch_file\`, \`check_file_status\` return permanent migration errors without being advertised.`;
replaceRegion("replit.md", replit);

if (!check) console.log("Generated tool documentation.");