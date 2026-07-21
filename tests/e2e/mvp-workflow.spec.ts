import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

test("locked Guided Workflow requests stay rejected when disabled controls are bypassed", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  const guidedWorkflow = page.getByLabel("Guided workflow");
  const uploadButton = guidedWorkflow.getByRole("button", { name: /Upload/ });
  const colorsButton = guidedWorkflow.getByRole("button", { name: /Colors/ });
  await expect(colorsButton).toBeDisabled();
  await colorsButton.evaluate((element) => {
    element.removeAttribute("disabled");
    (element as HTMLButtonElement).click();
  });
  await expect(uploadButton).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Colors workspace")).toHaveCount(0);

  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "capability-enforcement.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();

  const cleanButton = guidedWorkflow.getByRole("button", { name: /Clean Lines/ });
  const exportButton = guidedWorkflow.getByRole("button", { name: /Export/ });
  await expect(cleanButton).toHaveAttribute("aria-current", "step");
  await expect(exportButton).toBeDisabled();
  await exportButton.evaluate((element) => {
    element.removeAttribute("disabled");
    (element as HTMLButtonElement).click();
  });
  await expect(cleanButton).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Export workspace")).toHaveCount(0);

  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(colorsButton).toHaveAttribute("aria-current", "step");
  await cleanButton.click();
  await expect(colorsButton).toBeDisabled();
  await expect(colorsButton).toContainText("available");
  await colorsButton.evaluate((element) => {
    element.removeAttribute("disabled");
    (element as HTMLButtonElement).click();
  });
  await expect(cleanButton).toHaveAttribute("aria-current", "step");
});

test("project persistence keeps one coherent revision and recovers from a visible Autosave failure", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("persistence-test-started")) return;
    localStorage.clear();
    sessionStorage.setItem("persistence-test-started", "true");
  });
  await page.goto("/");

  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "persistence-session.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await uploadStep.getByLabel("Project name (optional)").fill("Persistence Session");
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();

  const fileMenu = page.getByLabel("File menu");
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByText("Auto-saved")).toBeVisible({ timeout: 15_000 });
  const initialAutosave = await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"));
  expect(initialAutosave).not.toBeNull();
  await fileMenu.getByText("File", { exact: true }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();

  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    let remainingFailures = 1;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "cutout-studio:auto-save:v1" && remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("controlled Autosave failure");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  const showOriginal = page.getByLabel("Trace Studio layer visibility").getByLabel("Show original");
  await expect(showOriginal).toBeChecked();
  await showOriginal.uncheck();
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByText("Auto-save failed")).toBeVisible({ timeout: 15_000 });
  await expect(showOriginal).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).toBe(initialAutosave);

  const projectDownloadPromise = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const projectDownload = await projectDownloadPromise;
  const serializedProject = await readDownloadText(projectDownload);
  const downloadedProject = JSON.parse(serializedProject);
  expect(downloadedProject.projectName).toBe("Persistence Session");
  expect(downloadedProject.layerVisibility.showReference).toBe(false);
  for (const runtimeOnlyField of ["operation", "persistence", "pendingEffects", "unacceptedAiProposal", "manualHistory", "manualRedoHistory", "history", "redoHistory", "selectedStrokeId", "aiProposalReview"]) {
    expect(downloadedProject).not.toHaveProperty(runtimeOnlyField);
  }
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByText("Saved")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).toBe(serializedProject);

  await fileMenu.getByText("File", { exact: true }).click();
  await showOriginal.check();
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "restored.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializedProject)
  });
  await expect(showOriginal).not.toBeChecked();
  await expect(page.getByLabel("Guided workflow").getByRole("button", { name: /Clean Lines/ })).toHaveAttribute("aria-current", "step");
  const editorTools = page.getByLabel("Template editor tools");
  await expect(editorTools.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(editorTools.getByRole("button", { name: "Redo" })).toBeDisabled();

  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"));
    return raw && raw !== serializedProject
      ? JSON.parse(raw).layerVisibility.showReference
      : null;
  }).toBe(false);
  const autosaveBeforeInvalidOpen = await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"));
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "unsupported.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 999 }))
  });
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByText("Project import failed")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).toBe(autosaveBeforeInvalidOpen);
  await expect(page.getByLabel("Guided workflow").getByRole("button", { name: /Clean Lines/ })).toHaveAttribute("aria-current", "step");

  await page.reload();
  await expect(page.getByLabel("Guided workflow").getByRole("button", { name: /Clean Lines/ })).toHaveAttribute("aria-current", "step");

  const acceptedDetail = "data:image/png;base64,accepted-detail-preserved-for-reuse";
  const manualProjectWithAcceptedDetail = {
    ...downloadedProject,
    traceMode: "manual",
    settings: { ...downloadedProject.settings, templateStyle: "manual" },
    editedDetailPngDataUrl: acceptedDetail
  };
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "manual-with-accepted-detail.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(manualProjectWithAcceptedDetail))
  });
  await fileMenu.getByText("File", { exact: true }).click();
  const manualDownloadPromise = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const manualRoundTrip = JSON.parse(await readDownloadText(await manualDownloadPromise));
  expect(manualRoundTrip.traceMode).toBe("manual");
  expect(manualRoundTrip.editedDetailPngDataUrl).toBe(acceptedDetail);
});

test("authored detail and Feature Lines stay aligned through restore and both exports", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  let providerRequestCount = 0;
  let pdfRequestBody: Buffer | null = null;
  await page.route("**/api/generate-linework", async (route) => {
    providerRequestCount += 1;
    await route.abort();
  });
  await page.route("**/api/export", async (route) => {
    pdfRequestBody = route.request().postDataBuffer();
    await route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.4\n%%EOF") });
  });
  await page.goto("/");

  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "authored-detail-and-feature-lines.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();

  const generated = await expect.poll(() => savedProjectSnapshot(page)).not.toBeNull().then(() => savedProjectSnapshot(page));
  if (!generated?.analysis?.detailLinePngDataUrl) throw new Error("Generated project did not contain authored detail.");
  const combinedProject = {
    ...generated,
    projectName: "Combined Detail Export",
    traceMode: "manual",
    settings: { ...generated.settings, templateStyle: "manual" },
    editedDetailPngDataUrl: generated.analysis.detailLinePngDataUrl,
    manualStrokes: [{
      id: "ticket-02-feature-line",
      points: [
        { x: generated.analysis.previewWidthPx * 0.3, y: generated.analysis.previewHeightPx * 0.45 },
        { x: generated.analysis.previewWidthPx * 0.5, y: generated.analysis.previewHeightPx * 0.5 },
        { x: generated.analysis.previewWidthPx * 0.7, y: generated.analysis.previewHeightPx * 0.45 }
      ],
      width: 8,
      color: "#000000",
      tool: "draw"
    }],
    layerVisibility: { ...generated.layerVisibility, showReference: false, showManualLines: true }
  };
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "combined-detail.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(combinedProject))
  });

  await expect(page.getByLabel("Trace Studio layer visibility").getByLabel("Show original")).not.toBeChecked();
  await expect.poll(() => canvasVisiblePixelCount(page.getByLabel("Editable interior detail lines"))).toBeGreaterThan(0);
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".feature-line-layer"))).toBeGreaterThan(0);

  const fileMenu = page.getByLabel("File menu");
  await fileMenu.getByText("File", { exact: true }).click();
  const savePromise = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const savedProject = JSON.parse(await readDownloadText(await savePromise));
  expect(savedProject.editedDetailPngDataUrl).toBe(combinedProject.editedDetailPngDataUrl);
  expect(savedProject.manualStrokes).toEqual(combinedProject.manualStrokes);
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "restored-combined-detail.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedProject))
  });
  await expect.poll(() => canvasVisiblePixelCount(page.getByLabel("Editable interior detail lines"))).toBeGreaterThan(0);
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".feature-line-layer"))).toBeGreaterThan(0);

  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await page.getByLabel("Colors workspace").getByRole("button", { name: "Continue to Export" }).click();
  const exportWorkspace = page.getByLabel("Export workspace");
  await downloadFrom(page, "Download Printable PDF");
  expect(pdfRequestBody?.toString("latin1")).toContain('name="editedDetail"');
  expect(pdfRequestBody?.toString("latin1")).toContain('"manualStrokes":[{"id":"ticket-02-feature-line"');

  const moreExportOptions = exportWorkspace.getByLabel("More Export Options");
  await moreExportOptions.locator("summary").click();
  const svg = await readDownloadText(await downloadFrom(page, "Download SVG Linework"));
  expect(svg).toContain('id="accepted-detail-layer"');
  expect(svg).toContain('id="manual-strokes"');
  expect(svg.match(/id="cutline-layer"/g)).toHaveLength(1);
  expect(providerRequestCount).toBe(0);
});

