# Full-Color SVG Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop full-color compound-path SVG artwork from being degraded by the authored-black-ink fast path while preserving that fast path for genuine line art.

**Architecture:** Keep SVG safety validation and local rasterization unchanged. Add a pure rendered-pixel classifier for substantial multi-color artwork, use it as a conservative gate in `prepareSvgFastPathUpload`, and let rejected fast-path inputs continue through the existing rendered-art backend analysis.

**Tech Stack:** TypeScript, browser Canvas 2D, React upload flow, Node TypeScript tests, Playwright Chromium.

---

## File Structure

- Modify `src/svgFastPath.ts`: own the pure chromatic-artwork measurement and apply it to the existing SVG fast-path decision.
- Modify `src/main.tsx`: carry the SVG classification decision into analysis so full-color SVGs cannot be reclassified by backend `auto` mode.
- Modify `tests/svgFastPath.test.ts`: cover multi-color compound artwork and genuine line-art pixel patterns with deterministic synthetic RGBA buffers.
- Modify `tests/e2e/mvp-workflow.spec.ts`: prove browser-visible routing for a realistic full-color compound-path SVG while preserving genuine authored linework behavior.

### Task 1: Add the pure full-color artwork classifier

**Files:**
- Modify: `tests/svgFastPath.test.ts`
- Modify: `src/svgFastPath.ts`

- [ ] **Step 1: Write the failing unit test**

Import a wished-for `hasSubstantialChromaticArtwork` function and build small
RGBA buffers directly in the test. Assert that two substantial, separated hue
families plus thin black ink return `true`, while black linework and a single
small colored accent return `false`.

```ts
import {
  hasSubstantialChromaticArtwork,
  isSvgFile,
  validateSvgMarkup
} from "../src/svgFastPath.ts";

const colorful = solidPixels(100, 100, [255, 255, 255, 255]);
paintRect(colorful, 100, { left: 10, top: 10, right: 48, bottom: 90 }, [220, 45, 45, 255]);
paintRect(colorful, 100, { left: 52, top: 10, right: 90, bottom: 90 }, [35, 150, 210, 255]);
paintRect(colorful, 100, { left: 48, top: 10, right: 52, bottom: 90 }, [15, 15, 15, 255]);
assert(hasSubstantialChromaticArtwork(colorful, 100, 100), "multi-color filled artwork must avoid the authored-ink fast path");

const lineArt = solidPixels(100, 100, [255, 255, 255, 255]);
paintRect(lineArt, 100, { left: 48, top: 10, right: 52, bottom: 90 }, [15, 15, 15, 255]);
assert(!hasSubstantialChromaticArtwork(lineArt, 100, 100), "black line art must retain the authored-ink fast path");
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `node --experimental-strip-types tests/svgFastPath.test.ts`

Expected: FAIL because `hasSubstantialChromaticArtwork` is not exported.

- [ ] **Step 3: Implement the minimum pure classifier**

Add an exported function in `src/svgFastPath.ts` that ignores transparent,
near-white, neutral, and very dark pixels; bins remaining pixels by coarse hue;
and returns `true` only when total chromatic coverage and at least two
substantial hue bins cross named conservative thresholds.

```ts
const MIN_CHROMATIC_COVERAGE = 0.04;
const MIN_CHROMATIC_HUE_COVERAGE = 0.01;
const MIN_CHROMATIC_ALPHA = 200;
const MIN_CHROMA = 40;
const MIN_CHROMATIC_BRIGHTNESS = 80;
const MIN_WHITE_CHANNEL = 235;

export function hasSubstantialChromaticArtwork(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) {
  const pixelCount = width * height;
  if (pixelCount < 1 || pixels.length < pixelCount * 4) return false;
  const hueBins = new Uint32Array(12);
  let chromaticPixels = 0;
  for (let index = 0; index < pixelCount * 4; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    if (
      alpha < MIN_CHROMATIC_ALPHA
      || minimum >= MIN_WHITE_CHANNEL
      || maximum <= MIN_CHROMATIC_BRIGHTNESS
      || chroma < MIN_CHROMA
    ) continue;
    const hue = maximum === red
      ? 60 * (((green - blue) / chroma) % 6)
      : maximum === green
        ? 60 * ((blue - red) / chroma + 2)
        : 60 * ((red - green) / chroma + 4);
    const normalizedHue = (hue + 360) % 360;
    hueBins[Math.min(hueBins.length - 1, Math.floor(normalizedHue / 30))] += 1;
    chromaticPixels += 1;
  }
  const substantialBinPixels = Math.ceil(pixelCount * MIN_CHROMATIC_HUE_COVERAGE);
  const substantialBins = hueBins.filter((count) => count >= substantialBinPixels).length;
  return chromaticPixels / pixelCount >= MIN_CHROMATIC_COVERAGE && substantialBins >= 2;
}
```

Use constants named for total coverage, per-hue coverage, alpha, whiteness, and
minimum chroma so the classification policy is explicit and testable.

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `node --experimental-strip-types tests/svgFastPath.test.ts`

Expected: PASS with `svg fast path tests passed`.

### Task 2: Apply the classifier to actual SVG upload routing

**Files:**
- Modify: `tests/e2e/mvp-workflow.spec.ts`
- Modify: `src/svgFastPath.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing browser regression test**

