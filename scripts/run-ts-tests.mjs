import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = "tests";
const TEST_SUFFIX = ".test.ts";

function toPlatformPath(relativePath) {
  return relativePath.split("/").join(sep);
}

export async function discoverTypeScriptTests({
  cwd = process.cwd(),
  readdirImpl = readdir
} = {}) {
  const entries = await readdirImpl(`${cwd}${sep}${TEST_DIRECTORY}`, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(TEST_SUFFIX))
    .map((entry) => `${TEST_DIRECTORY}/${entry.name}`)
    .sort((left, right) => left.localeCompare(right));
}

export function logDiscoveredTypeScriptTests(testFiles, { log = console.log } = {}) {
  const fileLabel = testFiles.length === 1 ? "file" : "files";
  log(`Discovered ${testFiles.length} TypeScript test ${fileLabel}:`);
  for (const testFile of testFiles) {
    log(`- ${testFile}`);
  }
}

export async function runNodeTypeScriptTest(
  testFile,
  {
    cwd = process.cwd(),
    nodeExecutable = process.execPath,
    spawnImpl = spawn
  } = {}
) {
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(
      nodeExecutable,
      ["--experimental-strip-types", toPlatformPath(testFile)],
      {
        cwd,
        shell: false,
        stdio: "inherit",
        windowsHide: true
      }
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({
        exitCode: code ?? 1,
        signal: signal ?? null
      });
    });
  });
}

export async function runDiscoveredTypeScriptTests(
  testFiles,
  {
    cwd = process.cwd(),
    log = console.log,
    runTestImpl = runNodeTypeScriptTest,
    nodeExecutable = process.execPath,
    spawnImpl = spawn
  } = {}
) {
  logDiscoveredTypeScriptTests(testFiles, { log });

  for (const testFile of testFiles) {
    log(`Running ${testFile}`);
    const result = await runTestImpl(testFile, { cwd, nodeExecutable, spawnImpl });
    if (result.signal) {
      log(`Stopped at ${testFile} after signal ${result.signal}.`);
      return 1;
    }
    if (result.exitCode !== 0) {
      log(`Stopped at ${testFile} with exit code ${result.exitCode}.`);
      return result.exitCode;
    }
  }

  log("All discovered TypeScript tests passed.");
  return 0;
}

export async function main() {
  const discoveredTests = await discoverTypeScriptTests();
  const exitCode = await runDiscoveredTypeScriptTests(discoveredTests);
  process.exitCode = exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === entryPoint) {
  await main();
}
