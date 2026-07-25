import test from "node:test";
import assert from "node:assert/strict";

import { runWorkflowDoctor } from "../scripts/workflow-doctor.mjs";

type ExecResult = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

function createExecStub(responses: Record<string, ExecResult | string>) {
  const calls: string[] = [];

  return {
    calls,
    execFile: async (file: string, args: string[]) => {
      const key = [file, ...args].join(" ");
      calls.push(key);
      const response = responses[key];
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      if (typeof response === "string") {
        return { stdout: response, stderr: "", code: 0 };
      }
      return {
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? "",
        code: response.code ?? 0
      };
    }
  };
}

const repoRoot = "C:\\repo\\Cutouts";
const featureDir = `${repoRoot}\\.scratch\\workflow-hygiene`;
const statusFile = `${featureDir}\\STATUS.md`;
const issueFile = `${featureDir}\\issues\\01-status-contract-and-workflow-commands.md`;

function createStatusFile(overrides: Partial<Record<string, string>> = {}) {
  const lines = {
    updated: "2026-07-23",
    feature: "workflow-hygiene",
    canonical: repoRoot,
    featureBranch: "codex/workflow-hygiene",
    baseBranch: "main",
    baseCommit: "base0001",
    headCommit: "abc1234def5678",
    currentTicket: "issues/01-status-contract-and-workflow-commands.md"
  };
  const values = { ...lines, ...overrides };
  return `# Feature Status

Updated: ${values.updated}
Feature: ${values.feature}
Phase: implementation

## Repository state

Canonical worktree: ${values.canonical}
Feature branch: ${values.featureBranch}
Base branch: ${values.baseBranch}
Base commit: ${values.baseCommit}
Head commit: ${values.headCommit}
Working tree: tracker files added for the approved feature
Known unrelated items: none

## Current work

Current ticket: ${values.currentTicket}
Current owner: worker
Completed tickets and commits: none
Blocked by: none
`;
}

test("workflow doctor reports a healthy canonical worktree", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t3\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene

worktree C:/repo/primary-checkout
HEAD base0001
branch refs/heads/main
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile();
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.exitCode, 0);
  assert.match(result.markdown, /Current worktree: `C:\\repo\\Cutouts`/);
  assert.match(result.markdown, /Branch: `codex\/workflow-hygiene` at `abc1234`/);
  assert.match(result.markdown, /Recorded canonical worktree: `C:\\repo\\Cutouts`/);
  assert.match(result.markdown, /Active ticket: `issues\/01-status-contract-and-workflow-commands.md`/);
  assert.match(result.markdown, /Ports: `5173` available, `8787` available/);
  assert.ok(exec.calls.includes("git worktree list --porcelain"));
});

test("workflow doctor warns when live HEAD advances beyond the recorded head", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "def5678\n",
    "git rev-parse HEAD": "def5678abc9012\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t4\n",
    "git rev-parse --verify abc1234def5678": "abc1234def5678\n",
    "git merge-base --is-ancestor abc1234def5678 HEAD": { code: 0, stdout: "", stderr: "" },
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD def5678abc9012
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile();
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "warning");
  assert.equal(result.exitCode, 1);
  assert.match(
    result.markdown,
    /Live HEAD `def5678abc9012` has advanced beyond recorded head `abc1234def5678`/i
  );
});

test("workflow doctor warns for detached head, duplicate worktrees, and busy ports", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": { code: 1, stderr: "detached\n" },
    "git rev-parse --short HEAD": "fedcba9\n",
    "git rev-parse HEAD": "fedcba987654321\n",
    "git status --short --branch": "## HEAD (no branch)\n M README.md\n?? notes.txt\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "1\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD fedcba987654321
detached

worktree C:/extra/duplicate
HEAD fedcba987654321
branch refs/heads/codex/workflow-hygiene
prunable gitdir file points to non-existent location
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) {
        return createStatusFile({
          headCommit: "fedcba987654321"
        });
      }
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: false })
  });

  assert.equal(result.status, "warning");
  assert.equal(result.exitCode, 1);
  assert.match(result.markdown, /Detached HEAD: `fedcba9`/);
  assert.match(result.markdown, /dirty: 1, untracked: 1/);
  assert.match(result.markdown, /duplicate feature worktree/i);
  assert.match(result.markdown, /Cleanup candidates/);
  assert.match(result.markdown, /port `5173` is busy/i);
});

test("workflow doctor fails invalid required state when the canonical tracker record is broken", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) {
        return createStatusFile({
          canonical: "C:\\repo\\Elsewhere",
          currentTicket: "issues\\02-missing.md"
        });
      }
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.match(result.markdown, /Current worktree does not match the recorded canonical worktree/i);
  assert.match(result.markdown, /Active ticket file is missing/i);
});

