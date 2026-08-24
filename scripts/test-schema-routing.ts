import { allToolSchemas } from "../server/tools/registry.js";

const schemaByName = new Map(allToolSchemas.map((tool) => [tool.name, tool]));

const routingChecks = [
  ["read_file", ["file", "sha"]],
  ["read_files", ["20 files", "shas", "inline"]],
  ["patch_file", ["one file", "ordered edits"]],
  ["patch_multiple_files", ["across files", "ordered edits"]],
  ["push_multiple_files", ["multiple files", "one commit"]],
  ["read_issue", ["issue", "comments"]],
  ["update_issue", ["update", "issue"]],
  ["add_issue_comment", ["comment", "issue"]],
  ["list_issues", ["list", "issues"]],
] as const;

let failures = 0;
for (const [name, signals] of routingChecks) {
  const description = schemaByName.get(name)?.description.toLowerCase() ?? "";
  const missing = signals.filter((signal) => !description.includes(signal));
  if (missing.length > 0) {
    console.error(`${name}: missing routing signal(s): ${missing.join(", ")}`);
    failures++;
  }
}

const advertisedNames = allToolSchemas.map((tool) => tool.name);
if (advertisedNames.length !== 25 || new Set(advertisedNames).size !== 25) {
  console.error("Expected 25 uniquely named advertised tools.");
  failures++;
}

if (failures > 0) process.exit(1);
console.log("schema-routing checks passed for 9 fixed scenarios and 25 tools");