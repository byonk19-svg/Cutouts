import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareMaxAcceptanceEvidence } from "./e2e/maxAcceptanceEvidence.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

{
  const root = mkdtempSync(join(tmpdir(), "max-acceptance-evidence-"));
  const outputRoot = join(root, "output", "acceptance", "max-template-packet");
  const pdfRoot = join(root, "output", "pdf");
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(pdfRoot, { recursive: true });
  const stalePage = join(outputRoot, "pdf-page-011.png");
  const currentPage = join(outputRoot, "pdf-page-003.png");
  writeFileSync(stalePage, "stale", "utf-8");
  writeFileSync(currentPage, "current", "utf-8");

  const cwdBefore = process.cwd();
  process.chdir(root);
  try {
    const paths = {
      root: resolve("output/acceptance/max-template-packet"),
      upload: resolve("output/acceptance/max-template-packet/01-upload.png"),
      cleanLines: resolve("output/acceptance/max-template-packet/02-clean-lines-original-hidden.png"),
      colors: resolve("output/acceptance/max-template-packet/03-colors.png"),
      export: resolve("output/acceptance/max-template-packet/04-export.png"),
      uploadState: resolve("output/acceptance/max-template-packet/01-upload-state.json"),
      cleanLinesState: resolve("output/acceptance/max-template-packet/02-clean-lines-state.json"),
      colorsState: resolve("output/acceptance/max-template-packet/03-colors-state.json"),
      exportState: resolve("output/acceptance/max-template-packet/04-export-state.json"),
      providerLog: resolve("output/acceptance/max-template-packet/workflow-provider-log.json"),
      overlay: resolve("output/acceptance/max-template-packet/character-acceptance-overlay.png"),
      artifactSet: resolve("output/acceptance/max-template-packet/character-acceptance-artifact-set.json"),
      result: resolve("output/acceptance/max-template-packet/character-acceptance-result.json"),
      renderedPagePrefix: resolve("output/acceptance/max-template-packet/pdf-page"),
      svg: resolve("output/acceptance/max-template-packet/max-template-linework.svg"),
      pdf: resolve("output/pdf/max-template-packet.pdf"),
    };

    prepareMaxAcceptanceEvidence(paths);

    assert(!existsSync(stalePage), "prepareMaxAcceptanceEvidence should remove stale rendered pages beyond page 10");
    assert(!existsSync(currentPage), "prepareMaxAcceptanceEvidence should remove current rendered pages before rerender");
  } finally {
    process.chdir(cwdBefore);
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("max acceptance evidence tests passed");
