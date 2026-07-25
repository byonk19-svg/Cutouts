import test from "node:test";
import assert from "node:assert/strict";

import { runPlaywrightArgs } from "../scripts/run-playwright.mjs";

test("runPlaywrightArgs strips the pnpm separator before forwarding flags", () => {
  assert.deepEqual(
    runPlaywrightArgs(["--", "--workers=1"]),
    ["playwright", "test", "--config", "tests/e2e/playwright.config.ts", "--workers=1"]
  );
});
