import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import {
  bindProviderLogWorkflowEvent,
  bindStepWorkflowEvent,
  exportArtifactDescriptor,
  maxAcceptanceEvidencePaths,
  prepareMaxAcceptanceEvidence,
  renderMaxPdfPages,
  runMaxCharacterAcceptance,
  type StepStateSnapshot,
  type WorkflowEvidenceEvent,
  writeProviderRequestLog,
  writeMaxAcceptanceArtifactSet,
  writeStepStateSnapshot,
} from "./maxAcceptanceEvidence.ts";

const maxSource = readFileSync("backend/tests/fixtures/max/Max-from-the-Grinch-movie.webp");

test("captures the complete 24-inch Max template packet workflow", async ({ page }) => {
  test.setTimeout(300_000);
  const evidence = maxAcceptanceEvidencePaths();
  prepareMaxAcceptanceEvidence(evidence);
  const workflowEvents: WorkflowEvidenceEvent[] = [];
  const observedRequests: Array<{ url: string; method: string }> = [];
  page.on("request", (request) => {
    observedRequests.push({ url: request.url(), method: request.method() });
  });

  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");

  const uploadStep = page.getByLabel("Upload step");
  await expect(uploadStep).toBeVisible();
  const sourceInput = page.getByLabel("Source image");
  await expect(sourceInput).toHaveAttribute("accept", /image\/webp/);
  await sourceInput.setInputFiles({
    name: "Max-from-the-Grinch-movie.webp",
    mimeType: "image/webp",
    buffer: maxSource,
  });
  await page.getByLabel("Finished height").fill("24");
  await page.getByLabel("Trace page layout").selectOption("reference-2x4");
  await page.getByLabel("Project name (optional)").fill("Max 24-inch Template");
  await uploadStep.screenshot({ path: evidence.upload });
  writeStepStateSnapshot(evidence.uploadState, await uploadStepState(page));
  workflowEvents.push(bindStepWorkflowEvent("Upload", evidence.upload, evidence.uploadState));
  await page.getByRole("button", { name: "Generate Template" }).click();

  const cleanWorkspace = page.getByLabel("Clean Lines workspace");
  await expect(cleanWorkspace).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Clean Lines status")).toContainText("2 x 4");
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art", { timeout: 60_000 });
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Show Original" }).click();
  await expect(page.getByLabel("Original underlay guide")).toContainText("hidden");
  await cleanWorkspace.screenshot({ path: evidence.cleanLines });
  writeStepStateSnapshot(evidence.cleanLinesState, await cleanLinesStepState(page));
  workflowEvents.push(bindStepWorkflowEvent("Clean Lines", evidence.cleanLines, evidence.cleanLinesState));

  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  const colorsWorkspace = page.getByLabel("Colors workspace");
  await expect(colorsWorkspace).toBeVisible();
  const primaryColors = colorsWorkspace.getByLabel("Primary colors");
  const detectedColorRows = primaryColors.locator(".color-primary-row");
  await expect(detectedColorRows).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const row = detectedColorRows.nth(index);
    const swatchColor = await row.locator(".swatch").evaluate((swatch) => getComputedStyle(swatch).backgroundColor);
    await row.getByRole("textbox").fill(maxAreaLabelForSwatch(swatchColor));
  }

  const editColorDetails = colorsWorkspace.getByLabel("Edit Color Details");
  const editColorDetailsSummary = editColorDetails.locator(":scope > summary");
  await editColorDetailsSummary.click();
  await addManualPaintColor(page, editColorDetails, "#7b421f", "Ears and pupils");
  await addManualPaintColor(page, editColorDetails, "#ffffff", "Eyes");
  await expect(primaryColors.getByRole("combobox")).toHaveCount(8);
  const preferredPaintIds = new Map<number, string>([
    [6, "apple-barrel-matte-nutmeg-brown"],
    [7, "apple-barrel-matte-white"],
  ]);
  for (let index = 0; index < 8; index += 1) {
    const row = primaryColors.locator(".color-primary-row").nth(index);
    const paintChoice = row.getByRole("combobox");
    await expect.poll(() => paintChoice.locator("option").count()).toBeGreaterThan(1);
    const areaLabel = await row.getByRole("textbox").inputValue();
    const preferredPaintId = preferredPaintIds.get(index)
      ?? (areaLabel === "Black outlines and facial details" ? "apple-barrel-matte-black" : null)
      ?? (areaLabel === "Antler" ? "folkart-outdoor-stone-gray" : null);
    const preferredPaintAvailable = preferredPaintId
      ? await paintChoice.locator("option").evaluateAll(
          (options, id) => options.some((option) => (option as HTMLOptionElement).value === id),
          preferredPaintId,
        )
      : false;
    await paintChoice.selectOption(preferredPaintAvailable ? preferredPaintId! : { index: 1 });
  }
  await editColorDetailsSummary.click();
  await expect(colorsWorkspace.getByText("Needs label")).toHaveCount(0);
  await colorsWorkspace.screenshot({ path: evidence.colors });
  writeStepStateSnapshot(evidence.colorsState, await colorsStepState(page));
  workflowEvents.push(bindStepWorkflowEvent("Colors", evidence.colors, evidence.colorsState));

  await colorsWorkspace.getByRole("button", { name: "Continue to Export" }).click();
  const exportWorkspace = page.getByLabel("Export workspace");
  await expect(exportWorkspace).toBeVisible();
  await expect(exportWorkspace).toContainText("10.36 x 24 in");
  await expect(exportWorkspace).toContainText("8 tiled pages");
  await expect(exportWorkspace.getByLabel("Include Color Guide")).toBeChecked();

  const pdfDownload = await downloadFrom(page, "Download Printable PDF");
  await pdfDownload.saveAs(evidence.pdf);
  const moreExportOptions = exportWorkspace.getByLabel("More Export Options");
  await moreExportOptions.locator("summary").click();
  const svgDownload = await downloadFrom(page, "Download SVG Linework");
  await svgDownload.saveAs(evidence.svg);
  await exportWorkspace.screenshot({ path: evidence.export });
  writeStepStateSnapshot(evidence.exportState, await exportStepState(page, evidence));
  workflowEvents.push(bindStepWorkflowEvent("Export", evidence.export, evidence.exportState));

  const renderedPacketPages = renderMaxPdfPages(evidence);
  const renderedTracePages = renderedPacketPages.slice(-8);
  writeProviderRequestLog(evidence.providerLog, observedRequests);
  workflowEvents.push(bindProviderLogWorkflowEvent(evidence.providerLog));

  writeMaxAcceptanceArtifactSet(evidence, {
    workflowEvents,
    renderedTracePages,
  });
  const acceptance = runMaxCharacterAcceptance(evidence);
  const svgInspection = acceptance.result.observations.svgInspection;
  const pdfInspection = acceptance.result.observations.pdfInspection;

  expect(acceptance.result.overallStatus).toBe("passed");
  expect(acceptance.result.sourceIdentity.status).toBe("passed");
  expect(acceptance.result.baseline.every((entry) => entry.status === "passed")).toBe(true);
  expect(acceptance.result.workflowChecks.every((entry) => entry.status === "passed")).toBe(true);
  expect(acceptance.result.assertions.every((entry) => entry.status === "passed")).toBe(true);
  expect(acceptance.stdout).toContain("[PASSED]");
  expect(svgInspection).not.toBeNull();
  expect(svgInspection?.cutlineLayerCount).toBe(1);
  expect(svgInspection?.acceptedDetailLayerCount).toBe(1);
  expect(svgInspection?.hasViewBox).toBe(true);
  expect(svgInspection?.hasOriginalUnderlay).toBe(false);
  expect(svgInspection?.hasTransientEditorState).toBe(false);
  expect(pdfInspection).not.toBeNull();
  expect(pdfInspection?.pageCount).toBe(10);
  expect(pdfInspection?.tracePageCount).toBe(8);
  expect(pdfInspection?.tileGrid).toEqual({ columns: 2, rows: 4 });
  expect(pdfInspection?.traceImageCounts).toEqual(Array(8).fill(1));
  expect(pdfInspection?.allTracePagesSingleRaster).toBe(true);
  expect(pdfInspection?.allTracePagesLetter).toBe(true);
  expect(pdfInspection?.allEmbeddedTraceImagesMonochrome).toBe(true);
  expect(pdfInspection?.calibrationSquarePoints).toBe(72);
  expect(pdfInspection?.allOverlapsMatch).toBe(true);
  expect(pdfInspection?.renderedTracePageCountMatches).toBe(true);
  expect(pdfInspection?.renderedTracePagesMonochrome).toBe(true);
  expect(pdfInspection?.forbiddenMarkers).toEqual([]);

  expect(renderedTracePages).toHaveLength(8);
  for (const renderedTracePage of renderedTracePages) {
    expect(existsSync(renderedTracePage)).toBe(true);
  }
});