test("Editor Transactions keep Undo and Redo artifact-only while preserving paint work", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "editor-transactions.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();

  const guidedWorkflow = page.getByLabel("Guided workflow");
  const cleanControls = page.getByLabel("Clean Lines primary controls");
  await cleanControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  const colorDetails = page.getByLabel("Edit color details");
  if (!await colorDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open)) {
    await colorDetails.locator(":scope > summary").click();
  }
  await addProjectPaintColor(page, "#315c78", "Lifecycle paint");
  await page.getByRole("button", { name: "Continue to Export" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");

  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const rasterBefore = await detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await cleanControls.getByRole("button", { name: "Add Missing Line" }).click();
  await drawStroke(detailCanvas, [
    [0.34, 0.31],
    [0.44, 0.35],
    [0.54, 0.35],
    [0.64, 0.31]
  ]);
  await expect.poll(() => detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(rasterBefore);
  const rasterAfter = await detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(false);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.projectPalette.some((color: { label: string }) => color.label === "Lifecycle paint")).toBe(true);

  await cleanControls.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(rasterBefore);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(false);

  const moreTools = page.getByLabel("More Tools");
  if (!await moreTools.evaluate((element) => element instanceof HTMLDetailsElement && element.open)) {
    await moreTools.locator("summary").click();
  }
  await page.getByLabel("Template editor tools").getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(rasterAfter);

  await cleanControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await page.getByRole("button", { name: "Continue to Export" }).click();
  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  if (!await moreTools.evaluate((element) => element instanceof HTMLDetailsElement && element.open)) {
    await moreTools.locator("summary").click();
  }
  await page.getByLabel("Starter detail line guidance").getByRole("button", { name: "Use blank Trace Studio" }).click();
  await cleanControls.getByRole("button", { name: "Add Missing Line" }).click();
  await drawStroke(detailCanvas, [
    [0.40, 0.42],
    [0.48, 0.46],
    [0.56, 0.46],
    [0.64, 0.42]
  ]);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.manualStrokes.length).toBe(1);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(false);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.projectPalette.some((color: { label: string }) => color.label === "Lifecycle paint")).toBe(true);

  await cleanControls.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await savedProjectSnapshot(page))?.manualStrokes.length).toBe(0);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(false);
  await page.getByLabel("Template editor tools").getByRole("button", { name: "Redo" }).click();
  await expect.poll(async () => (await savedProjectSnapshot(page))?.manualStrokes.length).toBe(1);
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(false);
});

test("project name and Finished Size preserve reviewed project work", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "session-transition.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await uploadStep.getByLabel("Project name (optional)").fill("Session Transition");
  await uploadStep.getByLabel("Finished height").fill("42");
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();

  const guidedWorkflow = page.getByLabel("Guided workflow");
  const cleanControls = page.getByLabel("Clean Lines primary controls");
  await cleanControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toHaveAttribute("aria-current", "step");
  await expect.poll(async () => (await savedProjectSnapshot(page))?.workflowProgress.lineworkReviewed).toBe(true);
  const before = await savedProjectSnapshot(page);
  if (!before) throw new Error("Autosave did not contain the reviewed project.");

  await guidedWorkflow.getByRole("button", { name: /Upload/ }).click();
  await uploadStep.getByLabel("Project name (optional)").fill("Session Transition Revised");
  await uploadStep.getByLabel("Finished height").fill("48");

  await expect.poll(async () => (await savedProjectSnapshot(page))?.projectName).toBe("Session Transition Revised");
  await expect.poll(async () => (await savedProjectSnapshot(page))?.settings.finishedHeightIn).toBe(48);
  const after = await savedProjectSnapshot(page);
  if (!after) throw new Error("Autosave did not contain the revised project.");

  expect(after.analysis.finishedHeightIn).toBe(48);
  expect(after.analysis.finishedWidthIn).toBeCloseTo(before.analysis.finishedWidthIn * (48 / 42), 2);
  expect(after.analysis.outerCutPath).toBe(before.analysis.outerCutPath);
  expect(after.analysis.detailLinePngDataUrl).toBe(before.analysis.detailLinePngDataUrl);
  expect(after.editedDetailPngDataUrl).toBe(before.editedDetailPngDataUrl);
  expect(after.manualStrokes).toEqual(before.manualStrokes);
  expect(after.projectPalette).toEqual(before.projectPalette);
  expect(after.sourceImage).toEqual(before.sourceImage);
  expect(after.cleanupChecks).toEqual(before.cleanupChecks);
  expect(after.layerVisibility).toEqual(before.layerVisibility);
  expect(after.referenceOpacity).toBe(before.referenceOpacity);
  expect(after.traceViewport).toEqual(before.traceViewport);
  expect(after.workflowProgress).toEqual({
    ...before.workflowProgress,
    activeStep: "upload"
  });
});

