type DirectoryEntry = {
  name: string;
  isFile(): boolean;
};

type RunNodeTypeScriptTestResult = {
  exitCode: number;
  signal: string | null;
};

export function discoverTypeScriptTests(options?: {
  cwd?: string;
  readdirImpl?: (path: string, options: { withFileTypes: true }) => Promise<readonly DirectoryEntry[]>;
}): Promise<string[]>;

export function logDiscoveredTypeScriptTests(
  testFiles: readonly string[],
  options?: { log?: (line: string) => void }
): void;

export function runNodeTypeScriptTest(
  testFile: string,
  options?: {
    cwd?: string;
    nodeExecutable?: string;
    spawnImpl?: unknown;
  }
): Promise<RunNodeTypeScriptTestResult>;

export function runDiscoveredTypeScriptTests(
  testFiles: readonly string[],
  options?: {
    cwd?: string;
    log?: (line: string) => void;
    runTestImpl?: (
      testFile: string,
      options: { cwd?: string; nodeExecutable?: string; spawnImpl?: unknown }
    ) => Promise<RunNodeTypeScriptTestResult>;
    nodeExecutable?: string;
    spawnImpl?: unknown;
  }
): Promise<number>;

export function main(): Promise<void>;
