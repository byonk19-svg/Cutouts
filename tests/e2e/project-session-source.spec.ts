import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

const sourceBuffer = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
const sourceDataUrl = `data:image/png;base64,${sourceBuffer.toString("base64")}`;

test("successful Source Image replacement commits the prepared source and resets downstream review", async ({ page }) => {
  let requestNumber = 0;
  await page.route("**/api/analyze", async (route) => {
    requestNumber += 1;
    await fulfillAnalysis(route, requestNumber);
  });
  await openEmptyApp(page);
  await createAnalyzedProject(page, "original-source.png");
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect.poll(async () => (await autosave(page))?.workflowProgress.lineworkReviewed).toBe(true);

  await page.getByLabel("Guided workflow").getByRole("button", { name: /Upload/ }).click();
  const upload = page.getByLabel("Upload step");
  await chooseSource(upload, "replacement-source.png");
  await upload.getByRole("button", { name: /Generate Template/ }).click();

  await expect(page.getByLabel("Clean Lines workspace")).toBeVisible();
  await expect.poll(async () => (await autosave(page))?.sourceImage.name).toBe("replacement-source.png");
  const saved = await autosave(page);
  expect(saved.projectName).toBe("Replacement Source");
  expect(saved.analysis.outerCutPath).toContain("M 12 12");
  expect(saved.workflowProgress).toEqual({ activeStep: "clean", lineworkReviewed: false, colorsOutcome: "incomplete" });
  expect(saved.manualStrokes).toEqual([]);
});

test("failed replacement preserves the current source, analysis, linework, paint, and milestones", async ({ page }) => {
  let requestNumber = 0;
  await page.route("**/api/analyze", async (route) => {
    requestNumber += 1;
    if (requestNumber === 2) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Controlled analysis failure" }) });
      return;
    }
    await fulfillAnalysis(route, requestNumber);
  });
  await openEmptyApp(page);
  await createAnalyzedProject(page, "preserved-source.png");
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect.poll(async () => (await autosave(page))?.workflowProgress.lineworkReviewed).toBe(true);
  const before = await autosave(page);

  await page.getByLabel("Guided workflow").getByRole("button", { name: /Upload/ }).click();
  const upload = page.getByLabel("Upload step");
  await chooseSource(upload, "unreadable-replacement.png");
  await upload.getByRole("button", { name: /Generate Template/ }).click();

  await expect(page.getByText("Controlled analysis failure")).toBeVisible();
  const after = await autosave(page);
  expect(after).toEqual(before);
  expect(after.sourceImage.name).toBe("preserved-source.png");
  expect(after.workflowProgress.lineworkReviewed).toBe(true);
});

test("a delayed analysis response cannot overwrite a newer selected source", async ({ page }) => {
  let requestNumber = 0;
  let releaseDelayed: (() => void) | undefined;
  await page.route("**/api/analyze", async (route) => {
    requestNumber += 1;
    const currentRequest = requestNumber;
    if (currentRequest === 2) {
      await new Promise<void>((resolve) => { releaseDelayed = resolve; });
    }
    await fulfillAnalysis(route, currentRequest);
  });
  await openEmptyApp(page);
  await createAnalyzedProject(page, "current-source.png");

  await page.getByLabel("Guided workflow").getByRole("button", { name: /Upload/ }).click();
  await expect.poll(async () => (await autosave(page))?.workflowProgress.activeStep).toBe("upload");
  const beforeDelayedResponse = await autosave(page);
  const upload = page.getByLabel("Upload step");
  await chooseSource(upload, "delayed-source.png");
  await upload.getByRole("button", { name: /Generate Template/ }).click();
  await expect.poll(() => releaseDelayed !== undefined).toBe(true);
  await chooseSource(upload, "newest-source.png");
  releaseDelayed?.();

  await expect(upload.getByRole("button", { name: /Generate Template/ })).toBeEnabled();
  expect(await autosave(page)).toEqual(beforeDelayedResponse);
  await upload.getByRole("button", { name: /Generate Template/ }).click();
  await expect.poll(async () => (await autosave(page))?.sourceImage.name).toBe("newest-source.png");
  const saved = await autosave(page);
  expect(saved.projectName).toBe("Newest Source");
  expect(saved.analysis.outerCutPath).toContain("M 13 13");
});

test("confirmed New Project clears the active Project Session and Autosave", async ({ page }) => {
  await page.route("**/api/analyze", (route) => fulfillAnalysis(route, 1));
  await openEmptyApp(page);
  await createAnalyzedProject(page, "project-to-clear.png");
  await expect.poll(async () => (await autosave(page))?.sourceImage.name).toBe("project-to-clear.png");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Start a new project?");
    await dialog.accept();
  });
  const fileMenu = page.getByLabel("File menu");
  await fileMenu.getByText("File", { exact: true }).click();
  await fileMenu.getByRole("button", { name: "New Project" }).click();

  await expect(page.getByLabel("Upload step").getByText("Choose a complete PNG, JPG, or SVG")).toBeVisible();
  await expect(page.getByLabel("Project name (optional)")).toHaveValue("Cutout Project");
  await expect.poll(() => autosave(page)).toBeNull();
});

async function openEmptyApp(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
}

async function createAnalyzedProject(page: Page, fileName: string) {
  const upload = page.getByLabel("Upload step");
  await chooseSource(upload, fileName);
  await upload.getByRole("button", { name: /Generate Template/ }).click();
  await expect(page.getByLabel("Clean Lines workspace")).toBeVisible();
  await expect.poll(async () => (await autosave(page))?.sourceImage.name).toBe(fileName);
}

async function chooseSource(upload: ReturnType<Page["getByLabel"]>, fileName: string) {
  await upload.getByLabel("Source image").setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: sourceBuffer
  });
  await expect(upload).toContainText(fileName);
}

async function autosave(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cutout-studio:auto-save:v1");
    return raw ? JSON.parse(raw) : null;
  });
}

async function fulfillAnalysis(route: Route, marker: number) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sourceWidthPx: 400,
      sourceHeightPx: 600,
      subjectBoundsPx: [20, 20, 380, 580],
      finishedWidthIn: 24,
      finishedHeightIn: 36,
      tileCols: 3,
      tileRows: 4,
      tileCount: 12,
      previewPngDataUrl: sourceDataUrl,
      outerLinePngDataUrl: sourceDataUrl,
      outerCutPath: `M ${10 + marker} ${10 + marker} L 390 10 L 390 590 L 10 590 Z`,
      detailLinePngDataUrl: sourceDataUrl,
      paintGuidePngDataUrl: sourceDataUrl,
      previewWidthPx: 400,
      previewHeightPx: 600,
      palette: [{ index: 0, hex: marker === 1 ? "#facc15" : "#2563eb", weight: 1, matches: [] }]
    })
  });
}