test("maker can use authored SVG ink as editable starter lines", async ({ page }) => {
  let providerRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-linework")) providerRequests += 1;
  });
  await page.goto("/");
  const uploadStep = page.getByLabel("Upload step");
  const sourceInput = uploadStep.getByLabel("Source image");
  await expect(sourceInput).toHaveAttribute("accept", /image\/svg\+xml/);

  await sourceInput.setInputFiles({
    name: "ready-line-art.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
        <rect width="400" height="600" fill="white"/>
        <path d="M120 560 L100 420 L130 250 Q200 150 270 250 L300 420 L280 560 Z" fill="#eaa0a0"/>
        <circle cx="165" cy="300" r="18" fill="none" stroke="#111" stroke-width="8"/>
        <circle cx="235" cy="300" r="18" fill="none" stroke="#111" stroke-width="8"/>
        <path d="M150 350 Q200 380 250 350" fill="none" stroke="#111" stroke-width="8"/>
        <path d="M200 395 L200 500 M140 500 L260 500" fill="none" stroke="#111" stroke-width="8"/>
        <path d="M110 410 L130 410" fill="none" stroke="#111" stroke-width="8"/>
      </svg>
    `)
  });

  await expect(uploadStep.getByText("SVG linework detected")).toBeVisible();
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  const detailCanvas = page.getByLabel("Editable interior detail lines");
  await expect(detailCanvas).toBeVisible();
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art");
  await expect.poll(() => canvasVisiblePixelCount(detailCanvas)).toBeGreaterThan(0);
  await expect.poll(() => canvasVisiblePixelCountInRatioRegion(detailCanvas, { left: 0.02, top: 0.55, right: 0.18, bottom: 0.72 })).toBeGreaterThan(0);
  await expect(page.getByLabel("Clean Lines workspace")).toContainText("Editable starter lines");
  await expect(page.getByLabel("Original underlay guide")).toContainText("visible");
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Show Original" }).click();
  await expect(page.getByLabel("Original underlay guide")).toContainText("hidden");
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Show Original" }).click();
  await expect(page.getByLabel("Original underlay guide")).toContainText("visible");
  const originalDetail = await detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const detailPoint = await waitForCanvasInkPoint(detailCanvas);
  await detailCanvas.click({ position: await canvasLocalPoint(detailCanvas, detailPoint.x, detailPoint.y) });
  await expect.poll(() => detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(originalDetail);
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await moreTools.getByRole("button", { name: "Reset details" }).click();
  await expect.poll(() => detailCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(originalDetail);
  expect(providerRequests).toBe(0);
});

test("unsafe SVG import reports a local error and preserves the current project", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "safe-existing-project.png",
    mimeType: "image/png",
    buffer: readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png")
  });
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"));

  await page.getByLabel("Guided workflow").getByRole("button", { name: /Upload/ }).click();
  await page.getByLabel("Upload step").getByLabel("Source image").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0 L10 10" stroke="black"/></svg>')
  });

  await expect(page.getByRole("alert")).toContainText("interactive behavior");
  expect(await page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).toBe(before);
  await expect(page.getByLabel("Upload step")).toContainText("safe-existing-project.png");
  await expect(page.getByLabel("Upload step").getByRole("button", { name: "Generate Template" })).toBeEnabled();
});

test("SVG without dark authored ink uses the ordinary image workflow", async ({ page }) => {
  await page.goto("/");
  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "color-only.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="500" viewBox="0 0 300 500">
        <rect width="300" height="500" fill="white"/>
        <path d="M85 440 L70 260 Q150 90 230 260 L215 440 Z" fill="#e99b70"/>
      </svg>
    `)
  });

  await expect(uploadStep.getByText("SVG linework detected")).toHaveCount(0);
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  await expect(page.getByLabel("Clean Lines workspace")).toBeVisible();
});

