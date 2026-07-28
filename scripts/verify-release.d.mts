type DoctorResult = {
  status: "healthy" | "warning" | "invalid";
  exitCode: number;
  markdown: string;
  warnings: readonly string[];
  errors: readonly string[];
};

type CommandResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

type VerifyCheck = CommandResult & {
  label: string;
};

export function resolveCommandInvocation(
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: Record<string, string | undefined>;
    platform: string;
  }
): {
  command: string;
  args: string[];
  options: {
    cwd: string;
    shell: false;
    windowsHide: boolean;
  };
};

export function runVerifyRelease(options: {
  cwd: string;
  runDoctor: () => Promise<DoctorResult>;
  runCommand: (command: string, args: string[]) => Promise<CommandResult>;
  ensureDir: (target: string) => Promise<void>;
  writeFile: (target: string, content: string) => Promise<void>;
  now: () => Date;
}): Promise<{
  exitCode: number;
  evidencePath: string;
  markdown: string;
  doctor: DoctorResult;
  checks: VerifyCheck[];
  commit: string;
  finalTreeState: string;
}>;
