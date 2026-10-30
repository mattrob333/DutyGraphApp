// Pin: DutyGraphV2 earn-contract0.1.0 at749f3318dc9fb4b21ad83262cc87ad748d5c6822.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "openapi-typescript@7",
    "../contracts/earn-mobile.openapi.json",
    "-o",
    "src/api/generated/earn-mobile.ts",
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
