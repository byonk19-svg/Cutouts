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
  await expect(proposalCard.getByRole("button", { name: /Accept/i })).toHaveCount(0);
  await expect(proposalCard.getByRole("button", { name: /Request/i })).toHaveCount(0);
  await expect.poll(() => requestCount).toBe(1);
  await expect.poll(() => detailCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(acceptedDetailBefore);
});

test("technically valid AI proposal keeps the workflow locked for maker review", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const source = readFileSync("backend/tests/fixtures/coraline/coraline-best-clean-outline.png");
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
  await page.route("**/api/generate-linework", (route) => route.fulfill({
    json: {
      status: "pending-review",
      validationIssues: [],
      canReplaceAcceptedDetail: false,
      proposalPreviewPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
      proposalDetailPngDataUrl: `data:image/png;base64,${source.toString("base64")}`,
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
  await expect(page.getByRole("button", { name: "Looks Good - Continue to Colors" })).toBeDisabled();
});
