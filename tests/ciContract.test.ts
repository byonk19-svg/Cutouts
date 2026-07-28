import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CI checks committed whitespace across the pull-request range", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(
    packageJson.scripts["verify:ci"] ?? "",
    /git diff --check origin\/main\.\.\.HEAD/
  );
  assert.equal(
    workflow.match(/fetch-depth:\s*0/g)?.length,
    2,
    "both CI jobs need full history so origin/main...HEAD resolves"
  );
});
