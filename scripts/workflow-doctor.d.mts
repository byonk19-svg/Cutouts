type WorkflowDoctorStatus = "healthy" | "warning" | "invalid";

type ExecResult = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

export function runWorkflowDoctor(options: {
  cwd: string;
  execFile: (file: string, args: string[]) => Promise<ExecResult>;
  readFile: (target: string) => Promise<string>;
  fileExists: (target: string) => Promise<boolean>;
  probePort: (port: number) => Promise<{ port: number; available: boolean }>;
}): Promise<{
  status: WorkflowDoctorStatus;
  exitCode: number;
  markdown: string;
  warnings: string[];
  errors: string[];
}>;
