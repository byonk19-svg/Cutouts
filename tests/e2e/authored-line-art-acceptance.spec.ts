import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  acceptanceEvidencePaths,
  prepareAcceptanceEvidenceDirectory,
  renderPdfPage,
  inspectAcceptedLineworkSvg,
  writeAcceptanceManifest
} from "./acceptanceEvidence.ts";

test("captures repeatable authored-line-art and review-only acceptance evidence", async ({ page }) => {
  test.setTimeout(180_000);
  const evidence = acceptanceEvidencePaths();
  prepareAcceptanceEvidenceDirectory(evidence);
  let providerRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-linework")) providerRequests += 1;
  });

  await openEmptyProject(page);
  await page.getByLabel("Source image").setInputFiles({
    name: "authored-acceptance.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(authoredSvgFixture())
  });
  await page.getByRole("button", { name: "Generate Template" }).click();
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art");
  const svgWorkspace = page.getByLabel("Clean Lines workspace");
  const svgDetailCanvas = page.getByLabel("Editable interior detail lines");
  await expect(page.getByLabel("Original underlay guide")).toContainText("visible");
  await svgWorkspace.screenshot({ path: evidence.svgOriginalOn });
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Show Original" }).click();
  await expect(page.getByLabel("Original underlay guide")).toContainText("hidden");
  await svgWorkspace.screenshot({ path: evidence.svgOriginalOff });

  const svgDetailBefore = await svgDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const svgInkPoint = await waitForCanvasInkPoint(svgDetailCanvas);
  await svgDetailCanvas.click({ position: await canvasLocalPoint(svgDetailCanvas, svgInkPoint.x, svgInkPoint.y) });
  await expect.poll(() => svgDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(svgDetailBefore);
  const svgEditedPixels = await canvasVisiblePixelCount(svgDetailCanvas);
  expect(svgEditedPixels).toBeGreaterThan(0);
  await svgWorkspace.screenshot({ path: evidence.svgEditedOriginalOff });
  await advanceToExport(page);

  const exportWorkspace = page.getByLabel("Export workspace");
  const includeCover = exportWorkspace.getByLabel("Include cover page");
  if (await includeCover.isChecked()) await includeCover.uncheck();
  const pdfDownload = await downloadFrom(page, "Download Printable PDF");
  await pdfDownload.saveAs(evidence.pdf);
  const moreExportOptions = exportWorkspace.getByLabel("More Export Options");
  await moreExportOptions.locator("summary").click();
  const svgDownload = await downloadFrom(page, "Download SVG Linework");
  await svgDownload.saveAs(evidence.svg);
  const svgInspection = inspectAcceptedLineworkSvg(readFileSync(evidence.svg, "utf-8"));
  expect(svgInspection.cutlineLayerCount).toBe(1);
  expect(svgInspection.hasAcceptedDetailLayer).toBe(true);
  expect(svgInspection.hasOriginalUnderlay).toBe(false);
  renderPdfPage(evidence.pdf, evidence.pdfCutlinePagePrefix, 1);
  renderPdfPage(evidence.pdf, evidence.pdfDetailPagePrefix, 5);

  await openEmptyProject(page);
  await page.getByLabel("Source image").setInputFiles({
    name: "authored-raster-acceptance.png",
    mimeType: "image/png",
    buffer: readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png")
  });
  await page.getByRole("button", { name: "Generate Template" }).click();
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art");
  const rasterWorkspace = page.getByLabel("Clean Lines workspace");
  const rasterDetailCanvas = page.getByLabel("Editable interior detail lines");
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Show Original" }).click();
  await expect(page.getByLabel("Original underlay guide")).toContainText("hidden");
  const rasterDetailBefore = await rasterDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const rasterInkPoint = await waitForCanvasInkPoint(rasterDetailCanvas);
  await rasterDetailCanvas.click({ position: await canvasLocalPoint(rasterDetailCanvas, rasterInkPoint.x, rasterInkPoint.y) });
  await expect.poll(() => rasterDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(rasterDetailBefore);
  const rasterEditedPixels = await canvasVisiblePixelCount(rasterDetailCanvas);
  expect(rasterEditedPixels).toBeGreaterThan(0);
  await rasterWorkspace.screenshot({ path: evidence.rasterEditedOriginalOff });
  await advanceToExport(page);
  await expect(page.getByLabel("Export workspace")).toContainText("Print at 100%");

  const colorArtwork = await rasterizeColorArtwork(page);
  await openEmptyProject(page);
  await page.getByLabel("Source image").setInputFiles({
    name: "color-review-only-acceptance.png",
    mimeType: "image/png",
    buffer: colorArtwork
  });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  const colorDetailCanvas = page.getByLabel("Editable interior detail lines");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const readiness = page.getByLabel("Input readiness");
  await expect(readiness).toContainText("Needs simplification");
  await expect(readiness).toContainText("review-only");
  await expect(readiness).toContainText("cannot replace accepted Detail Lines unless you explicitly review and accept it");
  const acceptedColorDetail = await colorDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Simplify for wood template" }).click();
  await expect(proposalCard).toContainText("Your cropped source preview will be uploaded to OpenAI");
  await expect(proposalCard).toContainText("Exact estimated cost: $0.10");
  expect(providerRequests).toBe(0);
  await expect.poll(() => colorDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(acceptedColorDetail);
  await proposalCard.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Clean Lines workspace").screenshot({ path: evidence.colorReviewOnly });
  await expect.poll(() => colorDetailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(acceptedColorDetail);
  expect(providerRequests).toBe(0);

  writeAcceptanceManifest(evidence, {
    providerRequests,
    svgEditedPixels,
    rasterEditedPixels,
    svgInspection
  });
});

async function openEmptyProject(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Upload step")).toBeVisible();
}

async function advanceToExport(page: Page) {
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await page.getByLabel("Colors workspace").getByRole("button", { name: "Skip Paint Guide" }).click();
  await expect(page.getByLabel("Export workspace")).toBeVisible();
}

async function downloadFrom(page: Page, buttonName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(buttonName) }).click();
  return downloadPromise;
}