test("maker can complete the MVP trace, restore, paint review, and export workflow", async ({ page, request }) => {
  const sourceImage = createSmokeCharacterPng();

  await page.addInitScript(() => {
    if (sessionStorage.getItem("cutout-e2e-cold-start")) return;
    localStorage.clear();
    sessionStorage.setItem("cutout-e2e-cold-start", "true");
  });
  await page.goto("/");
  const uploadStep = page.getByLabel("Upload step");
  await expect(uploadStep.getByLabel("Source image")).toBeAttached();
  await expect(uploadStep.getByRole("button", { name: "Generate Template" })).toBeDisabled();
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "mvp-smoke-character.png",
    mimeType: "image/png",
    buffer: sourceImage
  });
  await expect(page.getByLabel("Project name")).toHaveValue("Mvp Smoke Character");

  const guidedWorkflow = page.getByLabel("Guided workflow");
  await expect(guidedWorkflow).toContainText("Upload");
  await expect(guidedWorkflow).toContainText("Clean Lines");
  await expect(guidedWorkflow).toContainText("Colors");
  await expect(guidedWorkflow).toContainText("Export");
  await expect(guidedWorkflow.getByRole("button", { name: /Upload/ })).toHaveAttribute("aria-current", "step");
  await expect(guidedWorkflow.getByRole("button", { name: /Clean Lines/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toBeDisabled();
  const fileMenu = page.getByLabel("File menu");
  await expect(fileMenu).toBeVisible();
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByRole("button", { name: "New Project" })).toBeEnabled();
  await expect(fileMenu.getByRole("button", { name: "Open Project" })).toBeEnabled();
  await expect(fileMenu.getByRole("button", { name: "Save Project" })).toBeDisabled();

  await expect(uploadStep.getByLabel("Project name (optional)")).toHaveValue("Mvp Smoke Character");
  await expect(uploadStep.getByText("Finished height")).toBeVisible();
  await expect(uploadStep.getByRole("button", { name: "Generate Template" })).toBeVisible();
  await expect(uploadStep.locator("button.primary-action")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Start Trace Studio with Starter lines" })).toHaveCount(0);
  await expect(page.getByLabel("What to trace")).toHaveCount(0);
  await expect(page.getByLabel("Trace style")).toHaveCount(0);
  await expect(page.getByLabel("Detail strength")).toHaveCount(0);
  await expect(page.getByText("Paint colors")).toHaveCount(0);
  await expect(page.getByText("Line smoothness")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export SVG Linework" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Template Packet PDF" })).toHaveCount(0);

  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  await expect(fileMenu.getByRole("button", { name: "New Project" })).toBeHidden();
  await expect(guidedWorkflow.getByRole("button", { name: /Clean Lines/ })).toHaveAttribute("aria-current", "step");
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Upload/ })).toBeEnabled();
  const cleanWorkspace = page.getByLabel("Clean Lines workspace");
  const primaryControls = page.getByLabel("Clean Lines primary controls");
  await expect(primaryControls.getByRole("button")).toHaveCount(6);
  for (const name of ["Remove Line", "Add Missing Line", "Undo", "Show Original", "Fit", "Looks Good - Continue to Colors"]) {
    await expect(primaryControls.getByRole("button", { name })).toBeVisible();
  }
  await expect(primaryControls.getByRole("button", { name: "Remove Line" })).toHaveClass(/selected/);
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Point at a line to preview");
  await expect(page.getByLabel("Paint guide and export summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export SVG Linework" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Template Packet PDF" })).toHaveCount(0);

  const moreTools = page.getByLabel("More Tools");
  const traceStatus = page.getByLabel("Clean Lines status");
  await expect(moreTools.getByRole("button", { name: /Erase details/ })).toBeHidden();
  await expect(traceStatus.getByText("Trace Quality Review")).toBeHidden();
  await expect(traceStatus).toContainText(/Cutline (OK|Needs attention)/);
  await expect(traceStatus).toContainText(/pages/);
  await traceStatus.locator("summary").click();

  const previewCanvas = page.getByLabel("Editable interior detail lines");
  const previewPoint = await waitForCanvasInkPoint(previewCanvas);
  const detailBeforePreview = await previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await previewCanvas.hover({ position: await canvasLocalPoint(previewCanvas, previewPoint.x, previewPoint.y) });
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Connected line preview");
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".removal-preview-layer"))).toBeGreaterThan(0);
  await page.mouse.move(2, 2);
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Point at a line to preview");
  expect(await previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(detailBeforePreview);
  await previewCanvas.click({ position: await canvasLocalPoint(previewCanvas, previewPoint.x, previewPoint.y) });
  await expect.poll(() => previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(detailBeforePreview);
  await primaryControls.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(detailBeforePreview);
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".removal-preview-layer"))).toBe(0);
  await page.mouse.move(2, 2);
  await previewCanvas.evaluate((element) => (element as HTMLCanvasElement).blur());
  await previewCanvas.focus();
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Connected line preview");
  await previewCanvas.press("Enter");
  await expect.poll(() => previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(detailBeforePreview);
  await primaryControls.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => previewCanvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(detailBeforePreview);
  await expect(traceStatus.getByText("Trace Quality Review")).toBeVisible();
  await traceStatus.locator("summary").click();

  await expectCleanCanvasDominance(page, cleanWorkspace);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCleanCanvasDominance(page, cleanWorkspace);
  await expect(primaryControls.getByRole("button")).toHaveCount(6);
  await expect(moreTools.getByRole("button", { name: /Erase details/ })).toBeHidden();
  await expect(traceStatus.getByText("Trace Quality Review")).toBeHidden();
  await primaryControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toHaveAttribute("aria-current", "step");
  const colorsWorkspace = page.getByLabel("Colors workspace");
  await expect(colorsWorkspace).toBeVisible();
  await expect(page.getByLabel("Editable interior detail lines")).toHaveCount(0);
  await expect(colorsWorkspace.getByText(/\d+ colors/).first()).toBeVisible();
  const primaryColorRows = colorsWorkspace.getByLabel("Primary colors").locator(".color-primary-row");
  await expect(colorsWorkspace.getByText("6 colors in this project")).toBeVisible();
  await expect(primaryColorRows).toHaveCount(6);
  await expect(primaryColorRows.first().getByLabel(/Area label for/)).toBeVisible();
  await expect(primaryColorRows.first().getByLabel(/Selected paint for/)).toBeVisible();
  await expect(primaryColorRows.first().getByLabel(/Include .* in shopping list/)).toBeVisible();
  const editColorDetails = colorsWorkspace.getByLabel("Edit Color Details");
  await expect(editColorDetails.getByLabel("Paint Palette Editor")).toBeHidden();
  await editColorDetails.locator(":scope > summary").click();
  await expect(editColorDetails.getByLabel("Paint Palette Editor")).toBeVisible();
  await expect(editColorDetails.getByRole("slider")).toHaveValue("6");

  await colorsWorkspace.getByRole("button", { name: "Skip Paint Guide" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");
  const exportWorkspace = page.getByLabel("Export workspace");
  const includeColorGuide = exportWorkspace.getByLabel("Include Color Guide");
  await expect(includeColorGuide).not.toBeChecked();
  await expect.poll(() => savedProjectIncludesPaintGuide(page)).toBe(false);
  await includeColorGuide.click();
  await expect(includeColorGuide).not.toBeChecked();
  await expect(page.getByText("Complete color review before including the Color Guide.")).toBeVisible();
  await expect.poll(() => savedProjectColorsOutcome(page)).toBe("skipped");
  await guidedWorkflow.getByRole("button", { name: /Colors/ }).click();
  await expect(editColorDetails.getByLabel("Paint Palette Editor")).toBeVisible();
  await colorsWorkspace.getByRole("button", { name: "Continue to Export" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Complete color review before including the Color Guide.")).toHaveCount(0);
  await expect(exportWorkspace.getByLabel("Include Color Guide")).toBeChecked();
  await exportWorkspace.getByLabel("Include Color Guide").uncheck();
  await expect.poll(() => savedProjectIncludesPaintGuide(page)).toBe(false);
  await expect.poll(() => savedProjectColorsOutcome(page)).toBe("reviewed");
  await exportWorkspace.getByLabel("Include Color Guide").check();
  await expect.poll(() => savedProjectIncludesPaintGuide(page)).toBe(true);
  await guidedWorkflow.getByRole("button", { name: /Colors/ }).click();
  await primaryColorRows.first().getByLabel(/Area label for/).fill("Reviewed color area");
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toContainText("available");
  await colorsWorkspace.getByRole("button", { name: "Continue to Export" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");
  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  await expect(primaryControls.getByRole("button")).toHaveCount(6);
  const reviewedPreviewPoint = await waitForCanvasInkPoint(previewCanvas);
  await previewCanvas.hover({ position: await canvasLocalPoint(previewCanvas, reviewedPreviewPoint.x, reviewedPreviewPoint.y) });
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Connected line preview");
  await previewCanvas.click({ position: await canvasLocalPoint(previewCanvas, reviewedPreviewPoint.x, reviewedPreviewPoint.y) });
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
  await primaryControls.getByRole("button", { name: "Undo" }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });

  await moreTools.locator("summary").click();
  const traceStyleChoices = page.getByLabel("Trace style");
  await expect(traceStyleChoices.getByRole("button", { name: "Wood Template - Recommended" })).toHaveClass(/selected/);
  await primaryControls.getByRole("button", { name: "Add Missing Line" }).click();
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Draw only the missing feature");
  await expect(page.getByLabel("Brush size")).toHaveValue("normal");
  await primaryControls.getByRole("button", { name: "Remove Line" }).click();
  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByRole("button", { name: "Save Project" })).toBeEnabled();
  const projectDownloadPromise = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const initialProjectDownload = await projectDownloadPromise;
  expect(initialProjectDownload.suggestedFilename()).toMatch(/\.cutout\.json$/);
  await expect(fileMenu.getByRole("button", { name: "Save Project" })).toBeHidden();
  const starterGuidance = page.getByLabel("Starter detail line guidance");
  await expect(starterGuidance).toBeVisible({ timeout: 60_000 });
  await expect(starterGuidance).toContainText("Starter lines are generated automatically");
  await expect(starterGuidance).toContainText("Delete bad lines first");
  await expect(page.getByLabel("Template editor tools").getByRole("button", { name: /Click to remove line/ })).toHaveClass(/selected/);
  await expect(page.getByLabel("Trace Studio layer visibility")).toContainText("Editable starter lines");
  await expect(page.getByLabel("What to trace")).toContainText("keep only the lines you need to transfer onto wood");
  await expectTraceFit(page);
  await starterGuidance.getByRole("button", { name: "Use blank Trace Studio" }).click();
  await expect(page.getByText(/Blank Trace Studio Editor/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".reference-layer")).toBeVisible();
  await expect(page.locator(".outer-line-layer")).toHaveCSS("mix-blend-mode", "multiply");
  const underlayGuide = page.getByLabel("Original underlay guide");
  await expect(underlayGuide).toBeVisible();
  await expect(underlayGuide).toContainText("Original underlay is visible");
  await expect(underlayGuide).toContainText("faint source image inside the canvas below");
  await traceStatus.locator("summary").click();
  const traceQuality = page.getByLabel("Trace Quality Review");
  await expect(traceQuality).toBeVisible();
  await expect(traceQuality).toContainText("Cutline");
  await expect(traceQuality).toContainText("Vector cutline");
  await expect(traceQuality).toContainText("Original underlay");
  await expect(traceQuality).toContainText("Visible");
  await expect(traceQuality).toContainText("Manual tracing recommended");
  const traceGuidance = page.getByLabel("What to trace");
  await expect(traceGuidance).toBeVisible();
  await expect(traceGuidance).toContainText("Use the faint original image in the canvas below");
  await expect(traceGuidance).toContainText("Face features");
  await expect(traceGuidance).toContainText("Clothing borders");
  await expect(traceGuidance).toContainText("Hair shape");
  await expect(traceGuidance).toContainText("Paint boundaries");
  await expect(traceGuidance).toContainText("Accessories");
  await expect(traceGuidance).toContainText("Major folds/details");
  await expect(traceGuidance).toContainText("Skip shadows, texture, tiny highlights, and photo noise.");
  const paintGuide = page.locator('details[aria-label="Paint Guide"]');
  const paintReview = page.getByLabel("Paint Match Review");
  await expect(paintGuide).toHaveCount(0);
  await expect(paintReview).toBeHidden();
  await primaryControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toHaveAttribute("aria-current", "step");
  await expect(paintGuide).toBeVisible();
  await expect.poll(async () => paintGuide.evaluate((element) => element instanceof HTMLDetailsElement && element.open)).toBe(true);
  await expect(paintReview).toBeVisible();

  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  await moreTools.locator("summary").click();
  const canvas = page.getByLabel("Editable interior detail lines");
  await primaryControls.getByRole("button", { name: "Add Missing Line" }).click();
  await drawStroke(canvas, [
    [0.36, 0.34],
    [0.45, 0.39],
    [0.54, 0.39],
    [0.63, 0.34]
  ]);

  await page.getByRole("button", { name: /Select stroke/ }).click();
  await clickCanvasFraction(canvas, 0.45, 0.39);
  await expect(page.getByText(/Stroke 1 of 1/)).toBeVisible();
  await page.locator('select[aria-label="Selected stroke width"]').selectOption("bold");
  await expect(page.getByText(/Bold \/ 34px/)).toBeVisible();
  await page.getByRole("button", { name: /Fine-tune starter settings/ }).click();
  await page.getByRole("button", { name: /Reset tracing settings/ }).click();
  await expect(page.getByText(/Stroke 1 of 1/)).toBeVisible();

  const editorTools = page.getByLabel("Template editor tools");
  await editorTools.getByRole("button", { name: /^Duplicate$/ }).click();
  await editorTools.getByRole("button", { name: /Delete stroke/ }).click();
  await editorTools.getByRole("button", { name: /^Undo$/ }).click();
  await page.getByLabel("Selection Inspector").getByRole("button", { name: "Next stroke" }).click();
  await expect(page.getByText(/Stroke [12] of 2/)).toBeVisible();

  await fileMenu.getByText("File", { exact: true }).click();
  await expect(fileMenu.getByText("Auto-saved")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByText(/Blank Trace Studio Editor/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".reference-layer")).toBeVisible();
  await expect(guidedWorkflow.getByRole("button", { name: /Clean Lines/ })).toHaveAttribute("aria-current", "step");
  await primaryControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toHaveAttribute("aria-current", "step");
  await expect(paintGuide).toBeVisible();
  await editColorDetails.locator(":scope > summary").click();
  await expect(paintReview).toBeVisible();

  const paintRows = page.locator(".palette-row");
  await expect(paintRows.nth(3)).toBeVisible({ timeout: 30_000 });
  expect(await paintRows.nth(0).evaluate((element) => element instanceof HTMLDetailsElement)).toBe(true);
  await expect(paintReview).toBeVisible();
  await expect(page.getByLabel("Project Palette Summary")).toBeVisible();
  await expect(page.getByText("Needs label").first()).toBeVisible();

  await addProjectPaintColor(page, "#f1c7a5", "Skin tone");
  await expect(page.locator(".palette-row").filter({ hasText: "Skin tone" })).toBeVisible();
  await addProjectPaintColor(page, "#0c143a", "Blue hair");
  await expect(page.locator(".palette-row").filter({ hasText: "Blue hair" })).toBeVisible();

  await updatePaintRow(paintRows.nth(0), "Hair", "blue hair and outline");
  await paintRows.nth(0).locator(".paint-match-chip").first().click();

  await updatePaintRow(paintRows.nth(1), "Coat", "yellow raincoat");
  await paintRows.nth(1).locator("select").selectOption("__manual__");
  await paintRows.nth(1).locator('input[placeholder*="brand"]').fill("Bring source swatch and choose a yellow craft paint");

  await updatePaintRow(paintRows.nth(2), "Boots", "rain boots");
  await paintRows.nth(2).locator("select").selectOption("");

  await updatePaintRow(paintRows.nth(3), "Background test", "exclude from shopping list");
  await paintRows.nth(3).getByLabel("Include in shopping list").uncheck();

  const shoppingList = page.locator(".shopping-list-preview");
  await expect(shoppingList).toContainText("Hair");
  await expect(shoppingList).toContainText("Bring source swatch and choose a yellow craft paint - Coat");
  await expect(shoppingList).toContainText("No match / choose in store - Boots");
  await expect(shoppingList).not.toContainText("Background test");

  await fileMenu.getByText("File", { exact: true }).click();
  const projectDownloadPromiseAfterEdits = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const projectDownload = await projectDownloadPromiseAfterEdits;
  const projectDownloadFailure = await projectDownload.failure();
  if (projectDownloadFailure) throw new Error(projectDownloadFailure);
  const projectJson = JSON.parse(await readDownloadText(projectDownload));
  expect(projectJson.manualStrokes.length).toBeGreaterThanOrEqual(1);
  expect(projectJson.projectPalette.some((color: { label: string; hex: string; source: string }) => color.label === "Skin tone" && color.hex === "#f1c7a5" && color.source === "manual")).toBe(true);
  expect(projectJson.projectPalette.some((color: { label: string; hex: string; source: string }) => color.label === "Blue hair" && color.hex === "#0c143a" && color.source === "manual")).toBe(true);
  expect(projectJson.paintGuideEdits.some((edit: { label: string; selectedMatchId: string | null }) => edit.label === "Hair" && edit.selectedMatchId)).toBe(true);
  expect(projectJson.paintGuideEdits.some((edit: { label: string; manualOverride: string }) => edit.label === "Coat" && edit.manualOverride.includes("yellow craft paint"))).toBe(true);
  expect(projectJson.paintGuideEdits.some((edit: { label: string; included: boolean }) => edit.label === "Background test" && edit.included === false)).toBe(true);
  expect(JSON.stringify(projectJson)).not.toContain("selectedStrokeId");
  expect(JSON.stringify(projectJson)).not.toContain("dimUnselected");

  await page.getByRole("button", { name: "Continue to Export" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");
  await expect(exportWorkspace).toContainText("Finished Size");
  await expect(exportWorkspace).toContainText(/\d+ tiled pages/);
  await expect(exportWorkspace).toContainText("Print at 100%");
  await expect(exportWorkspace.getByRole("img", { name: "Assembled template preview" })).toBeVisible();
  await expect(exportWorkspace.getByLabel("Include cover page")).toBeChecked();
  await expect(exportWorkspace.getByLabel("Include Color Guide")).toBeChecked();
  await expect(exportWorkspace.locator("button.primary-action")).toHaveCount(1);

  const pdfDownload = await downloadFrom(page, "Download Printable PDF");
  expect((await pdfDownload.path()) ?? "").toBeTruthy();

  const moreExportOptions = exportWorkspace.getByLabel("More Export Options");
  await expect(moreExportOptions.getByRole("button", { name: "Download SVG Linework" })).toBeHidden();
  await expect(moreExportOptions.getByRole("button", { name: "Save Project JSON" })).toBeHidden();
  await moreExportOptions.locator("summary").click();

  const svgDownload = await downloadFrom(page, "Download SVG Linework");
  const svg = await readDownloadText(svgDownload);
  expect(svg).toContain("<path");
  expect(svg).toContain('id="manual-strokes"');
  expect(svg).toContain("stroke-width=\"34\"");
  expect(svg).not.toContain("reference-layer");
  expect(svg).not.toContain("original-underlay");
  expect(svg).not.toContain("selectedStrokeId");
  expect(svg).not.toContain("dimUnselected");

  const exportProjectPromise = page.waitForEvent("download");
  await moreExportOptions.getByRole("button", { name: "Save Project JSON" }).click();
  const exportProject = await exportProjectPromise;
  expect(exportProject.suggestedFilename()).toMatch(/\.cutout\.json$/);

  const pdfResponse = await request.post("/api/export", {
    multipart: {
      image: {
        name: "mvp-smoke-character.png",
        mimeType: "image/png",
        buffer: sourceImage
      },
      settings: JSON.stringify({
        finishedHeightIn: 18,
        threshold: 42,
        smoothing: 4,
        speckArea: 60,
        holeArea: 220,
        detailLines: false,
        detailCleanup: 100,
        templateStyle: "manual",
        paletteSize: 6,
        includeInstructionCoverPage: true,
        includePaintGuidePage: true
      })
    }
  });
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
});

test("Coraline head-area removal shows the complete connected scope before deletion", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByLabel("Source image").setInputFiles({
    name: "preview-seed.png",
    mimeType: "image/png",
    buffer: createSmokeCharacterPng()
  });
  await page.getByRole("button", { name: "Generate Template" }).click();

  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const fixtureDataUrl = `data:image/png;base64,${readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png").toString("base64")}`;
  await detailCanvas.evaluate(async (element, dataUrl) => {
    const canvas = element as HTMLCanvasElement;
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
  }, fixtureDataUrl);

  await detailCanvas.hover({ position: await canvasLocalPoint(detailCanvas, 180 / 359, 67 / 900) });
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Connected line preview: 1323 pixels");
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".removal-preview-layer"))).toBe(1323);
  await testInfo.attach("coraline-head-connected-line-preview", {
    body: await page.getByLabel("Clean Lines workspace").screenshot(),
    contentType: "image/png"
  });
});

test("guided workflow remains focused and responsive through Coraline acceptance", async ({ page }) => {
  const evidenceDir = "output/screenshots/latest/guided-workflow";
  mkdirSync(evidenceDir, { recursive: true });
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const guidedWorkflow = page.getByLabel("Guided workflow");
  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "coraline-best-clean-outline.png",
    mimeType: "image/png",
    buffer: readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png")
  });
  await expectSinglePrimaryAction(uploadStep, "Generate Template");
  await expectFutureStepsLocked(guidedWorkflow, ["Clean Lines", "Colors", "Export"]);
  await captureResponsiveStep(page, evidenceDir, "upload", uploadStep);

  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  const cleanWorkspace = page.getByLabel("Clean Lines workspace");
  const primaryControls = page.getByLabel("Clean Lines primary controls");
  await expectSinglePrimaryAction(cleanWorkspace, "Looks Good - Continue to Colors");
  await expectFutureStepsLocked(guidedWorkflow, ["Colors", "Export"]);
  await expect(page.getByLabel("More Tools")).not.toHaveAttribute("open", "");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectCleanCanvasDominance(page, cleanWorkspace);
  await expectTraceFit(page);

  const tracePlane = page.locator(".template-canvas-plane");
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await page.getByLabel("Template editor tools").getByRole("button", { name: "Zoom in" }).click();
  const userZoomTransform = await tracePlane.evaluate((element) => getComputedStyle(element).transform);
  await primaryControls.getByRole("button", { name: "Show Original" }).click();
  await expect.poll(() => tracePlane.evaluate((element) => getComputedStyle(element).transform)).toBe(userZoomTransform);
  await primaryControls.getByRole("button", { name: "Fit" }).click();
  await expect.poll(() => tracePlane.evaluate((element) => getComputedStyle(element).transform)).not.toBe(userZoomTransform);
  await expectTraceFit(page);
  await moreTools.locator("summary").click();

  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const fixtureDataUrl = `data:image/png;base64,${readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png").toString("base64")}`;
  await detailCanvas.evaluate(async (element, dataUrl) => {
    const canvas = element as HTMLCanvasElement;
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
  }, fixtureDataUrl);
  await detailCanvas.hover({ position: await canvasLocalPoint(detailCanvas, 180 / 359, 67 / 900) });
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Connected line preview: 1323 pixels");
  await expect.poll(() => canvasVisiblePixelCount(page.locator(".removal-preview-layer"))).toBe(1323);
  await captureResponsiveStep(page, evidenceDir, "clean-lines", cleanWorkspace);

  await primaryControls.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  const colorsWorkspace = page.getByLabel("Colors workspace");
  await expectSinglePrimaryAction(colorsWorkspace, "Continue to Export");
  await expectFutureStepsLocked(guidedWorkflow, ["Export"]);
  await expect(colorsWorkspace.getByLabel("Edit Color Details")).not.toHaveAttribute("open", "");
  await captureResponsiveStep(page, evidenceDir, "colors", colorsWorkspace);

  await colorsWorkspace.getByRole("button", { name: "Continue to Export" }).click();
  const exportWorkspace = page.getByLabel("Export workspace");
  await expectSinglePrimaryAction(exportWorkspace, "Download Printable PDF");
  await expect(exportWorkspace.getByLabel("More Export Options")).not.toHaveAttribute("open", "");
  await captureResponsiveStep(page, evidenceDir, "export", exportWorkspace);
});

