import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizedArgs(argv) {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

export function runPlaywrightArgs(argv = process.argv.slice(2)) {
  return [
    "playwright",
    "test",
    "--config",
    "tests/e2e/playwright.config.ts",
    ...normalizedArgs(argv)
  ];
}

function quoteWindowsCommandToken(token) {
  if (!/^[A-Za-z0-9_./:=+-]+$/.test(token)) {
    throw new Error(`Unsupported Windows command token: ${token}`);
  }
  return token;
}

function resolvePlaywrightInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const spawnOptions = {
    stdio: "inherit",
    shell: false,
    windowsHide: true
  };

  if (platform === "win32") {
    const comSpec = env.ComSpec || path.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
    const commandLine = ["pnpm", "exec", ...args].map(quoteWindowsCommandToken).join(" ");
    return {
      command: comSpec,
      args: ["/d", "/s", "/c", commandLine],
      options: spawnOptions
    };
  }

  return {
    command: "pnpm",
    args: ["exec", ...args],
    options: spawnOptions
  };
}

export async function runPlaywright(argv = process.argv.slice(2)) {
  const args = runPlaywrightArgs(argv);
  const invocation = resolvePlaywrightInvocation(args);
  return await new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, invocation.options);

    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runPlaywright();
  process.exitCode = exitCode;
}
