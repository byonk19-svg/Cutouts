import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";


test("maker explicitly confirms one review-only AI proposal without changing accepted lines", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const normalizedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  await page.getByLabel("Source image").setInputFiles({
    name: "needs-simplification.png",
    mimeType: "image/png",
    buffer: source
  });
  await page.getByRole("button", { name: "Generate Template" }).click();

  await expect(page.getByLabel("AI-assisted linework proposal")).toHaveCount(0);
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);

  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await expect(proposalCard).toContainText("Needs Simplification");
  const detailCanvas = page.getByLabel("Editable interior detail lines");
  const acceptedDetailBefore = await detailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());

  let requestCount = 0;
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/generate-linework", async (route) => {
    requestCount += 1;
    const posted = route.request().postDataBuffer()?.toString("utf-8") ?? "";
    expect(posted).toContain('"uploadConfirmed":true');
    expect(posted).toContain('"estimatedCostUsd":0.1');
    await responseGate;
    await route.fulfill({
      json: {
        status: "review-only",
        validationIssues: ["dense"],
        canReplaceAcceptedDetail: false,
        proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
        proposalDetailPngDataUrl: `data:image/png;base64,${normalizedDetail.toString("base64")}`,
        inkCoverage: 0.31,
        suppressedPixelCount: 12,
        previewWidthPx: 359,
        previewHeightPx: 900,
        model: "gpt-image-1.5",
        provider: "openai",
        estimatedCostUsd: 0.1
      }
    });
  });

  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await expect(proposalCard).toContainText("Your source image will be uploaded to OpenAI");
  await expect(proposalCard).toContainText("Exact estimated cost: $0.10");
  expect(requestCount).toBe(0);

  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard.getByRole("status")).toContainText("one request is in progress");
  await expect(page.getByRole("button", { name: "Looks Good - Continue to Colors" })).toBeDisabled();
  releaseResponse?.();

  await expect(proposalCard).toContainText("Review only");
  await expect(proposalCard).toContainText("dense");
  await expect(proposalCard.getByRole("img", { name: "AI linework proposal" })).toBeVisible();
  await expect(proposalCard.getByRole("img", { name: "AI linework proposal" })).toHaveAttribute(
    "src",
    `data:image/png;base64,${normalizedDetail.toString("base64")}`
  );
  await expect(proposalCard.getByRole("button", { name: "AI lines only" })).toBeVisible();
  await expect(proposalCard.getByRole("button", { name: "Original Overlay" })).toBeVisible();
  await expect(proposalCard.getByRole("button", { name: "Print Preview" })).toBeVisible();
  await expect(proposalCard.getByRole("button", { name: /Accept/i })).toHaveCount(0);
  await expect(proposalCard.getByRole("button", { name: "Request another proposal" })).toBeVisible();
  await expect.poll(() => requestCount).toBe(1);
  await expect.poll(() => detailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);
});

test("maker reviews all views, explicitly accepts once, and undoes back to the prior accepted layer", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const normalizedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  await page.getByLabel("Source image").setInputFiles({
    name: "pending-review.png",
    mimeType: "image/png",
    buffer: source
  });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const canvas = page.getByLabel("Editable interior detail lines");
  const width = Number(await canvas.getAttribute("width"));
  const height = Number(await canvas.getAttribute("height"));
  const acceptedDetailBefore = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const protectedCutline = page.locator(".outer-line-layer");
  const protectedCutlineBefore = await protectedCutline.getAttribute("src");
  const projectBefore = await savedProject(page);
  await page.route("**/api/generate-linework", (route) => route.fulfill({
    json: {
      status: "pending-review",
      validationIssues: [],
      canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
      proposalDetailPngDataUrl: `data:image/png;base64,${normalizedDetail.toString("base64")}`,
      inkCoverage: 0.04,
      suppressedPixelCount: 21,
      previewWidthPx: width,
      previewHeightPx: height,
      model: "gpt-image-1.5",
      provider: "openai",
      estimatedCostUsd: 0.1
    }
  }));

  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();

  await expect(proposalCard).toContainText("Ready for visual review");
  const acceptProposal = proposalCard.getByRole("button", { name: "Accept AI Detail Lines" });
  await expect(acceptProposal).toBeDisabled();
  await expect(page.getByRole("button", { name: "Looks Good - Continue to Colors" })).toBeDisabled();

  await proposalCard.getByRole("button", { name: "Original Overlay" }).click();
  await expect(proposalCard.getByRole("button", { name: "Original Overlay" })).toHaveAttribute("aria-pressed", "true");
  const originalOverlayReview = proposalCard.getByLabel("Original Overlay review");
  await expect(originalOverlayReview).toBeVisible();
  await expect.poll(() => originalOverlayReview.getByRole("img", { name: "AI linework proposal" }).evaluate(
    (image) => getComputedStyle(image).backgroundColor
  )).toBe("rgba(0, 0, 0, 0)");
  await expect(acceptProposal).toBeDisabled();
  await proposalCard.getByRole("button", { name: "Print Preview" }).click();
  await expect(proposalCard.getByLabel("Print Preview review")).toBeVisible();
  await expect(acceptProposal).toBeEnabled();

  await acceptProposal.click();
  await expect(proposalCard).toContainText("Proposal accepted");
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(acceptedDetailBefore);
  await expect.poll(async () => (await savedProject(page)).editedDetailPngDataUrl).toBe(
    `data:image/png;base64,${normalizedDetail.toString("base64")}`
  );
  await expect(protectedCutline).toHaveAttribute("src", protectedCutlineBefore ?? "");
  await expect.poll(async () => (await savedProject(page)).projectPalette).toEqual(projectBefore.projectPalette);
  await expect.poll(async () => (await savedProject(page)).manualStrokes).toEqual(projectBefore.manualStrokes);
  await expect.poll(async () => (await savedProject(page)).analysis.outerCutPath).toBe(projectBefore.analysis.outerCutPath);
  await expect(page.getByRole("button", { name: "Looks Good - Continue to Colors" })).toBeEnabled();

  const guidedWorkflow = page.getByLabel("Guided workflow");
  await page.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toHaveAttribute("aria-current", "step");
  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  const undo = page.getByLabel("Clean Lines primary controls").getByRole("button", { name: "Undo" });
  await undo.click();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);
  await expect(undo).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
});