test("existing line art is reported and can be overridden from More Tools", async ({ page }) => {
  let providerRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-linework")) providerRequests += 1;
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByLabel("Source image").setInputFiles({
    name: "coraline-best-clean-outline.png",
    mimeType: "image/png",
    buffer: readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png")
  });
  await page.getByRole("button", { name: "Generate Template" }).click();

  const cleanStatus = page.getByLabel("Clean Lines status");
  await expect(page.getByLabel("Input readiness")).toContainText("Ready line art");
  await expect(cleanStatus).toContainText("Existing line art detected");
  await cleanStatus.locator("summary").click();
  await expect(cleanStatus.getByLabel("Trace Quality Review")).toContainText("Existing line art detected");
  await page.screenshot({ path: "output/screenshots/latest/flat-line-art-auto-detected.png" });
  expect(providerRequests).toBe(0);

  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  const presetChoices = moreTools.getByLabel("Detail strength");
  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const primaryControls = page.getByLabel("Clean Lines primary controls");
  const editorTools = page.getByLabel("Template editor tools");
  mkdirSync("output/screenshots/latest/line-art-presets", { recursive: true });
  await primaryControls.getByRole("button", { name: "Show Original" }).click();
  await editorTools.getByRole("button", { name: "Preview Printable Template" }).click();

  const balancedPixels = await canvasVisiblePixelCount(detailCanvas);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    presetChoices.getByRole("button", { name: "Minimal - Experimental" }).click()
  ]);
  await expect(page.getByText("Minimal starter lines Editor", { exact: true })).toBeVisible();
  await expect.poll(() => canvasVisiblePixelCount(detailCanvas)).toBeLessThan(balancedPixels);
  const simplePixels = await canvasVisiblePixelCount(detailCanvas);
  await page.waitForTimeout(250);
  await page.locator(".template-editor").screenshot({ path: "output/screenshots/latest/line-art-presets/simple.png", animations: "disabled" });

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    presetChoices.getByRole("button", { name: "Wood Template - Recommended" }).click()
  ]);
  await expect(page.getByText("Wood Template starter lines Editor", { exact: true })).toBeVisible();
  await expect.poll(() => canvasVisiblePixelCount(detailCanvas)).toBeGreaterThan(simplePixels);
  const regeneratedBalancedPixels = await canvasVisiblePixelCount(detailCanvas);
  await page.waitForTimeout(250);
  await page.locator(".template-editor").screenshot({ path: "output/screenshots/latest/line-art-presets/balanced.png", animations: "disabled" });

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    presetChoices.getByRole("button", { name: "Faithful Artwork" }).click()
  ]);
  await expect(page.getByText("Faithful Artwork starter lines Editor", { exact: true })).toBeVisible();
  await expect.poll(() => canvasVisiblePixelCount(detailCanvas)).not.toBe(regeneratedBalancedPixels);
  await page.waitForTimeout(250);
  await page.locator(".template-editor").screenshot({ path: "output/screenshots/latest/line-art-presets/detailed.png", animations: "disabled" });

  await editorTools.getByRole("button", { name: "Preview Printable Template" }).click();
  await primaryControls.getByRole("button", { name: "Add Missing Line" }).click();
  await drawStroke(detailCanvas, [[0.45, 0.42], [0.55, 0.42]]);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("replace your edited starter-line cleanup");
    await dialog.dismiss();
  });
  await presetChoices.getByRole("button", { name: "Wood Template - Recommended" }).click();
  await expect(presetChoices.getByRole("button", { name: "Faithful Artwork" })).toHaveClass(/selected/);

  const imageType = moreTools.getByLabel("Image type");
  await expect(imageType.getByRole("button", { name: "Auto" })).toHaveClass(/selected/);
  await expect(imageType.getByRole("button", { name: "Existing line art" })).toBeVisible();
  await expect(imageType.getByRole("button", { name: "Rendered image" })).toBeVisible();

  await imageType.getByRole("button", { name: "Rendered image" }).click();
  await expect(cleanStatus).toContainText("Rendered image boundaries", { timeout: 60_000 });
  await expect(imageType.getByRole("button", { name: "Rendered image" })).toHaveClass(/selected/);
});

