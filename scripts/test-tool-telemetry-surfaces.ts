import fs from "node:fs";

const routes = fs.readFileSync("server/routes.ts", "utf8");
const dashboard = fs.readFileSync("client/src/pages/Home.tsx", "utf8");
const forbidden = [
  "/api/tool-log",
  "/api/tool-usage-summary",
  "recentToolCalls",
  "Recent Tool Activity",
];

let failures = 0;
for (const value of forbidden) {
  if (routes.includes(value) || dashboard.includes(value)) {
    console.error(`Forbidden telemetry read surface remains: ${value}`);
    failures++;
  }
}

if (failures > 0) process.exit(1);
console.log("telemetry HTTP and dashboard surfaces are absent");