test("workflow doctor fails invalid required state when recorded base is not an ancestor of HEAD or head commit is stale", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base9999\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 1, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base9999\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git rev-parse --verify head0001": "head0001\n",
    "git merge-base --is-ancestor head0001 HEAD": { code: 1, stdout: "", stderr: "" },
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) {
        return createStatusFile({
          baseCommit: "base0001",
          headCommit: "head0001"
        });
      }
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.match(result.markdown, /Recorded base commit `base0001` is not an ancestor of live HEAD `abc1234def5678`/i);
  assert.match(result.markdown, /Recorded head commit `head0001` is not an ancestor of live HEAD `abc1234def5678`/i);
});

test("workflow doctor warns when the base branch has advanced beyond the recorded branch-start base", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base9999\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base --is-ancestor base0001 base9999": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base9999\n",
    "git rev-list --left-right --count main...HEAD": "2\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile({ baseCommit: "base0001" });
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "warning");
  assert.equal(result.exitCode, 1);
  assert.match(result.markdown, /Base branch `main` has advanced beyond recorded base `base0001` to `base9999`/i);
});

test("workflow doctor warns when the live base branch ref is behind the recorded base", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base9999": "base9999\n",
    "git merge-base --is-ancestor base9999 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base --is-ancestor base9999 base0001": { code: 1, stdout: "", stderr: "" },
    "git merge-base --is-ancestor base0001 base9999": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t3\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile({ baseCommit: "base9999" });
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "warning");
  assert.equal(result.exitCode, 1);
  assert.match(result.markdown, /Base branch `main` is behind recorded base `base9999`; live ref is `base0001`/i);
});

test("workflow doctor rejects a current ticket path that escapes the feature issues directory", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });
  let attemptedRead = false;
  let attemptedExists = false;

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) {
        return createStatusFile({
          currentTicket: "..\\PRD.md"
        });
      }
      attemptedRead = true;
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => {
      if (target === statusFile) return true;
      attemptedExists = true;
      return false;
    },
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.equal(attemptedExists, false);
  assert.equal(attemptedRead, false);
  assert.match(result.markdown, /Active ticket must stay inside `issues\/<NN>-.*` under the feature directory/i);
});

test("workflow doctor rejects an absolute current ticket path", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });
  let attemptedRead = false;
  let attemptedExists = false;

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) {
        return createStatusFile({
          currentTicket: "C:\\temp\\ticket.md"
        });
      }
      attemptedRead = true;
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => {
      if (target === statusFile) return true;
      attemptedExists = true;
      return false;
    },
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.equal(attemptedExists, false);
  assert.equal(attemptedRead, false);
  assert.match(result.markdown, /Active ticket must stay inside `issues\/<NN>-.*` under the feature directory/i);
});

test("workflow doctor fails invalid required state when base commit is missing from STATUS", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile({ baseCommit: "" });
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.match(result.markdown, /Recorded base commit is missing from STATUS\.md/i);
});

test("workflow doctor fails invalid required state when head commit is missing from STATUS", async () => {
  const exec = createExecStub({
    "git rev-parse --show-toplevel": `${repoRoot}\n`,
    "git symbolic-ref --quiet --short HEAD": "codex/workflow-hygiene\n",
    "git rev-parse --short HEAD": "abc1234\n",
    "git rev-parse HEAD": "abc1234def5678\n",
    "git status --short --branch": "## codex/workflow-hygiene\n",
    "git rev-parse main": "base0001\n",
    "git rev-parse --verify base0001": "base0001\n",
    "git merge-base --is-ancestor base0001 HEAD": { code: 0, stdout: "", stderr: "" },
    "git merge-base HEAD main": "base0001\n",
    "git rev-list --left-right --count main...HEAD": "0\t0\n",
    "git worktree list --porcelain": `worktree ${repoRoot}
HEAD abc1234def5678
branch refs/heads/codex/workflow-hygiene
`
  });

  const result = await runWorkflowDoctor({
    cwd: repoRoot,
    execFile: exec.execFile,
    readFile: async (target: string) => {
      if (target === statusFile) return createStatusFile({ headCommit: "" });
      if (target === issueFile) return "Status: ready-for-agent\n";
      throw new Error(`Unexpected read: ${target}`);
    },
    fileExists: async (target: string) => target === statusFile || target === issueFile,
    probePort: async (port: number) => ({ port, available: true })
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.exitCode, 2);
  assert.match(result.markdown, /Recorded head commit is missing from STATUS\.md/i);
});
