import test from "node:test";
import assert from "node:assert/strict";

import { resolveCommandInvocation, runVerifyRelease } from "../scripts/verify-release.mjs";

type CommandResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

function createCommandStub(responses: Record<string, CommandResult | string>) {
  const calls: string[] = [];

  return {
    calls,
    runCommand: async (command: string, args: string[]) => {
      const key = [command, ...args].join(" ");
      calls.push(key);
      const response = responses[key];
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      if (typeof response === "string") {
        return { code: 0, stdout: response, stderr: "" };
      }
      return {
        code: response.code ?? 0,
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? ""
      };
    }
  };
}

test("verify release writes one success summary after running the required checks", async () => {
  const runner = createCommandStub({
    "pnpm verify:ci": { code: 0, stdout: "verify ok\n" },
    "pnpm test:e2e -- --workers=1": {
      code: 0,
      stdout: "playwright ok\n"
    },
    "git diff --check": { code: 0, stdout: "" },
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n"
  });
  const writes: Array<{ target: string; content: string }> = [];

  const result = await runVerifyRelease({
    cwd: "C:\\repo\\Cutouts",
    runDoctor: async () => ({
      status: "healthy",
      exitCode: 0,
      markdown: "# Workflow Doctor\nHealthy\n",
      warnings: [],
      errors: []
    }),
    runCommand: runner.runCommand,
    ensureDir: async () => undefined,
    writeFile: async (target: string, content: string) => {
      writes.push({ target, content });
    },
    now: () => new Date("2026-07-23T14:15:16.000Z")
  });

  assert.equal(result.exitCode, 0);
  assert.equal(writes.length, 1);
  assert.equal(
    writes[0]?.target,
    "C:\\repo\\Cutouts\\.scratch\\workflow-hygiene\\evidence\\verify-release-20260723-141516.md"
  );
  assert.match(writes[0]?.content ?? "", /Commit: `abc1234def5678`/);
  assert.match(writes[0]?.content ?? "", /pnpm verify:ci/);
  assert.match(writes[0]?.content ?? "", /pnpm test:e2e -- --workers=1/);
  assert.deepEqual(runner.calls, [
    "pnpm verify:ci",
    "pnpm test:e2e -- --workers=1",
    "git diff --check",
    "git rev-parse HEAD",
    "git status --short --branch"
  ]);
});

test("verify release stops on invalid doctor state and still records one failure summary", async () => {
  const runner = createCommandStub({
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n M README.md\n"
  });
  const writes: string[] = [];

  const result = await runVerifyRelease({
    cwd: "C:\\repo\\Cutouts",
    runDoctor: async () => ({
      status: "invalid",
      exitCode: 2,
      markdown: "# Workflow Doctor\nInvalid\n",
      warnings: [],
      errors: ["broken canonical worktree"]
    }),
    runCommand: runner.runCommand,
    ensureDir: async () => undefined,
    writeFile: async (_target: string, content: string) => {
      writes.push(content);
    },
    now: () => new Date("2026-07-23T14:15:16.000Z")
  });

  assert.equal(result.exitCode, 2);
  assert.deepEqual(runner.calls, ["git rev-parse HEAD", "git status --short --branch"]);
  assert.equal(writes.length, 1);
  assert.match(writes[0] ?? "", /Doctor status: `invalid`/);
  assert.match(writes[0] ?? "", /Required release checks were not run because the workflow doctor found invalid state/i);
});

