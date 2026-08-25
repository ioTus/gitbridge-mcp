import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const toolDir = "server/tools";
const files = fs
  .readdirSync(toolDir)
  .filter((name) => name.endsWith(".ts"));

for (const file of files) {
  const source = fs.readFileSync(path.join(toolDir, file), "utf8");
  assert.equal(source.includes("✅"), false, `${file} contains a success emoji`);
  assert.equal(
    source.includes("Writing to:"),
    false,
    `${file} contains a decorative write banner`,
  );
}

console.log(`success-response banner check passed for ${files.length} tool files`);