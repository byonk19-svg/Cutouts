import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

const sourceBuffer = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
const sourceDataUrl = `data:image/png;base64,${sourceBuffer.toString("base64")}`;

test("failed reviewed-color match refresh preserves prior matches, palette state, and review progress without retrying", async ({ page }) => {
  let matchRequestCount = 0;
  await page.route("**/api/analyze", (route) => fulfillAnalysis(route));
  await page.route("**/api/match-color", async (route) => {
    matchRequestCount += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Controlled paint match failure" })
    });
  });

  await openEmptyApp(page);
  await createAnalyzedProject(page, "reviewed-paint-failure.png");
  await openEditColorDetails(page);

  const firstRow = page.locator(".palette-row").first();
  await openPaletteRow(firstRow);
  await firstRow.locator(".paint-match-chip").first().click();
  await expect.poll(async () => (await autosave(page))?.projectPalette?.[0]?.selectedMatchId).toBe("match-navy");

  await page.getByLabel("Colors workspace").getByRole("button", { name: "Continue to Export" }).click();
  await expect.poll(async () => (await autosave(page))?.workflowProgress?.colorsOutcome).toBe("reviewed");
  await page.getByLabel("Guided workflow").getByRole("button", { name: /Colors/ }).click();
  await expect(page.getByLabel("Colors workspace")).toBeVisible();
  await openEditColorDetails(page);
  await openPaletteRow(firstRow);

  const before = await autosave(page);
  expect(before?.projectPalette?.[0]?.selectedMatchId).toBe("match-navy");

  const hexInput = firstRow.getByLabel("Hex");
  await hexInput.fill("#112233");
  await firstRow.getByLabel("Notes/use").click();

  await expect(page.getByText("Unable to refresh paint matches. Existing choices were kept.")).toBeVisible();
  await expect.poll(() => matchRequestCount).toBe(1);
  await expect.poll(async () => (await autosave(page))?.projectPalette?.[0]?.hex).toBe("#112233");

  const after = await autosave(page);
  expect(after?.projectPalette?.[0]?.matches).toEqual(before?.projectPalette?.[0]?.matches);
  expect(after?.projectPalette?.[0]?.selectedMatchId).toBe(before?.projectPalette?.[0]?.selectedMatchId);
  expect(after?.projectPalette?.[1]).toEqual(before?.projectPalette?.[1]);
  expect(after?.workflowProgress?.colorsOutcome).toBe("reviewed");
});

test("a late manual-add paint match result cannot restore a reset palette entry", async ({ page }) => {
  const deferredMatch = createDeferredMatchRoute();
  await page.route("**/api/analyze", (route) => fulfillAnalysis(route));
  await page.route("**/api/match-color", async (route) => {
    await deferredMatch.hold(route);
  });

  await openEmptyApp(page);
  await createAnalyzedProject(page, "late-manual-add.png");
  await openEditColorDetails(page);

  await page.getByLabel("New paint hex").fill("#f1c7a5");
  await page.getByLabel("New paint label").fill("Late Skin");
  await page.getByRole("button", { name: "Add color" }).click();

  const lateSkinRow = page.locator(".palette-row").filter({ hasText: "Late Skin" });
  await expect(lateSkinRow).toBeVisible();
  await expect.poll(() => deferredMatch.seen).toBe(true);

  await page.getByRole("button", { name: "Reset palette" }).click();
  await expect(lateSkinRow).toHaveCount(0);

  deferredMatch.releaseSuccess([
    paintMatch("late-skin-match", "FolkArt", "Multi-Surface", "Portrait Light", "#f1c7a5")
  ]);

  await page.waitForTimeout(500);
  await expect(lateSkinRow).toHaveCount(0);
  await expect.poll(async () => (await autosave(page))?.projectPalette?.some((color: { label: string }) => color.label === "Late Skin")).toBe(false);
});

test("invalid partial hex stays presentation-only until a valid blur commits one durable update", async ({ page }) => {
  let matchRequestCount = 0;
  await page.route("**/api/analyze", (route) => fulfillAnalysis(route));
  await page.route("**/api/match-color", async (route) => {
    matchRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matches: [
          paintMatch("updated-navy", "FolkArt", "Outdoor", "Deep Navy", "#112233")
        ]
      })
    });
  });

  await openEmptyApp(page);
  await createAnalyzedProject(page, "invalid-hex-draft.png");
  await openEditColorDetails(page);

  const firstRow = page.locator(".palette-row").first();
  await openPaletteRow(firstRow);

  const beforeRaw = await autosaveRaw(page);
  const durableBefore = await autosave(page);
  const hexInput = firstRow.getByLabel("Hex");

  await hexInput.fill("#12");
  await firstRow.getByLabel("Notes/use").click();

  await expect(page.getByText("Enter a valid 3- or 6-digit hex color.")).toBeVisible();
  await expect(hexInput).toHaveValue(durableBefore.projectPalette[0].hex);
  expect(await autosaveRaw(page)).toBe(beforeRaw);
  expect(matchRequestCount).toBe(0);

  await hexInput.fill("#123");
  await firstRow.getByLabel("Notes/use").click();

  await expect.poll(async () => (await autosave(page))?.projectPalette?.[0]?.hex).toBe("#112233");
  await expect.poll(() => matchRequestCount).toBe(1);
  expect(await autosaveRaw(page)).not.toBe(beforeRaw);
});

