import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

test("maker can complete the MVP trace, restore, paint review, and export workflow", async ({ page, request }) => {
  const sourceImage = createSmokeCharacterPng();

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles({
    name: "mvp-smoke-character.png",
    mimeType: "image/png",
    buffer: sourceImage
  });

  await expect(page.getByLabel("Guided workflow")).toContainText("Generate cutline");
  await expect(page.getByLabel("Guided workflow").getByRole("button", { name: /Generate cutline/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start New/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Trace Studio" })).toBeVisible();
  await expect(page.getByLabel("Trace style")).toContainText("Optional helpers");
  await expect(page.getByText("Line smoothness")).toBeHidden();
  const traceStyleChoices = page.getByLabel("Trace style");
  await expect(traceStyleChoices.getByRole("button", { name: /Trace Studio/ })).toContainText("Draw clean template lines");
  await traceStyleChoices.getByRole("button", { name: /Trace Studio/ }).click();
  await page.getByRole("button", { name: "Start Trace Studio" }).click();
  await expect(page.getByText(/Trace Studio Editor/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".reference-layer")).toBeVisible();

  const canvas = page.getByLabel("Editable interior detail lines");
  await page.getByRole("button", { name: /Draw details/ }).click();
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
  await page.getByRole("button", { name: /Show advanced auto-start settings/ }).click();
  await page.getByRole("button", { name: /Reset tracing settings/ }).click();
  await expect(page.getByText(/Stroke 1 of 1/)).toBeVisible();

  const editorTools = page.getByLabel("Template editor tools");
  await editorTools.getByRole("button", { name: /^Duplicate$/ }).click();
  await editorTools.getByRole("button", { name: /Delete stroke/ }).click();
  await editorTools.getByRole("button", { name: /^Undo$/ }).click();
  await page.getByLabel("Selection Inspector").getByRole("button", { name: "Next stroke" }).click();
  await expect(page.getByText(/Stroke [12] of 2/)).toBeVisible();

  await expect(page.getByText("Auto-saved")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByText(/Trace Studio Editor/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".reference-layer")).toBeVisible();

  const paintRows = page.locator(".palette-row");
  await expect(paintRows.nth(3)).toBeVisible({ timeout: 30_000 });
  expect(await paintRows.nth(0).evaluate((element) => element instanceof HTMLDetailsElement)).toBe(true);
  await expect(page.getByLabel("Paint Match Review")).toBeVisible();
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

  const projectDownload = await downloadFrom(page, "Export JSON");
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

  await page.getByRole("button", { name: /Preview Printable Template/ }).click();

  const svgDownload = await downloadFrom(page, "Export SVG Linework");
  const svg = await readDownloadText(svgDownload);
  expect(svg).toContain("<path");
  expect(svg).toContain('id="manual-strokes"');
  expect(svg).toContain("stroke-width=\"34\"");
  expect(svg).not.toContain("reference-layer");
  expect(svg).not.toContain("original-underlay");
  expect(svg).not.toContain("selectedStrokeId");
  expect(svg).not.toContain("dimUnselected");

  const pdfDownload = await downloadFrom(page, "Export Template Packet PDF");
  expect((await pdfDownload.path()) ?? "").toBeTruthy();

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