test("rendered artwork stays review-only across legacy project restore", async ({ page }) => {
  let providerRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-linework")) providerRequests += 1;
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByLabel("Source image").setInputFiles({
    name: "rendered-review-boundary.png",
    mimeType: "image/png",
    buffer: readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png")
  });
  await page.getByRole("button", { name: "Generate Template" }).click();

  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);

  const readiness = page.getByLabel("Input readiness");
  await expect(readiness).toContainText("Needs simplification");
  await expect(readiness).toContainText("Cut Line is technically ready to review");
  await expect(readiness).toContainText("not guaranteed Wood-Transfer Style transfer lines");
  await expect(readiness).toContainText("cannot replace accepted Detail Lines unless you explicitly review and accept it");
  await expect(readiness).not.toContainText("Ready line art");
  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const acceptedDetailBeforeRestore = await detailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());

  const fileMenu = page.getByLabel("File menu");
  await fileMenu.getByText("File", { exact: true }).click();
  const projectDownloadPromise = page.waitForEvent("download");
  await fileMenu.getByRole("button", { name: "Save Project" }).click();
  const legacyProject = JSON.parse(await readDownloadText(await projectDownloadPromise));
  expect(legacyProject).not.toHaveProperty("inputReadiness");
  await page.locator("input.hidden-project-input").setInputFiles({
    name: "legacy-rendered-review-boundary.cutout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyProject))
  });

  await expect(page.getByLabel("Input readiness")).toContainText("Needs simplification");
  await expect.poll(() => detailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBeforeRestore);
  expect(providerRequests).toBe(0);
});

