import test from "node:test";
import assert from "node:assert/strict";

import {
  discoverTypeScriptTests,
  runDiscoveredTypeScriptTests
} from "../scripts/run-ts-tests.mjs";

type DirectoryEntry = {
  name: string;
  isFile(): boolean;
};

function fileEntry(name: string): DirectoryEntry {
  return {
    name,
    isFile: () => true
  };
}

function directoryEntry(name: string): DirectoryEntry {
  return {
    name,
    isFile: () => false
  };
}

test("discoverTypeScriptTests keeps only immediate tests/*.test.ts files in sorted order", async () => {
  const discovered = await discoverTypeScriptTests({
    cwd: "C:\\repo\\Cutouts",
    readdirImpl: async () =>
      [
        fileEntry("traceWorkflow.test.ts"),
        directoryEntry("e2e"),
        fileEntry("guidedWorkflow.test.ts"),
        fileEntry("README.md"),
        fileEntry("projectSession.spec.ts")
      ] as never
  });

  assert.deepEqual(discovered, [
    "tests/guidedWorkflow.test.ts",
    "tests/traceWorkflow.test.ts"
  ]);
});

test("runDiscoveredTypeScriptTests stops on the first failure after printing the deterministic file list", async () => {
  const logs: string[] = [];
  const calls: Array<{ cwd?: string; testFile: string }> = [];

  const exitCode = await runDiscoveredTypeScriptTests(
    [
      "tests/alpha.test.ts",
      "tests/beta.test.ts",
      "tests/charlie.test.ts"
    ],
    {
      cwd: "C:\\repo\\Cutouts",
      log: (line: string) => logs.push(line),
      runTestImpl: async (testFile: string, options: { cwd?: string }) => {
        calls.push({ cwd: options.cwd, testFile });
        return {
          exitCode: testFile === "tests/beta.test.ts" ? 2 : 0,
          signal: null
        };
      }
    }
  );

  assert.equal(exitCode, 2);
  assert.deepEqual(calls, [
    { cwd: "C:\\repo\\Cutouts", testFile: "tests/alpha.test.ts" },
    { cwd: "C:\\repo\\Cutouts", testFile: "tests/beta.test.ts" }
  ]);
  assert.deepEqual(logs.slice(0, 4), [
    "Discovered 3 TypeScript test files:",
    "- tests/alpha.test.ts",
    "- tests/beta.test.ts",
    "- tests/charlie.test.ts"
  ]);
  assert.match(logs.join("\n"), /Running tests\/alpha\.test\.ts/);
  assert.match(logs.join("\n"), /Stopped at tests\/beta\.test\.ts with exit code 2\./);
});
