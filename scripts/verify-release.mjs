import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { runWorkflowDoctor } from "./workflow-doctor.mjs";

function quoteWindowsCommandToken(token) {
  if (!/^[A-Za-z0-9_./:=+-]+$/.test(token)) {
    throw new Error(`Unsupported Windows command token: ${token}`);
  }
  return token;
}

export function resolveCommandInvocation(command, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const spawnOptions = {
    cwd: options.cwd,
    windowsHide: true,
    shell: false
  };

  // `verify-release` builds a fixed set of internal commands. On Windows,
  // `pnpm` is a cmd shim, so route only that case through `cmd.exe` with an
  // explicit fixed command line while keeping `cwd` in spawn options.
  if (platform === "win32" && command === "pnpm") {
    const comSpec = env.ComSpec || path.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
    const commandLine = [command, ...args].map(quoteWindowsCommandToken).join(" ");
    return {
      command: comSpec,
      args: ["/d", "/s", "/c", commandLine],
      options: spawnOptions
    };
  }

  return {
    command,
    args,
    options: spawnOptions
  };
}

export async function defaultRunCommand(command, args, options = {}) {
  const invocation = resolveCommandInvocation(command, args, options);

  return await new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, invocation.options);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      resolve({
        code: 1,
        stdout,
        stderr: stderr || error.message || String(error)
      });
    });

    child.on("close", (code) => {
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout,
        stderr
      });
    });
  });
}

function formatTimestamp(value) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function trimOutput(value) {
  return value.trim();
}

function formatCommandStatus(check) {
  const status = check.code === 0 ? "passed" : "failed";
  const detail = trimOutput(`${check.stdout || ""}\n${check.stderr || ""}`.trim());
  return [`- \`${check.label}\` | \`${status}\`${detail ? ` | ${detail.replace(/\r?\n/g, " ")}` : ""}`];
}

export async function runVerifyRelease(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const runDoctor = options.runDoctor ?? (() => runWorkflowDoctor({ cwd }));
  const runCommand = options.runCommand ?? defaultRunCommand;
  const ensureDir = options.ensureDir ?? ((target) => fs.mkdir(target, { recursive: true }));
  const writeFile = options.writeFile ?? ((target, content) => fs.writeFile(target, content, "utf8"));
  const now = options.now ?? (() => new Date());
  const generatedAt = now();

  const doctor = await runDoctor();
  const checks = [];

  if (doctor.exitCode < 2) {
    checks.push({
      label: "pnpm verify:ci",
      ...(await runCommand("pnpm", ["verify:ci"], { cwd }))
    });
    checks.push({
      label: "pnpm test:e2e -- --workers=1",
      ...(await runCommand("pnpm", ["test:e2e", "--", "--workers=1"], { cwd }))
    });
    checks.push({
      label: "git diff --check",
      ...(await runCommand("git", ["diff", "--check"], { cwd }))
    });
  }

  const headResult = await runCommand("git", ["rev-parse", "HEAD"], { cwd });
  const commit = trimOutput(headResult.stdout);
  const timestamp = formatTimestamp(generatedAt);
  const evidenceDir = path.join(cwd, ".scratch", "workflow-hygiene", "evidence");
  const evidencePath = path.join(evidenceDir, `verify-release-${timestamp}.md`);

  const failingChecks = checks.filter((check) => check.code !== 0);
  const exitCode = doctor.exitCode !== 0 ? doctor.exitCode : failingChecks.length ? 1 : 0;
  const createSummary = (finalTreeState) => {
    const summaryLines = [
      "# Release Verification Evidence",
      "",
      `Generated: ${generatedAt.toISOString()}`,
      `Commit: \`${commit}\``,
      `Doctor status: \`${doctor.status}\``,
      "",
      "## Workflow Doctor",
      "",
      doctor.markdown.trim(),
      "",
      "## Required Checks",
      ""
    ];

    if (checks.length === 0) {
      summaryLines.push(
        "- Required release checks were not run because the workflow doctor found invalid state.",
        ""
      );
    } else {
      summaryLines.push(...checks.flatMap((check) => [...formatCommandStatus(check)]), "");
    }

    summaryLines.push("## Final working tree state", "", "```text", finalTreeState, "```", "");

    if (exitCode !== 0) {
      summaryLines.push("## Result", "", "- Release verification failed.", "");
    } else {
      summaryLines.push("## Result", "", "- Release verification passed.", "");
    }

    return summaryLines.join("\n").trimEnd() + "\n";
  };

  await ensureDir(evidenceDir);
  await writeFile(evidencePath, createSummary("Evidence file created; final status pending."));
  const statusResult = await runCommand("git", ["status", "--short", "--branch"], { cwd });
  const finalTreeState = trimOutput(statusResult.stdout) || "clean";
  const markdown = createSummary(finalTreeState);
  await writeFile(evidencePath, markdown);

  return {
    exitCode,
    evidencePath,
    markdown,
    doctor,
    checks,
    commit,
    finalTreeState
  };
}

async function main() {
  const result = await runVerifyRelease();
  process.stdout.write(result.markdown);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