async function captureResponsiveStep(page: Page, evidenceDir: string, step: string, workspace: Locator) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(workspace).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/${step}-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspace).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${evidenceDir}/${step}-mobile.png` });
}

async function expectSinglePrimaryAction(workspace: Locator, name: string) {
  await expect(workspace.locator("button.primary-action")).toHaveCount(1);
  await expect(workspace.getByRole("button", { name })).toBeVisible();
}

async function expectFutureStepsLocked(workflow: Locator, stepNames: string[]) {
  for (const name of stepNames) {
    await expect(workflow.getByRole("button", { name: new RegExp(name) })).toBeDisabled();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function downloadFrom(page: Page, buttonName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(buttonName) }).click();
  return downloadPromise;
}

async function readDownloadText(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Unable to read ${download.suggestedFilename()}.`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

async function drawStroke(canvas: Locator, points: [number, number][]) {
  await canvas.hover({ position: await canvasLocalPoint(canvas, points[0][0], points[0][1]) });
  await canvas.page().mouse.down();
  for (const [x, y] of points.slice(1)) {
    await canvas.hover({ position: await canvasLocalPoint(canvas, x, y) });
  }
  await canvas.page().mouse.up();
}

async function clickCanvasFraction(canvas: Locator, xFraction: number, yFraction: number) {
  await canvas.click({ position: await canvasLocalPoint(canvas, xFraction, yFraction) });
}

