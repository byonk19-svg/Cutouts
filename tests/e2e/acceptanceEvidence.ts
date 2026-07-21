import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type AcceptanceEvidencePaths = ReturnType<typeof acceptanceEvidencePaths>;

export function acceptanceEvidencePaths() {
  const root = resolve("output/acceptance/authored-line-art");
  const pdfCutlinePagePrefix = resolve(root, "authored-line-art-cutline-page");
  const pdfDetailPagePrefix = resolve(root, "authored-line-art-detail-page");

  return {
    root,
    svgOriginalOn: resolve(root, "svg-original-on.png"),
    svgOriginalOff: resolve(root, "svg-original-off.png"),
    svgEditedOriginalOff: resolve(root, "svg-edited-original-off.png"),
    rasterEditedOriginalOff: resolve(root, "raster-edited-original-off.png"),
    colorReviewOnly: resolve(root, "color-review-only.png"),
    svg: resolve(root, "authored-line-art.svg"),
    pdf: resolve("output/pdf/authored-line-art-acceptance.pdf"),
    pdfCutlinePagePrefix,
    pdfCutlinePage: `${pdfCutlinePagePrefix}.png`,
    pdfDetailPagePrefix,
    pdfDetailPage: `${pdfDetailPagePrefix}.png`,
    manifest: resolve(root, "manifest.json")
  };
}

export function prepareAcceptanceEvidenceDirectory(paths: AcceptanceEvidencePaths) {
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(dirname(paths.pdf), { recursive: true });
  [
    paths.svgOriginalOn,
    paths.svgOriginalOff,
    paths.svgEditedOriginalOff,
    paths.rasterEditedOriginalOff,
    paths.colorReviewOnly,
    paths.svg,
    paths.pdf,
    paths.pdfCutlinePage,
    paths.pdfDetailPage,
    paths.manifest,
    resolve(paths.root, "authored-line-art-trace-page.png")
  ].forEach((artifact) => rmSync(artifact, { force: true }));
}

export function inspectAcceptedLineworkSvg(svg: string) {
  return {
    cutlineLayerCount: svg.match(/id="cutline-layer"/g)?.length ?? 0,
    hasAcceptedDetailLayer: svg.includes('id="accepted-detail-layer"'),
    hasOriginalUnderlay:
      svg.includes('id="reference-layer"') || svg.includes('id="original-underlay"')
  };
}

export function renderPdfPage(pdfPath: string, outputPrefix: string, page: number) {
  const bundledRenderer = process.env.USERPROFILE
    ? join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe"
      )
    : "";
  const renderer = process.env.PDFTOPPM || (existsSync(bundledRenderer) ? bundledRenderer : "pdftoppm");
  execFileSync(renderer, ["-f", String(page), "-l", String(page), "-singlefile", "-png", pdfPath, outputPrefix], {
    stdio: "pipe"
  });
}

export function writeAcceptanceManifest(
  paths: AcceptanceEvidencePaths,
  result: {
    providerRequests: number;
    svgEditedPixels: number;
    rasterEditedPixels: number;
    svgInspection: ReturnType<typeof inspectAcceptedLineworkSvg>;
  }
) {
  const artifact = (path: string) => relative(process.cwd(), path).replaceAll("\\", "/");
  const manifest = {
    schemaVersion: 1,
    ticket: "04-reliable-workflow-acceptance-evidence",
    evidence: {
      authoredSvg: {
        originalOnPreview: artifact(paths.svgOriginalOn),
        originalOffPreview: artifact(paths.svgOriginalOff),
        editedOriginalOffPreview: artifact(paths.svgEditedOriginalOff),
        acceptedLineworkSvg: artifact(paths.svg),
        renderedCutlinePage: artifact(paths.pdfCutlinePage),
        renderedDetailPage: artifact(paths.pdfDetailPage),
        printablePdf: artifact(paths.pdf),
        editedDetailPixelsRemaining: result.svgEditedPixels,
        ...result.svgInspection
      },
      authoredRaster: {
        editedOriginalOffPreview: artifact(paths.rasterEditedOriginalOff),
        editedDetailPixelsRemaining: result.rasterEditedPixels
      },
      colorArtwork: {
        reviewOnlyPreview: artifact(paths.colorReviewOnly),
        acceptedArtifactPreservedAtProposalConsentGate: true
      }
    },
    providerRequests: result.providerRequests,
    protectedGeometry: {
      changedByTicket: false,
      regressionCoverageRequired: [
        "cutline continuity",
        "SVG viewBox",
        "finished size",
        "tiling overlap",
        "calibration square"
      ]
    },
    physicalPrintCheck: {
      status: "ready-for-human",
      instructions: [
        "Print the PDF at 100% or Actual Size with printer scaling disabled.",
        "Measure the calibration square and confirm its labeled dimensions.",
        "Tape tiled pages at their overlap marks and confirm the Cut Line remains continuous.",
        "Confirm the selected interior details are recognizable and useful for transfer."
      ]
    }
  };

  writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
