import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(nodeExecFile);

function normalizePath(value) {
  const normalized = path.normalize(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function trimOutput(value) {
  return value.trim();
}

function parseStatusFile(markdown) {
  const data = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^([^:]+):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    data[match[1].trim()] = match[2].trim();
  }
  return {
    updated: data.Updated ?? "",
    feature: data.Feature ?? "",
    canonicalWorktree: data["Canonical worktree"] ?? "",
    featureBranch: data["Feature branch"] ?? "",
    baseBranch: data["Base branch"] ?? "main",
    baseCommit: data["Base commit"] ?? "",
    headCommit: data["Head commit"] ?? "",
    currentTicket: data["Current ticket"] ?? ""
  };
}

function parseIssueStatus(markdown) {
  const match = /^Status:\s*(.+)$/m.exec(markdown);
  return match ? match[1].trim() : "";
}

function resolveTrackedIssuePath(featureDir, currentTicket) {
  const issuesDir = path.join(featureDir, "issues");
  const normalizedIssuesDir = normalizePath(issuesDir);
  const normalizedTicket = currentTicket.replace(/\//g, path.sep);

  if (!/^issues[\\/]\d{2}-[^\\/]+\.md$/i.test(normalizedTicket)) {
    return {
      valid: false,
      reason: "Active ticket must stay inside `issues/<NN>-*.md` under the feature directory."
    };
  }

  if (path.isAbsolute(normalizedTicket)) {
    return {
      valid: false,
      reason: "Active ticket must stay inside `issues/<NN>-*.md` under the feature directory."
    };
  }

  const resolvedPath = path.resolve(featureDir, normalizedTicket);
  const normalizedResolvedPath = normalizePath(resolvedPath);

  if (
    normalizedResolvedPath !== normalizedIssuesDir &&
    !normalizedResolvedPath.startsWith(`${normalizedIssuesDir}${path.sep}`)
  ) {
    return {
      valid: false,
      reason: "Active ticket must stay inside `issues/<NN>-*.md` under the feature directory."
    };
  }

  return {
    valid: true,
    path: resolvedPath
  };
}

function parseGitStatus(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const fileLines = lines.filter((line) => !line.startsWith("## "));
  return {
    branchHeader: lines.find((line) => line.startsWith("## ")) ?? "",
    dirtyCount: fileLines.filter((line) => !line.startsWith("??")).length,
    untrackedCount: fileLines.filter((line) => line.startsWith("??")).length,
    isClean: fileLines.length === 0,
    raw: lines
  };
}

function parseWorktreePorcelain(stdout) {
  const entries = [];
  let current = null;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = {
        path: line.slice("worktree ".length).trim(),
        head: "",
        branch: null,
        detached: false,
        prunable: null
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      current.branch = ref.replace(/^refs\/heads\//, "");
      continue;
    }

    if (line === "detached") {
      current.detached = true;
      continue;
    }

    if (line.startsWith("prunable ")) {
      current.prunable = line.slice("prunable ".length).trim();
    }
  }

  if (current) entries.push(current);
  return entries;
}

function comparePaths(left, right) {
  return normalizePath(left) === normalizePath(right);
}

function defaultFileExists(target) {
  return fs.access(target).then(
    () => true,
    () => false
  );
}

async function defaultExecFile(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      windowsHide: true
    });
    return { code: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? ""
    };
  }
}

async function defaultProbePort(port) {
  await new Promise((resolve) => setImmediate(resolve));
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        resolve({ port, available: false });
        return;
      }
      resolve({ port, available: false, error: error?.message ?? String(error) });
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve({ port, available: true }));
    });
  });
}