async function canvasLocalPoint(canvas: Locator, xFraction: number, yFraction: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas was not visible.");
  return {
    x: box.width * xFraction,
    y: box.height * yFraction
  };
}

async function expectTraceFit(page: Page) {
  const viewport = page.locator(".template-editor");
  const cutline = viewport.locator(".outer-line-layer");
  const measure = async () => {
    const [viewportBox, cutlineBox, pixelBounds] = await Promise.all([
      viewport.boundingBox(),
      cutline.boundingBox(),
      cutline.evaluate((element) => {
        const image = element as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) return null;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width;
        let top = canvas.height;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) return null;
        return { left, top, right: right + 1, bottom: bottom + 1, width: canvas.width, height: canvas.height };
      })
    ]);
    if (!viewportBox || !cutlineBox || !pixelBounds) return null;

    const subjectBox = {
      x: cutlineBox.x + (pixelBounds.left / pixelBounds.width) * cutlineBox.width,
      y: cutlineBox.y + (pixelBounds.top / pixelBounds.height) * cutlineBox.height,
      width: ((pixelBounds.right - pixelBounds.left) / pixelBounds.width) * cutlineBox.width,
      height: ((pixelBounds.bottom - pixelBounds.top) / pixelBounds.height) * cutlineBox.height
    };

    return {
      heightRatio: subjectBox.height / viewportBox.height,
      xCenterOffset: Math.abs(subjectBox.x + subjectBox.width / 2 - (viewportBox.x + viewportBox.width / 2)) / viewportBox.width,
      yCenterOffset: Math.abs(subjectBox.y + subjectBox.height / 2 - (viewportBox.y + viewportBox.height / 2)) / viewportBox.height
    };
  };

  await expect.poll(async () => (await measure())?.heightRatio ?? 0).toBeGreaterThanOrEqual(0.7);
  await expect.poll(async () => (await measure())?.heightRatio ?? 1).toBeLessThanOrEqual(0.85);
  await expect.poll(async () => (await measure())?.xCenterOffset ?? 1).toBeLessThanOrEqual(0.1);
  await expect.poll(async () => (await measure())?.yCenterOffset ?? 1).toBeLessThanOrEqual(0.1);
}

async function expectCleanCanvasDominance(page: Page, workspace: Locator) {
  const measurements = await workspace.evaluate((element) => {
    const workspaceRect = element.getBoundingClientRect();
    const canvas = element.querySelector<HTMLElement>(".template-editor");
    if (!canvas) throw new Error("Clean Lines canvas was not rendered.");
    const canvasRect = canvas.getBoundingClientRect();
    return {
      widthRatio: canvasRect.width / workspaceRect.width,
      height: canvasRect.height,
      viewportHeight: window.innerHeight
    };
  });
  expect(measurements.widthRatio).toBeGreaterThanOrEqual(0.7);
  expect(measurements.height).toBeGreaterThanOrEqual(measurements.viewportHeight * 0.65);
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

async function canvasVisiblePixelCountInRatioRegion(
  canvas: Locator,
  region: { left: number; top: number; right: number; bottom: number }
) {
  return canvas.evaluate((element, targetRegion) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    const left = Math.floor(target.width * targetRegion.left);
    const top = Math.floor(target.height * targetRegion.top);
    const right = Math.ceil(target.width * targetRegion.right);
    const bottom = Math.ceil(target.height * targetRegion.bottom);
    let count = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (pixels[(y * target.width + x) * 4 + 3] > 0) count += 1;
      }
    }
    return count;
  }, region);
}

async function savedProjectIncludesPaintGuide(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cutout-studio:auto-save:v1");
    if (!raw) return null;
    return Boolean(JSON.parse(raw).settings.includePaintGuidePage);
  });
}

async function savedProjectColorsOutcome(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cutout-studio:auto-save:v1");
    if (!raw) return null;
    return JSON.parse(raw).workflowProgress.colorsOutcome as string;
  });
}

async function savedProjectSnapshot(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cutout-studio:auto-save:v1");
    return raw ? JSON.parse(raw) : null;
  });
}

async function updatePaintRow(row: Locator, label: string, note: string) {
  const isClosedDetails = await row.evaluate((element) => element instanceof HTMLDetailsElement && !element.open);
  if (isClosedDetails) await row.locator("summary").click();
  await row.getByLabel("Label").fill(label);
  await row.getByLabel("Notes/use").fill(note);
}

async function addProjectPaintColor(page: Page, hex: string, label: string) {
  await page.getByLabel("New paint hex").fill(hex);
  await page.getByLabel("New paint label").fill(label);
  await page.getByRole("button", { name: /Add color/ }).click();
}

function createSmokeCharacterPng() {
  const width = 96;
  const height = 128;
  const rgba = Buffer.alloc(width * height * 4, 255);

  fillEllipse(rgba, width, height, 48, 28, 22, 22, [242, 200, 170, 255]);
  fillEllipse(rgba, width, height, 48, 20, 26, 12, [10, 24, 70, 255]);
  fillRect(rgba, width, height, 30, 47, 36, 48, [236, 201, 42, 255]);
  fillRect(rgba, width, height, 38, 92, 20, 18, [120, 35, 55, 255]);
  fillRect(rgba, width, height, 28, 110, 12, 12, [217, 166, 31, 255]);
  fillRect(rgba, width, height, 56, 110, 12, 12, [130, 92, 41, 255]);
  fillEllipse(rgba, width, height, 40, 28, 3, 4, [0, 0, 0, 255]);
  fillEllipse(rgba, width, height, 56, 28, 3, 4, [0, 0, 0, 255]);
  fillRect(rgba, width, height, 43, 37, 12, 2, [145, 26, 52, 255]);

  return encodePng(width, height, rgba);
}

function fillRect(buffer: Buffer, width: number, height: number, x: number, y: number, rectWidth: number, rectHeight: number, color: number[]) {
  for (let row = Math.max(0, y); row < Math.min(height, y + rectHeight); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(width, x + rectWidth); col += 1) {
      setPixel(buffer, width, col, row, color);
    }
  }
}

function fillEllipse(buffer: Buffer, width: number, height: number, cx: number, cy: number, rx: number, ry: number, color: number[]) {
  for (let row = Math.max(0, cy - ry); row < Math.min(height, cy + ry); row += 1) {
    for (let col = Math.max(0, cx - rx); col < Math.min(width, cx + rx); col += 1) {
      const dx = (col - cx) / rx;
      const dy = (row - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(buffer, width, col, row, color);
    }
  }
}

function setPixel(buffer: Buffer, width: number, x: number, y: number, color: number[]) {
  const offset = (y * width + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function encodePng(width: number, height: number, rgba: Buffer) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  return Buffer.concat([uint32(data.length), name, data, uint32(crc32(Buffer.concat([name, data])) >>> 0)]);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