test("rejecting and requesting a later proposal preserves accepted work", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const normalizedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  await page.getByLabel("Source image").setInputFiles({ name: "later-request.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const canvas = page.getByLabel("Editable interior detail lines");
  const acceptedDetailBefore = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const width = Number(await canvas.getAttribute("width"));
  const height = Number(await canvas.getAttribute("height"));
  let requestCount = 0;
  await page.route("**/api/generate-linework", (route) => {
    requestCount += 1;
    return route.fulfill({ json: {
      status: "pending-review",
      validationIssues: [],
      canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
      proposalDetailPngDataUrl: `data:image/png;base64,${normalizedDetail.toString("base64")}`,
      inkCoverage: 0.04,
      suppressedPixelCount: 21,
      previewWidthPx: width,
      previewHeightPx: height,
      model: "gpt-image-1.5",
      provider: "openai",
      estimatedCostUsd: 0.1
    } });
  });

  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard).toContainText("Ready for visual review");
  await proposalCard.getByRole("button", { name: "Reject proposal" }).click();
  await expect(proposalCard).toContainText("Proposal rejected");
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);

  await proposalCard.getByRole("button", { name: "Request another proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard).toContainText("Ready for visual review");
  expect(requestCount).toBe(2);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);
});

test("request failure preserves accepted work and sends no automatic retry", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  await page.getByLabel("Source image").setInputFiles({ name: "failed-request.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const canvas = page.getByLabel("Editable interior detail lines");
  const acceptedDetailBefore = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const projectBefore = await savedProject(page);
  let requestCount = 0;
  await page.route("**/api/generate-linework", (route) => {
    requestCount += 1;
    return route.fulfill({ status: 503, json: { error: "Provider unavailable for this test." } });
  });

  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard.getByRole("alert")).toContainText("Provider unavailable for this test.");
  await expect(proposalCard.getByRole("alert")).toContainText("No retry was sent");
  await page.waitForTimeout(500);
  expect(requestCount).toBe(1);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);
  await expect.poll(async () => (await savedProject(page)).manualStrokes).toEqual(projectBefore.manualStrokes);
});

test("an existing review milestone cannot bypass pending proposal gating", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const normalizedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  await page.getByLabel("Source image").setInputFiles({ name: "already-reviewed.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const guidedWorkflow = page.getByLabel("Guided workflow");
  await page.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await page.getByLabel("Colors workspace").getByRole("button", { name: "Skip Paint Guide" }).click();
  await guidedWorkflow.getByRole("button", { name: /Clean Lines/ }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeEnabled();

  const canvas = page.getByLabel("Editable interior detail lines");
  const width = Number(await canvas.getAttribute("width"));
  const height = Number(await canvas.getAttribute("height"));
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/generate-linework", async (route) => {
    await responseGate;
    await route.fulfill({ json: {
      status: "pending-review", validationIssues: [], canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
      proposalDetailPngDataUrl: `data:image/png;base64,${normalizedDetail.toString("base64")}`,
      inkCoverage: 0.04, suppressedPixelCount: 21, previewWidthPx: width, previewHeightPx: height,
      model: "gpt-image-1.5", provider: "openai", estimatedCostUsd: 0.1
    } });
  });
  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard.getByRole("status")).toBeVisible();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toBeDisabled();
  releaseResponse?.();
  await expect(proposalCard).toContainText("Ready for visual review");
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeDisabled();
  await expect(guidedWorkflow.getByRole("button", { name: /Export/ })).toBeDisabled();
  await proposalCard.getByRole("button", { name: "Reject proposal" }).click();
  await expect(guidedWorkflow.getByRole("button", { name: /Colors/ })).toBeEnabled();
});