async function git(execFile, cwd, args) {
  const result = await execFile("git", args, { cwd });
  return {
    ...result,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function isSuccess(result) {
  return result.code === 0;
}

function renderIssues(title, issues) {
  if (!issues.length) {
    return [`## ${title}`, "", "- none", ""];
  }

  return [`## ${title}`, "", ...issues.map((issue) => `- ${issue}`), ""];
}

export async function runWorkflowDoctor(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const execFile = options.execFile ?? defaultExecFile;
  const readFile = options.readFile ?? ((target) => fs.readFile(target, "utf8"));
  const fileExists = options.fileExists ?? defaultFileExists;
  const probePort = options.probePort ?? defaultProbePort;
  const featureSlug = options.featureSlug ?? "workflow-hygiene";

  const errors = [];
  const warnings = [];

  const repoRootResult = await git(execFile, cwd, ["rev-parse", "--show-toplevel"]);
  if (repoRootResult.code !== 0) {
    throw new Error(`git rev-parse --show-toplevel failed: ${repoRootResult.stderr || repoRootResult.stdout}`);
  }
  const repoRoot = trimOutput(repoRootResult.stdout);
  const featureDir = path.join(repoRoot, ".scratch", featureSlug);
  const statusFile = path.join(featureDir, "STATUS.md");
  const trackerExists = await fileExists(statusFile);
  let tracker = {
    updated: "",
    feature: featureSlug,
    canonicalWorktree: "",
    featureBranch: "",
    baseBranch: "main",
    baseCommit: "",
    headCommit: "",
    currentTicket: ""
  };

  if (!trackerExists) {
    errors.push(`Missing tracker file: \`${statusFile}\``);
  } else {
    tracker = parseStatusFile(await readFile(statusFile));
  }

  const branchResult = await git(execFile, repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const shortHeadResult = await git(execFile, repoRoot, ["rev-parse", "--short", "HEAD"]);
  const headResult = await git(execFile, repoRoot, ["rev-parse", "HEAD"]);
  const statusResult = await git(execFile, repoRoot, ["status", "--short", "--branch"]);
  const baseBranch = tracker.baseBranch || "main";
  const baseRefResult = await git(execFile, repoRoot, ["rev-parse", baseBranch]);
  const recordedBaseResult = tracker.baseCommit
    ? await git(execFile, repoRoot, ["rev-parse", "--verify", tracker.baseCommit])
    : null;
  const recordedBaseRef = recordedBaseResult && isSuccess(recordedBaseResult) ? trimOutput(recordedBaseResult.stdout) : "";
  const recordedBaseAncestorOfHeadResult = recordedBaseRef
    ? await git(execFile, repoRoot, ["merge-base", "--is-ancestor", recordedBaseRef, "HEAD"])
    : null;
  const mergeBaseResult = await git(execFile, repoRoot, ["merge-base", "HEAD", baseBranch]);
  const aheadBehindResult = await git(execFile, repoRoot, ["rev-list", "--left-right", "--count", `${baseBranch}...HEAD`]);
  const worktreeListResult = await git(execFile, repoRoot, ["worktree", "list", "--porcelain"]);

  const shortHead = trimOutput(shortHeadResult.stdout);
  const fullHead = trimOutput(headResult.stdout);
  const branch = branchResult.code === 0 ? trimOutput(branchResult.stdout) : "";
  const detached = branchResult.code !== 0;
  const gitStatus = parseGitStatus(statusResult.stdout);
  const worktrees = parseWorktreePorcelain(worktreeListResult.stdout);
  const [behindRaw = "0", aheadRaw = "0"] = trimOutput(aheadBehindResult.stdout).split(/\s+/);
  const behindCount = Number.parseInt(behindRaw, 10) || 0;
  const aheadCount = Number.parseInt(aheadRaw, 10) || 0;
  const ports = await Promise.all([probePort(5173), probePort(8787)]);

  if (tracker.canonicalWorktree && !comparePaths(repoRoot, tracker.canonicalWorktree)) {
    errors.push("Current worktree does not match the recorded canonical worktree.");
  }

  if (tracker.featureBranch && branch && branch !== tracker.featureBranch) {
    errors.push(`Current branch \`${branch}\` does not match recorded feature branch \`${tracker.featureBranch}\`.`);
  }

  let issueStatus = "";
  let issuePath = "";
  if (tracker.currentTicket) {
    const resolvedIssue = resolveTrackedIssuePath(featureDir, tracker.currentTicket);
    if (!resolvedIssue.valid) {
      errors.push(resolvedIssue.reason);
    } else {
      issuePath = resolvedIssue.path;
      if (!(await fileExists(issuePath))) {
        errors.push("Active ticket file is missing.");
      } else {
        issueStatus = parseIssueStatus(await readFile(issuePath));
      }
    }
  } else {
    errors.push("Active ticket is not recorded in STATUS.md.");
  }

  if (gitStatus.dirtyCount > 0 || gitStatus.untrackedCount > 0) {
    warnings.push(`Working tree is not clean (dirty: ${gitStatus.dirtyCount}, untracked: ${gitStatus.untrackedCount}).`);
  }

  if (detached) {
    warnings.push(`Repository is on a detached HEAD at \`${shortHead}\`.`);
  }

  if (baseRefResult.code !== 0) {
    errors.push(`Base branch \`${baseBranch}\` is not available locally.`);
  }

  if (!tracker.baseCommit) {
    errors.push("Recorded base commit is missing from STATUS.md.");
  } else {
    if (!recordedBaseResult || recordedBaseResult.code !== 0) {
      errors.push(`Recorded base commit \`${tracker.baseCommit}\` does not resolve in the repository.`);
    } else if (!recordedBaseAncestorOfHeadResult || recordedBaseAncestorOfHeadResult.code === 1) {
      errors.push(`Recorded base commit \`${tracker.baseCommit}\` is not an ancestor of live HEAD \`${fullHead}\`.`);
    } else if (recordedBaseAncestorOfHeadResult.code !== 0) {
      errors.push(`Could not verify whether recorded base commit \`${tracker.baseCommit}\` is an ancestor of HEAD.`);
    } else if (baseRefResult.code === 0) {
      const liveBaseRef = trimOutput(baseRefResult.stdout);
      if (recordedBaseRef !== liveBaseRef) {
        const recordedBaseAncestorOfLiveBaseResult = await git(execFile, repoRoot, [
          "merge-base",
          "--is-ancestor",
          recordedBaseRef,
          liveBaseRef
        ]);

        if (recordedBaseAncestorOfLiveBaseResult.code === 0) {
          warnings.push(
            `Base branch \`${baseBranch}\` has advanced beyond recorded base \`${tracker.baseCommit}\` to \`${liveBaseRef}\`.`
          );
        } else if (recordedBaseAncestorOfLiveBaseResult.code === 1) {
          const liveBaseAncestorOfRecordedBaseResult = await git(execFile, repoRoot, [
            "merge-base",
            "--is-ancestor",
            liveBaseRef,
            recordedBaseRef
          ]);

          if (liveBaseAncestorOfRecordedBaseResult.code === 0) {
            warnings.push(
              `Base branch \`${baseBranch}\` is behind recorded base \`${tracker.baseCommit}\`; live ref is \`${liveBaseRef}\`.`
            );
          } else if (liveBaseAncestorOfRecordedBaseResult.code === 1) {
            warnings.push(
              `Base branch \`${baseBranch}\` diverges from recorded base \`${tracker.baseCommit}\`; live ref is \`${liveBaseRef}\`.`
            );
          } else {
            errors.push(
              `Could not compare live base branch \`${baseBranch}\` against recorded base \`${tracker.baseCommit}\`.`
            );
          }
        } else {
          errors.push(`Could not compare recorded base \`${tracker.baseCommit}\` against live base branch \`${baseBranch}\`.`);
        }
      }
    }
  }

  if (mergeBaseResult.code !== 0) {
    errors.push(`Could not compute merge-base between HEAD and \`${baseBranch}\`.`);
  }

  if (aheadBehindResult.code !== 0) {
    errors.push(`Could not compute ahead/behind counts against \`${baseBranch}\`.`);
  }

  if (!tracker.headCommit) {
    errors.push("Recorded head commit is missing from STATUS.md.");
  } else if (tracker.headCommit !== fullHead) {
    const recordedHeadResult = await git(execFile, repoRoot, ["rev-parse", "--verify", tracker.headCommit]);
    if (recordedHeadResult.code !== 0) {
      errors.push(`Recorded head commit \`${tracker.headCommit}\` does not resolve in the repository.`);
    } else {
      const recordedHeadRef = trimOutput(recordedHeadResult.stdout);
      const recordedHeadAncestorResult = await git(execFile, repoRoot, [
        "merge-base",
        "--is-ancestor",
        recordedHeadRef,
        "HEAD"
      ]);

      if (recordedHeadAncestorResult.code === 0) {
        warnings.push(`Live HEAD \`${fullHead}\` has advanced beyond recorded head \`${tracker.headCommit}\`.`);
      } else if (recordedHeadAncestorResult.code === 1) {
        errors.push(`Recorded head commit \`${tracker.headCommit}\` is not an ancestor of live HEAD \`${fullHead}\`.`);
      } else {
        errors.push(`Could not verify whether recorded head commit \`${tracker.headCommit}\` is an ancestor of HEAD.`);
      }
    }
  }

  const duplicateFeatureWorktrees = tracker.featureBranch
    ? worktrees.filter(
        (worktree) =>
          worktree.branch === tracker.featureBranch &&
          !comparePaths(worktree.path, repoRoot)
      )
    : [];

  const unexplainedFeatureWorktrees = worktrees.filter((worktree) => {
    if (comparePaths(worktree.path, repoRoot)) return false;
    if (worktree.branch === baseBranch) return false;
    if (tracker.featureBranch && worktree.branch === tracker.featureBranch) return false;
    return Boolean(worktree.branch) || worktree.detached;
  });

  if (duplicateFeatureWorktrees.length) {
    warnings.push(
      `Found duplicate feature worktree entries for \`${tracker.featureBranch}\`: ${duplicateFeatureWorktrees
        .map((worktree) => `\`${worktree.path}\``)
        .join(", ")}.`
    );
  }

  if (unexplainedFeatureWorktrees.length) {
    warnings.push(
      `Found unexplained feature worktrees outside the canonical ticket lane: ${unexplainedFeatureWorktrees
        .map((worktree) => `\`${worktree.path}\``)
        .join(", ")}.`
    );
  }

  for (const portStatus of ports) {
    if (!portStatus.available) {
      warnings.push(`Expected workflow port \`${portStatus.port}\` is busy.`);
    }
  }

  const cleanupCandidates = worktrees
    .filter((worktree) => worktree.prunable || duplicateFeatureWorktrees.includes(worktree))
    .map((worktree) => {
      if (worktree.prunable) {
        return `\`${worktree.path}\` (${worktree.prunable})`;
      }
      return `\`${worktree.path}\` (duplicate feature worktree)`;
    });

  const status = errors.length ? "invalid" : warnings.length ? "warning" : "healthy";
  const exitCode = errors.length ? 2 : warnings.length ? 1 : 0;
  const branchLine = detached
    ? `Detached HEAD: \`${shortHead}\``
    : `Branch: \`${branch}\` at \`${shortHead}\``;
  const workingTreeLine = gitStatus.isClean
    ? "Working tree: clean"
    : `Working tree: dirty: ${gitStatus.dirtyCount}, untracked: ${gitStatus.untrackedCount}`;
  const baseHeadLine =
    baseRefResult.code === 0 && mergeBaseResult.code === 0 && aheadBehindResult.code === 0
      ? `Base/head relationship: \`${baseBranch}\` at \`${trimOutput(baseRefResult.stdout)}\`, merge-base \`${trimOutput(
          mergeBaseResult.stdout
        )}\`, behind ${behindCount}, ahead ${aheadCount}`
      : `Base/head relationship: could not be computed for \`${baseBranch}\``;
  const portLine = `Ports: \`5173\` ${ports[0]?.available ? "available" : "busy"}, \`8787\` ${
    ports[1]?.available ? "available" : "busy"
  }`;
  const duplicateLine = duplicateFeatureWorktrees.length
    ? duplicateFeatureWorktrees.map((worktree) => `\`${worktree.path}\``).join(", ")
    : "none";
  const unexplainedLine = unexplainedFeatureWorktrees.length
    ? unexplainedFeatureWorktrees.map((worktree) => `\`${worktree.path}\``).join(", ")
    : "none";
  const cleanupLine = cleanupCandidates.length ? cleanupCandidates.join(", ") : "none";

  const markdownLines = [
    "# Workflow Doctor",
    "",
    `Status: \`${status}\``,
    "",
    "## Summary",
    "",
    `- Current worktree: \`${repoRoot}\``,
    `- ${branchLine}`,
    `- Commit: \`${fullHead}\``,
    `- ${workingTreeLine}`,
    `- Recorded canonical worktree: \`${tracker.canonicalWorktree || "missing"}\``,
    `- Active ticket: \`${tracker.currentTicket || "missing"}\`${issueStatus ? ` (${issueStatus})` : ""}`,
    `- ${baseHeadLine}`,
    `- Duplicate feature worktrees: ${duplicateLine}`,
    `- Unexplained feature worktrees: ${unexplainedLine}`,
    `- ${portLine}`,
    `- Cleanup candidates: ${cleanupLine}`,
    "",
    ...renderIssues("Warnings", warnings),
    ...renderIssues("Errors", errors)
  ];

  return {
    status,
    exitCode,
    markdown: markdownLines.join("\n").trimEnd() + "\n",
    warnings,
    errors,
    report: {
      repoRoot,
      shortHead,
      fullHead,
      branch,
      detached,
      tracker,
      issuePath,
      issueStatus,
      gitStatus,
      worktrees,
      duplicateFeatureWorktrees,
      unexplainedFeatureWorktrees,
      cleanupCandidates,
      ports,
      baseBranch,
      behindCount,
      aheadCount
    }
  };
}

async function main() {
  const result = await runWorkflowDoctor();
  process.stdout.write(result.markdown);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  });
}