test("verify release returns nonzero on doctor warnings but still records all required checks", async () => {
  const runner = createCommandStub({
    "pnpm verify:ci": { code: 0, stdout: "verify ok\n" },
    "pnpm test:e2e -- --workers=1": {
      code: 0,
      stdout: "playwright ok\n"
    },
    "git diff --check": { code: 0, stdout: "" },
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n M README.md\n"
  });
  const writes: string[] = [];

  const result = await runVerifyRelease({
    cwd: "C:\\repo\\Cutouts",
    runDoctor: async () => ({
      status: "warning",
      exitCode: 1,
      markdown: "# Workflow Doctor\nWarning\n",
      warnings: ["dirty tree"],
      errors: []
    }),
    runCommand: runner.runCommand,
    ensureDir: async () => undefined,
    writeFile: async (_target: string, content: string) => {
      writes.push(content);
    },
    now: () => new Date("2026-07-23T14:15:16.000Z")
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(runner.calls, [
    "pnpm verify:ci",
    "pnpm test:e2e -- --workers=1",
    "git diff --check",
    "git rev-parse HEAD",
    "git status --short --branch"
  ]);
  assert.equal(writes.length, 1);
  assert.match(writes[0] ?? "", /Doctor status: `warning`/);
  assert.match(writes[0] ?? "", /pnpm verify:ci` \| `passed`/);
  assert.match(writes[0] ?? "", /Release verification failed/);
});

test("verify release keeps collecting evidence when verify fails and exits nonzero", async () => {
  const runner = createCommandStub({
    "pnpm verify:ci": { code: 1, stdout: "", stderr: "verify failed\n" },
    "pnpm test:e2e -- --workers=1": {
      code: 0,
      stdout: "playwright ok\n"
    },
    "git diff --check": { code: 1, stdout: "README.md:12: trailing whitespace\n" },
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n M README.md\n"
  });
  const writes: string[] = [];

  const result = await runVerifyRelease({
    cwd: "C:\\repo\\Cutouts",
    runDoctor: async () => ({
      status: "healthy",
      exitCode: 0,
      markdown: "# Workflow Doctor\nHealthy\n",
      warnings: [],
      errors: []
    }),
    runCommand: runner.runCommand,
    ensureDir: async () => undefined,
    writeFile: async (_target: string, content: string) => {
      writes.push(content);
    },
    now: () => new Date("2026-07-23T14:15:16.000Z")
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(runner.calls, [
    "pnpm verify:ci",
    "pnpm test:e2e -- --workers=1",
    "git diff --check",
    "git rev-parse HEAD",
    "git status --short --branch"
  ]);
  assert.equal(writes.length, 1);
  assert.match(writes[0] ?? "", /pnpm verify:ci` \| `failed`/);
  assert.match(writes[0] ?? "", /git diff --check` \| `failed`/);
  assert.match(writes[0] ?? "", /Final working tree state/);
});

test("verify release captures generatedAt once for both filename and summary body", async () => {
  const runner = createCommandStub({
    "pnpm verify:ci": { code: 0, stdout: "verify ok\n" },
    "pnpm test:e2e -- --workers=1": {
      code: 0,
      stdout: "playwright ok\n"
    },
    "git diff --check": { code: 0, stdout: "" },
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n"
  });
  const writes: Array<{ target: string; content: string }> = [];
  const generatedTimes = [
    new Date("2026-07-23T23:59:59.999Z"),
    new Date("2026-07-24T00:00:00.000Z")
  ];
  let nowCalls = 0;

  const result = await runVerifyRelease({
    cwd: "C:\\repo\\Cutouts",
    runDoctor: async () => ({
      status: "healthy",
      exitCode: 0,
      markdown: "# Workflow Doctor\nHealthy\n",
      warnings: [],
      errors: []
    }),
    runCommand: runner.runCommand,
    ensureDir: async () => undefined,
    writeFile: async (target: string, content: string) => {
      writes.push({ target, content });
    },
    now: () => {
      const next = generatedTimes[Math.min(nowCalls, generatedTimes.length - 1)];
      nowCalls += 1;
      return next;
    }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(nowCalls, 1);
  assert.equal(
    writes[0]?.target,
    "C:\\repo\\Cutouts\\.scratch\\workflow-hygiene\\evidence\\verify-release-20260723-235959.md"
  );
  assert.match(writes[0]?.content ?? "", /Generated: 2026-07-23T23:59:59.999Z/);
});

test("resolveCommandInvocation uses explicit cmd.exe for Windows pnpm without shell mode", () => {
  const invocation = resolveCommandInvocation("pnpm", ["test:e2e", "--", "--workers=1"], {
    cwd: "C:\\repo\\Cutouts",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    platform: "win32"
  });

  assert.equal(invocation.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(invocation.args, ["/d", "/s", "/c", "pnpm test:e2e -- --workers=1"]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.cwd, "C:\\repo\\Cutouts");
  assert.equal(invocation.options.windowsHide, true);
});

test("resolveCommandInvocation keeps direct executables shell-free outside Windows pnpm", () => {
  const invocation = resolveCommandInvocation("git", ["diff", "--check"], {
    cwd: "/repo/Cutouts",
    platform: "linux"
  });

  assert.equal(invocation.command, "git");
  assert.deepEqual(invocation.args, ["diff", "--check"]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.cwd, "/repo/Cutouts");
});