async function waitForCanvasInkPoint(canvas: Locator) {
  await expect.poll(async () => (await findCanvasInkPoint(canvas)) !== null).toBe(true);
  const point = await findCanvasInkPoint(canvas);
  if (!point) throw new Error("Detail canvas did not contain a removable line.");
  return point;
}

async function findCanvasInkPoint(canvas: Locator) {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) return null;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    for (let y = 0; y < target.height; y += 1) {
      for (let x = 0; x < target.width; x += 1) {
        const index = (y * target.width + x) * 4;
        if (pixels[index + 3] > 16 && pixels[index] < 240 && pixels[index + 1] < 240 && pixels[index + 2] < 240) {
          return { x: x / target.width, y: y / target.height };
        }
      }
    }
    return null;
  });
}

async function canvasLocalPoint(canvas: Locator, xFraction: number, yFraction: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas was not visible.");
  return { x: box.width * xFraction, y: box.height * yFraction };
}

async function canvasVisiblePixelCount(canvas: Locator) {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) count += 1;
    }
    return count;
  });
}

function authoredSvgFixture() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <rect width="400" height="600" fill="white"/>
      <path d="M120 560 L100 420 L130 250 Q200 150 270 250 L300 420 L280 560 Z" fill="#eaa0a0"/>
      <circle cx="165" cy="300" r="18" fill="none" stroke="#111" stroke-width="8"/>
      <circle cx="235" cy="300" r="18" fill="none" stroke="#111" stroke-width="8"/>
      <path d="M150 350 Q200 380 250 350" fill="none" stroke="#111" stroke-width="8"/>
      <path d="M200 395 L200 500 M140 500 L260 500" fill="none" stroke="#111" stroke-width="8"/>
    </svg>
  `;
}

async function rasterizeColorArtwork(page: Page) {
  await page.setContent(authoredSvgFixture());
  return page.locator("svg").screenshot({ type: "png" });
}