test("a proposal response is ignored after the source project is replaced", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const normalizedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  await page.getByLabel("Source image").setInputFiles({ name: "project-a.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  let moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const canvas = page.getByLabel("Editable interior detail lines");
  const width = Number(await canvas.getAttribute("width"));
  const height = Number(await canvas.getAttribute("height"));
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/generate-linework", async (route) => {
    await responseGate;
    await route.fulfill({ json: {
      status: "pending-review", validationIssues: [], canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
      proposalDetailPngDataUrl: `data:image/png;base64,${normalizedDetail.toString("base64")}`,
      inkCoverage: 0.04, suppressedPixelCount: 21, previewWidthPx: width, previewHeightPx: height,
      model: "gpt-image-1.5", provider: "openai", estimatedCostUsd: 0.1
    } });
  });
  let proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard.getByRole("status")).toBeVisible();

  const guidedWorkflow = page.getByLabel("Guided workflow");
  await guidedWorkflow.getByRole("button", { name: /Upload/ }).click();
  await page.getByLabel("Source image").setInputFiles({ name: "project-b.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  proposalCard = page.getByLabel("AI-assisted linework proposal");
  await expect(proposalCard).toContainText("Needs Simplification");
  releaseResponse?.();
  await page.waitForTimeout(500);
  await expect(proposalCard).toContainText("Needs Simplification");
  await expect(proposalCard).not.toContainText("Ready for visual review");
});

test("exports only accepted AI Detail Lines to SVG and PDF", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
  const rejectedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-cut-only-outline.png");
  const acceptedDetail = readFileSync("backend/tests/fixtures/coraline/coraline-detail-layer.png");
  const rejectedDataUrl = `data:image/png;base64,${rejectedDetail.toString("base64")}`;
  const acceptedDataUrl = `data:image/png;base64,${acceptedDetail.toString("base64")}`;
  await page.getByLabel("Source image").setInputFiles({ name: "accepted-export.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Generate Template" }).click();
  const moreTools = page.getByLabel("More Tools");
  await moreTools.locator("summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST"),
    moreTools.getByLabel("Image type").getByRole("button", { name: "Rendered image" }).click()
  ]);
  const canvas = page.getByLabel("Editable interior detail lines");
  const width = Number(await canvas.getAttribute("width"));
  const height = Number(await canvas.getAttribute("height"));
  let requestCount = 0;
  await page.route("**/api/generate-linework", (route) => {
    const detailDataUrl = requestCount++ === 0 ? rejectedDataUrl : acceptedDataUrl;
    return route.fulfill({ json: {
      status: "pending-review", validationIssues: [], canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: detailDataUrl,
      proposalDetailPngDataUrl: detailDataUrl,
      inkCoverage: 0.04, suppressedPixelCount: 21, previewWidthPx: width, previewHeightPx: height,
      model: "gpt-image-1.5", provider: "openai", estimatedCostUsd: 0.1
    } });
  });

  const proposalCard = page.getByLabel("AI-assisted linework proposal");
  await proposalCard.getByRole("button", { name: "Request AI proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await expect(proposalCard).toContainText("Ready for visual review");
  await proposalCard.getByRole("button", { name: "Reject proposal" }).click();
  await proposalCard.getByRole("button", { name: "Request another proposal" }).click();
  await proposalCard.getByRole("button", { name: "Confirm upload and request one proposal" }).click();
  await proposalCard.getByRole("button", { name: "AI Lines Only" }).click();
  await proposalCard.getByRole("button", { name: "Original Overlay" }).click();
  await proposalCard.getByRole("button", { name: "Print Preview" }).click();
  await proposalCard.getByRole("button", { name: "Accept AI Detail Lines" }).click();

  await page.getByRole("button", { name: "Looks Good - Continue to Colors" }).click();
  await page.getByLabel("Colors workspace").getByRole("button", { name: "Skip Paint Guide" }).click();
  const exportWorkspace = page.getByLabel("Export workspace");
  const moreExportOptions = exportWorkspace.getByLabel("More Export Options");
  await moreExportOptions.locator("summary").click();
  const svgDownloadPromise = page.waitForEvent("download");
  await moreExportOptions.getByRole("button", { name: "Download SVG Linework" }).click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  const svg = readFileSync(svgPath ?? "", "utf-8");
  expect(svg).toContain('id="accepted-detail-layer"');
  expect(svg).toContain(acceptedDataUrl);
  expect(svg).not.toContain(rejectedDataUrl);

  const pdfRequestPromise = page.waitForRequest((request) => request.url().endsWith("/api/export") && request.method() === "POST");
  const pdfDownloadPromise = page.waitForEvent("download");
  await exportWorkspace.getByRole("button", { name: "Download Printable PDF" }).click();
  const [pdfRequest, pdfDownload] = await Promise.all([pdfRequestPromise, pdfDownloadPromise]);
  const pdfMultipart = pdfRequest.postDataBuffer()?.toString("utf-8") ?? "";
  expect(pdfMultipart).toContain(acceptedDataUrl);
  expect(pdfMultipart).not.toContain(rejectedDataUrl);
  expect((await pdfDownload.path()) ?? "").toBeTruthy();
});

async function savedProject(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("cutout-studio:auto-save:v1"))).not.toBeNull();
  return page.evaluate(() => JSON.parse(localStorage.getItem("cutout-studio:auto-save:v1") ?? "{}"));
}
