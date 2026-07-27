import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export type MaxAcceptanceEvidencePaths = ReturnType<typeof maxAcceptanceEvidencePaths>;
export type StepStateSnapshot = {
  schemaVersion: 1;
  step: "Upload" | "Clean Lines" | "Colors" | "Export";
  visibleLabel: string;
  primaryAction: string;
  inputReadiness?: string;
  outputs?: Array<{
    kind: "svg" | "pdf";
    path: string;
    sha256: string;
    bytes: number;
  }>;
};
export type WorkflowEvidenceEvent =
  | {
    kind: "step-visible";
    step: "Upload" | "Clean Lines" | "Colors" | "Export";
    evidence: {
      screenshotPath: string;
      screenshotSha256: string;
      statePath: string;
      stateSha256: string;
    };
  }
  | {
    kind: "cleanup-action";
    action: "remove-line" | "add-missing-line";
    evidence: {
      screenshotPath: string;
      screenshotSha256: string;
      statePath: string;
      stateSha256: string;
    };
  }
  | {
    kind: "provider-log";
    evidence: {
      logPath: string;
      logSha256: string;
    };
  };

export type MaxCharacterAcceptanceResult = {
  profileVersion: number;
  validatorVersion: string;
  fixtureId: string;
  artifactSetId: string;
  sourceIdentity: { status: "passed" | "failed" | "errored"; message: string };
  baseline: Array<{ id: string; label: string; status: "passed" | "failed" | "errored"; message: string }>;
  workflowChecks: Array<{ id: string; label: string; status: "passed" | "failed" | "errored"; message: string }>;
  assertions: Array<{
    id: string;
    label: string;
    status: "passed" | "failed" | "errored";
    message: string;
    featureId: string;
    featureLabel: string;
    region: { x: number; y: number; width: number; height: number };
  }>;
  observations: {
    svgInspection: {
      cutlineLayerCount: number;
      acceptedDetailLayerCount: number;
      hasViewBox: boolean;
      hasOriginalUnderlay: boolean;
      hasTransientEditorState: boolean;
    } | null;
    pdfInspection: {
      pageCount: number;
      tracePageCount: number;
      tileGrid: { columns: number; rows: number };
      traceImageCounts: number[];
      allTracePagesSingleRaster: boolean;
      allTracePagesLetter: boolean;
      allEmbeddedTraceImagesMonochrome: boolean;
      calibrationSquarePoints: number | null;
      allOverlapsMatch: boolean;
      renderedTracePageCountMatches: boolean;
      renderedTracePagesMonochrome: boolean;
      forbiddenMarkers: string[];
    } | null;
  };
  overallStatus: "passed" | "failed" | "errored";
};

export function maxAcceptanceEvidencePaths() {
  const root = resolve("output/acceptance/max-template-packet");
  return {
    root,
    upload: resolve(root, "01-upload.png"),
    cleanLines: resolve(root, "02-clean-lines-original-hidden.png"),
    colors: resolve(root, "03-colors.png"),
    export: resolve(root, "04-export.png"),
    uploadState: resolve(root, "01-upload-state.json"),
    cleanLinesState: resolve(root, "02-clean-lines-state.json"),
    colorsState: resolve(root, "03-colors-state.json"),
    exportState: resolve(root, "04-export-state.json"),
    providerLog: resolve(root, "workflow-provider-log.json"),
    overlay: resolve(root, "character-acceptance-overlay.png"),
    artifactSet: resolve(root, "character-acceptance-artifact-set.json"),
    result: resolve(root, "character-acceptance-result.json"),
    renderedPagePrefix: resolve(root, "pdf-page"),
    svg: resolve(root, "max-template-linework.svg"),
    pdf: resolve("output/pdf/max-template-packet.pdf"),
  };
}

export function prepareMaxAcceptanceEvidence(paths: MaxAcceptanceEvidencePaths) {
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(dirname(paths.pdf), { recursive: true });
  for (const artifact of [
    paths.upload,
    paths.cleanLines,
    paths.colors,
    paths.export,
    paths.uploadState,
    paths.cleanLinesState,
    paths.colorsState,
    paths.exportState,
    paths.providerLog,
    paths.overlay,
    paths.artifactSet,
    paths.result,
    paths.svg,
    paths.pdf,
  ]) {
    rmSync(artifact, { force: true });
  }
  clearRenderedMaxPdfPages(paths);
}