test("malformed paint match payload preserves the reviewed palette and visible recovery state", async ({ page }) => {
  let matchRequestCount = 0;
  await page.route("**/api/analyze", (route) => fulfillAnalysis(route));
  await page.route("**/api/match-color", async (route) => {
    matchRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matches: [
          paintMatch("valid-match", "FolkArt", "Outdoor", "Navy", "#1f315d"),
          {
            id: 42,
            brand: "Broken"
          }
        ]
      })
    });
  });

  await openEmptyApp(page);
  await createAnalyzedProject(page, "malformed-paint-match.png");
  await openEditColorDetails(page);

  const firstRow = page.locator(".palette-row").first();
  await openPaletteRow(firstRow);
  await firstRow.locator(".paint-match-chip").first().click();
  await expect.poll(async () => (await autosave(page))?.projectPalette?.[0]?.selectedMatchId).toBe("match-navy");

  await page.getByLabel("Colors workspace").getByRole("button", { name: "Continue to Export" }).click();
  await expect.poll(async () => (await autosave(page))?.workflowProgress?.colorsOutcome).toBe("reviewed");
  await page.getByLabel("Guided workflow").getByRole("button", { name: /Colors/ }).click();
  await openEditColorDetails(page);
  await openPaletteRow(firstRow);

  const before = await autosave(page);
  const hexInput = firstRow.getByLabel("Hex");
  await hexInput.fill("#112233");
  await firstRow.getByLabel("Notes/use").click();

  await expect(page.getByText("Unable to refresh paint matches. Existing choices were kept.")).toBeVisible();
  await expect.poll(() => matchRequestCount).toBe(1);
  await expect.poll(async () => (await autosave(page))?.projectPalette?.[0]?.hex).toBe("#112233");
  const after = await autosave(page);
  expect(after?.projectPalette?.[0]?.hex).toBe("#112233");
  expect(after?.projectPalette?.[0]?.matches).toEqual(before?.projectPalette?.[0]?.matches);
  expect(after?.projectPalette?.[0]?.selectedMatchId).toBe(before?.projectPalette?.[0]?.selectedMatchId);
  expect(after?.projectPalette?.[1]).toEqual(before?.projectPalette?.[1]);
  expect(after?.workflowProgress?.colorsOutcome).toBe("reviewed");
});

async function openEmptyApp(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
}

async function createAnalyzedProject(page: Page, fileName: string) {
  const upload = page.getByLabel("Upload step");
  await upload.getByLabel("Source image").setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: sourceBuffer
  });
  await upload.getByRole("button", { name: /Generate Template/ }).click();
  await expect(page.getByLabel("Clean Lines workspace")).toBeVisible();
  await page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(page.getByLabel("Colors workspace")).toBeVisible();
}

async function openEditColorDetails(page: Page) {
  const details = page.getByLabel("Edit Color Details");
  const open = await details.evaluate((element) => element instanceof HTMLDetailsElement && element.open);
  if (!open) await details.locator(":scope > summary").click();
  await expect(details).toBeVisible();
}

async function openPaletteRow(row: ReturnType<Page["locator"]>) {
  const isClosed = await row.evaluate((element) => element instanceof HTMLDetailsElement && !element.open);
  if (isClosed) await row.locator("summary").click();
}

async function autosave(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cutout-studio:auto-save:v1");
    return raw ? JSON.parse(raw) : null;
  });
}

async function autosaveRaw(page: Page) {
  return page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"));
}

async function fulfillAnalysis(route: Route) {
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
      outerCutPath: "M 12 12 L 390 12 L 390 590 L 12 590 Z",
      detailLinePngDataUrl: sourceDataUrl,
      paintGuidePngDataUrl: sourceDataUrl,
      previewWidthPx: 400,
      previewHeightPx: 600,
      palette: [
        { index: 0, hex: "#0c143a", coverage: 0.52, matches: [paintMatch("match-navy", "FolkArt", "Outdoor", "Navy", "#1f315d")] },
        { index: 1, hex: "#f1ce2d", coverage: 0.24, matches: [paintMatch("match-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")] }
      ]
    })
  });
}

function paintMatch(id: string, brand: string, line: string, colorName: string, hex: string) {
  return {
    id,
    brand,
    line,
    colorName,
    hex,
    finish: "matte",
    outdoorRecommended: false,
    retailer: "",
    productUrl: "",
    notes: "",
    distance: 3.2,
    confidence: "close match" as const
  };
}

function createDeferredMatchRoute() {
  let seen = false;
  let release: (() => void) | null = null;
  let responseBody: string | null = null;

  return {
    get seen() {
      return seen;
    },
    async hold(route: Route) {
      seen = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: responseBody ?? JSON.stringify({ matches: [] })
      });
    },
    releaseSuccess(matches: unknown[]) {
      responseBody = JSON.stringify({ matches });
      release?.();
    }
  };
}