Add a synthetic SVG with a colored silhouette, a red garment region, a blue
prop region, and thin black compound-path ink. Assert it is not labeled `SVG
linework detected`, generates through the ordinary analysis path, and reports
`Needs simplification` rather than `Ready line art`.

```ts
test("full-color compound-path SVG uses rendered-art analysis", async ({ page }) => {
  await page.goto("/");
  const uploadStep = page.getByLabel("Upload step");
  await uploadStep.getByLabel("Source image").setInputFiles({
    name: "full-color-compound-character.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
        <rect width="400" height="600" fill="white"/>
        <path d="M80 550 L75 220 Q200 40 325 220 L320 550 Z" fill="#e7b27c"/>
        <path d="M85 390 H315 V535 H85 Z" fill="#d92f35"/>
        <path d="M210 160 H300 V360 H210 Z" fill="#279bd4"/>
        <path d="M75 220 H325 V228 H75 Z M75 542 H325 V550 H75 Z M75 220 H83 V550 H75 Z M317 220 H325 V550 H317 Z M130 280 H270 V288 H130 Z" fill="#111"/>
      </svg>
    `)
  });
  await expect(uploadStep.getByText("SVG linework detected")).toHaveCount(0);
  await uploadStep.getByRole("button", { name: "Generate Template" }).click();
  await expect(page.getByLabel("Input readiness")).toContainText("Needs simplification");
  await expect(page.getByLabel("Input readiness")).not.toContainText("Ready line art");
});
```

- [ ] **Step 2: Run the focused browser test and verify RED**

Run: `pnpm test:e2e -- --grep "full-color compound-path" --workers=1`

Expected: FAIL because the current dark-ink-only decision labels the fixture as
authored linework.

- [ ] **Step 3: Gate the existing fast-path decision**

In `prepareSvgFastPathUpload`, read the classification canvas pixels once,
require both the existing linework morphology and absence of substantial
chromatic artwork, and return a rendered-mode override for full-color SVGs.

```ts
const classificationPixels = classificationContext.getImageData(
  0,
  0,
  classificationCanvas.width,
  classificationCanvas.height
).data;
const substantialChromaticArtwork = hasSubstantialChromaticArtwork(
  classificationPixels,
  classificationCanvas.width,
  classificationCanvas.height
);
const useAuthoredInk = sourceInkDataUrl !== null
  && darkInkLooksLikeLinework(classificationCanvas)
  && !substantialChromaticArtwork;

return {
  sourceFile,
  sourceDataUrl,
  authoredSvgMarkup: useAuthoredInk ? markup : null,
  readinessEvidence: darkInkStats.inkPixels < MIN_INK_PIXELS
    ? null
    : useAuthoredInk ? "ready-line-art" : "needs-simplification",
  detailExtractionModeOverride: substantialChromaticArtwork ? "rendered" : null
};
```

Extend `PreparedSourceCandidate` in `src/main.tsx` with
`detailExtractionModeOverride: Settings["detailExtractionMode"] | null`. Copy
the prepared SVG value into the candidate, use `null` for raster candidates,
and merge the override into the settings sent to `/api/analyze`:

```ts
const requestedSettings = settingsOverride ?? (preset ? detailPresetSettings(preset, settings) : settings);
const nextSettings = candidate?.detailExtractionModeOverride
  ? { ...requestedSettings, detailExtractionMode: candidate.detailExtractionModeOverride }
  : requestedSettings;
```

Do not change SVG validation, PDF geometry, export behavior, provider behavior,
or the backend tracing thresholds in this task.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
node --experimental-strip-types tests/svgFastPath.test.ts
pnpm test:e2e -- --grep "authored SVG|filled compound|full-color compound|filled-color SVG|large solid SVG" --workers=1
```

Expected: all selected unit and Chromium tests pass.

- [ ] **Step 5: Commit the focused routing fix**

```text
git add src/svgFastPath.ts src/main.tsx tests/svgFastPath.test.ts tests/e2e/mvp-workflow.spec.ts
git commit -m "fix: route full-color SVGs through rendered analysis"
```

### Task 3: Validate real files and the repository

**Files:**
- No copyrighted source files are added or modified.
- No production files beyond `src/svgFastPath.ts` are changed unless a failing
  acceptance result proves the corrected route requires an in-scope adjustment.

- [ ] **Step 1: Run standard automated verification**

Run:

```text
pnpm lint
pnpm typecheck
pnpm typecheck:tests
pnpm test
pnpm build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Validate local SVG routing in a real browser**

Upload Band Member, Cindy, and Car individually from their existing local
paths. For each file, confirm the upload step no longer claims `SVG linework
detected`, generate with default settings, and capture the initial Clean Lines
result before editing.

- [ ] **Step 3: Judge the corrected output against the field-test defect**

For each source, record whether the rendered-art route produces a coherent
outer character/vehicle line, preserves major face/body/prop boundaries, and
avoids detached exterior fragments. If the route is correct but boundary
output still fails, stop and report that separate demonstrated pipeline defect
instead of adding speculative classifier or tracing changes.

- [ ] **Step 4: Inspect the final diff and working tree**

Run:

```text
git status --short
git diff -- src/svgFastPath.ts tests/svgFastPath.test.ts tests/e2e/mvp-workflow.spec.ts
git diff --check
```

Expected: only the approved SVG-import work plus the two pre-existing pipeline
files remain modified; no copyrighted sources or generated artifacts appear.