export function renderedMaxPdfPagePath(
  paths: MaxAcceptanceEvidencePaths,
  page: number,
  pageCount: number,
) {
  const width = String(pageCount).length;
  return `${paths.renderedPagePrefix}-${String(page).padStart(width, "0")}.png`;
}

export function writeMaxAcceptanceArtifactSet(
  paths: MaxAcceptanceEvidencePaths,
  result: {
    workflowEvents: WorkflowEvidenceEvent[];
    renderedTracePages: string[];
  },
) {
  const payload = {
    schemaVersion: 1,
    artifactSetId: "max-template-packet",
    sourceImage: resolve("backend/tests/fixtures/max/Max-from-the-Grinch-movie.webp"),
    svg: paths.svg,
    pdf: paths.pdf,
    renderedTracePages: result.renderedTracePages,
    workflowEvidence: {
      events: result.workflowEvents,
    },
  };
  writeFileSync(paths.artifactSet, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function writeStepStateSnapshot(path: string, snapshot: StepStateSnapshot) {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
}

export function writeProviderRequestLog(path: string, requests: Array<{ url: string; method: string }>) {
  writeFileSync(path, `${JSON.stringify({ schemaVersion: 1, requests }, null, 2)}\n`, "utf-8");
}

export function bindStepWorkflowEvent(
  step: "Upload" | "Clean Lines" | "Colors" | "Export",
  screenshotPath: string,
  statePath: string,
): WorkflowEvidenceEvent {
  return {
    kind: "step-visible",
    step,
    evidence: {
      screenshotPath,
      screenshotSha256: sha256File(screenshotPath),
      statePath,
      stateSha256: sha256File(statePath),
    },
  };
}

export function bindProviderLogWorkflowEvent(logPath: string): WorkflowEvidenceEvent {
  return {
    kind: "provider-log",
    evidence: {
      logPath,
      logSha256: sha256File(logPath),
    },
  };
}

export function exportArtifactDescriptor(kind: "svg" | "pdf", path: string) {
  const bytes = readFileSync(path);
  return {
    kind,
    path,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    bytes: bytes.length,
  };
}

export function runMaxCharacterAcceptance(paths: MaxAcceptanceEvidencePaths) {
  const profile = resolve("backend/tests/fixtures/max/character-acceptance-profile.v1.json");
  const stdout = execFileSync(
    "python",
    [
      "-m",
      "backend.tests.character_acceptance",
      profile,
      paths.artifactSet,
      "--result",
      paths.result,
      "--overlay",
      paths.overlay,
    ],
    { encoding: "utf-8" },
  );
  return {
    stdout,
    result: JSON.parse(readFileSync(paths.result, "utf-8")) as MaxCharacterAcceptanceResult,
  };
}

export function renderMaxPdfPages(paths: MaxAcceptanceEvidencePaths) {
  const bundledRenderer = process.env.USERPROFILE
    ? join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe",
      )
    : "";
  const renderer = process.env.PDFTOPPM || (existsSync(bundledRenderer) ? bundledRenderer : "pdftoppm");
  execFileSync(
    renderer,
    ["-png", "-r", "96", paths.pdf, paths.renderedPagePrefix],
    { stdio: "pipe" },
  );
  const prefix = `${basename(paths.renderedPagePrefix)}-`;
  return readdirSync(dirname(paths.renderedPagePrefix))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => resolve(dirname(paths.renderedPagePrefix), name));
}

function clearRenderedMaxPdfPages(paths: MaxAcceptanceEvidencePaths) {
  const directory = dirname(paths.renderedPagePrefix);
  const prefix = `${basename(paths.renderedPagePrefix)}-`;
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    if (name.startsWith(prefix) && name.endsWith(".png")) {
      rmSync(resolve(directory, name), { force: true });
    }
  }
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}