function maxAreaLabelForSwatch(backgroundColor: string): string {
  const channels = backgroundColor.match(/\d+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Could not read detected Max palette swatch: ${backgroundColor}`);
  }
  const [red, green, blue] = channels;
  const isNeutral = Math.max(red, green, blue) - Math.min(red, green, blue) <= 20;
  if (!isNeutral) return "Max fur";
  return (red + green + blue) / 3 < 100 ? "Black outlines and facial details" : "Antler";
}

async function uploadStepState(page: import("@playwright/test").Page): Promise<StepStateSnapshot> {
  return {
    schemaVersion: 1,
    step: "Upload",
    visibleLabel: await locatorLabel(page.getByLabel("Upload step")),
    primaryAction: await buttonText(page.getByRole("button", { name: /Generate Template/ })),
  };
}

async function cleanLinesStepState(page: import("@playwright/test").Page): Promise<StepStateSnapshot> {
  return {
    schemaVersion: 1,
    step: "Clean Lines",
    visibleLabel: await locatorLabel(page.getByLabel("Clean Lines workspace")),
    primaryAction: await buttonText(page.getByRole("button", { name: "Looks Good - Continue to Colors" })),
    inputReadiness: await strongText(page.getByLabel("Input readiness")),
  };
}

async function colorsStepState(page: import("@playwright/test").Page): Promise<StepStateSnapshot> {
  return {
    schemaVersion: 1,
    step: "Colors",
    visibleLabel: await locatorLabel(page.getByLabel("Colors workspace")),
    primaryAction: await buttonText(page.getByRole("button", { name: "Continue to Export" })),
  };
}

async function exportStepState(
  page: import("@playwright/test").Page,
  paths: ReturnType<typeof maxAcceptanceEvidencePaths>,
): Promise<StepStateSnapshot> {
  return {
    schemaVersion: 1,
    step: "Export",
    visibleLabel: await locatorLabel(page.getByLabel("Export workspace")),
    primaryAction: await buttonText(page.getByRole("button", { name: "Download Printable PDF" })),
    outputs: [
      exportArtifactDescriptor("svg", paths.svg),
      exportArtifactDescriptor("pdf", paths.pdf),
    ],
  };
}

async function locatorLabel(locator: import("@playwright/test").Locator) {
  return locator.evaluate((element) => element.getAttribute("aria-label") ?? "");
}

async function buttonText(locator: import("@playwright/test").Locator) {
  return normalizeWhitespace((await locator.textContent()) ?? "");
}

async function strongText(locator: import("@playwright/test").Locator) {
  return normalizeWhitespace((await locator.locator("strong").textContent()) ?? "");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function addManualPaintColor(
  page: import("@playwright/test").Page,
  editColorDetails: import("@playwright/test").Locator,
  hex: string,
  label: string,
) {
  await editColorDetails.getByLabel("New paint hex").fill(hex);
  await editColorDetails.getByLabel("New paint label").fill(label);
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/api/match-color") && response.request().method() === "POST",
    ),
    editColorDetails.getByRole("button", { name: "Add color" }).click(),
  ]);
  await expect(editColorDetails.getByText("Color added")).toBeVisible();
}

async function downloadFrom(page: import("@playwright/test").Page, buttonName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(buttonName) }).click();
  return downloadPromise;
}
