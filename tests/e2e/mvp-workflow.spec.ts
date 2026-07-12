import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

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
  await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles({
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
  await expect(page.getByLabel("Clean Lines instruction")).toContainText("Click a line to remove it");
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
  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  await expect(primaryControls.getByRole("button")).toHaveCount(6);
  await page.setViewportSize({ width: 1440, height: 1100 });

  await moreTools.locator("summary").click();
  const traceStyleChoices = page.getByLabel("Trace style");
  await expect(traceStyleChoices.getByRole("button", { name: /Balanced/ })).toHaveClass(/selected/);
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
  const paintGuideSummary = paintGuide.locator(".paint-guide-disclosure-summary");
  await paintGuideSummary.click();
  await expect.poll(async () => paintGuide.evaluate((element) => element instanceof HTMLDetailsElement && element.open)).toBe(false);
  await expect(paintReview).toBeHidden();
  await paintGuideSummary.click();
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
  await expect.poll(async () => paintGuide.evaluate((element) => element instanceof HTMLDetailsElement && element.open)).toBe(true);

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

  await page.getByRole("button", { name: "Colors Look Good - Continue to Export" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toHaveAttribute("aria-current", "step");
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
