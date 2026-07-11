# Trace Acceptance UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auto-starter cleanup open centered and usable, distinguish technical exportability from craft cleanup, and defer Paint Guide controls until tracing is accepted.

**Architecture:** Keep viewport math in `traceViewport.ts` and fix the existing pending-fit lifecycle in `main.tsx` instead of adding a second fit path. Extend the pure Trace Quality model with cleanup-review state, then use one controlled Paint Guide disclosure whose automatic expansion is driven by the existing cleanup checklist while preserving manual toggling.

**Tech Stack:** React 19, TypeScript, Vite, Node test scripts, Playwright.

---

## File Map

- Modify `src/main.tsx`: execute pending fit for every editable trace mode, pass cleanup acceptance into Trace Quality Review, and wrap paint-specific content in a controlled disclosure.
- Modify `src/traceViewport.ts`: support a target content-height ratio in the existing fit calculation.
- Modify `src/traceQuality.ts`: expose technical export readiness and detail-cleanup status as separate fields.
- Modify `src/styles.css`: style the Paint Guide disclosure and keep its summary compact.
- Modify `tests/traceViewport.test.ts`: prove tall content fits to the target editor-height range.
- Modify `tests/traceQuality.test.ts`: prove technical readiness and cleanup review are independent.
- Modify `tests/e2e/mvp-workflow.spec.ts`: prove auto-starter fit runs and Paint Guide disclosure follows acceptance.

### Task 1: Fit Auto-Starter Content

**Files:**
- Modify: `tests/traceViewport.test.ts`
- Modify: `src/traceViewport.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing viewport test**

Add a case that calls `fitBoundsToViewport` for tall content with a target fill of `0.8`, derives the displayed content height from the returned zoom, and asserts that the content occupies between 70% and 85% of the viewport height and remains centered.

```ts
const viewportSize = { width: 620, height: 520 };
const canvasSize = { width: 800, height: 1200 };
const bounds = { left: 250, top: 60, right: 430, bottom: 1140 };
const fitted = fittedTraceSize(canvasSize, viewportSize);
const viewport = fitBoundsToViewport(bounds, canvasSize, viewportSize, 0.8);
const contentHeight = ((bounds.bottom - bounds.top) / canvasSize.height) * fitted.height * viewport.zoom;

assert(contentHeight >= viewportSize.height * 0.70, "fit should use at least 70% of editor height");
assert(contentHeight <= viewportSize.height * 0.85, "fit should leave cleanup breathing room");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types tests/traceViewport.test.ts`

Expected: FAIL because the current fourth parameter is fixed pixel padding and cannot express the target fill ratio.

- [ ] **Step 3: Implement target-ratio fitting**

Change `fitBoundsToViewport` to accept an options object and compute available dimensions from both minimum padding and the target fill ratio.

```ts
export type TraceFitOptions = {
  paddingPx?: number;
  targetFill?: number;
};

export function fitBoundsToViewport(
  bounds: TraceBounds,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  { paddingPx = 48, targetFill = 0.8 }: TraceFitOptions = {}
): TraceViewport {
  const availableWidth = Math.max(1, Math.min(viewportSize.width - paddingPx * 2, viewportSize.width * targetFill));
  const availableHeight = Math.max(1, Math.min(viewportSize.height - paddingPx * 2, viewportSize.height * targetFill));
  // retain the existing normalized bounds, zoom clamp, and centering logic
}
```

Update existing test calls from `50` to `{ paddingPx: 50 }` and the editor call to `{ paddingPx: 32, targetFill: 0.8 }`.

- [ ] **Step 4: Remove the incorrect mode gate**

In the pending-fit effect, remove `!traceStudioOpen` from the early-return condition so Simple, Balanced, Detailed, and blank Trace Studio all execute the fit that `analyze()` already requests.

```ts
if (!pendingContentFitRef.current || !analysis || !editorOpen || !cutlineBounds) return;
```

- [ ] **Step 5: Run viewport tests and build**

Run: `node --experimental-strip-types tests/traceViewport.test.ts`

Expected: PASS.

Run: `corepack pnpm build`

Expected: TypeScript and Vite build succeed.

### Task 2: Separate Technical Readiness from Cleanup Acceptance

**Files:**
- Modify: `tests/traceQuality.test.ts`
- Modify: `src/traceQuality.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing Trace Quality tests**

Pass `detailCleanupAccepted: false` for a valid starter-detail analysis and assert:

```ts
assertEqual(review.exportReadiness, "Technically ready to export", "valid layers should report technical exportability");
assertEqual(review.detailCleanupStatus, "Review recommended", "unaccepted starter lines should request cleanup review");
```

Add a second case with `detailCleanupAccepted: true` and assert `detailCleanupStatus === "Accepted"`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --experimental-strip-types tests/traceQuality.test.ts`

Expected: FAIL because `detailCleanupAccepted`, `detailCleanupStatus`, and the revised readiness label do not exist.

- [ ] **Step 3: Extend the pure review model**

Add the input and output fields and keep export validity independent from cleanup acceptance.

```ts
export type TraceQualityReviewInput = {
  // existing fields
  detailCleanupAccepted?: boolean;
};

export type TraceQualityReview = {
  // existing fields
  exportReadiness: "Technically ready to export" | "Good for outside cutline, incomplete for paint/details" | "Regenerate cutline first";
  detailCleanupStatus: "Review recommended" | "Accepted";
};
```

Return `Accepted` only when `detailCleanupAccepted` is true. Return `Technically ready to export` when the vector cutline and at least one detail layer exist.

- [ ] **Step 4: Wire acceptance into the UI**

Define trace cleanup acceptance from the existing checklist:

```ts
const detailCleanupAccepted = cleanupChecks.cutline && cleanupChecks.remove && cleanupChecks.draw;
```

Pass it into `buildTraceQualityReview()` and render a new `Detail cleanup` row beneath `Export readiness`.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types tests/traceQuality.test.ts`

Expected: PASS.

### Task 3: Collapse Paint Guide Until Trace Acceptance

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Modify: `tests/e2e/mvp-workflow.spec.ts`

- [ ] **Step 1: Write failing browser assertions**

After Balanced analysis, assert that the `Paint Guide` disclosure is closed and paint-match controls are hidden. Check the first three cleanup items, then assert the disclosure opens and Paint Match Review becomes visible.

```ts
const paintGuide = page.getByLabel("Paint Guide");
await expect(paintGuide).not.toHaveAttribute("open", "");
await expect(page.getByLabel("Paint Match Review")).toBeHidden();

for (const label of ["Review cutline", "Remove extra marks", "Draw missing details"]) {
  await page.getByLabel(label).check();
}

await expect(paintGuide).toHaveAttribute("open", "");
await expect(page.getByLabel("Paint Match Review")).toBeVisible();
```

- [ ] **Step 2: Run the E2E test and verify RED**

Run: `corepack pnpm test:e2e -- --grep "MVP workflow"`

Expected: FAIL because Paint Guide is not a disclosure and all paint controls remain visible.

- [ ] **Step 3: Add controlled disclosure state**

Add `paintGuideOpen`, reset it to false when a new analysis starts, and expand it when trace cleanup becomes accepted without preventing later manual toggling.

```ts
const [paintGuideOpen, setPaintGuideOpen] = useState(false);

useEffect(() => {
  if (detailCleanupAccepted) setPaintGuideOpen(true);
}, [detailCleanupAccepted]);
```

Keep Trace Quality Review and Template Cleanup outside the disclosure. Wrap the finished-size summary and all paint-specific sections in:

```tsx
<details
  className="paint-guide-disclosure"
  aria-label="Paint Guide"
  open={paintGuideOpen}
  onToggle={(event) => setPaintGuideOpen(event.currentTarget.open)}
>
  <summary>
    <SwatchBook size={18} />
    <span>Paint Guide</span>
    <small>{paintGuideEntries.length} colors</small>
  </summary>
  <div className="paint-guide-content">...</div>
</details>
```

- [ ] **Step 4: Add disclosure styling**

Use an 8px-or-smaller radius, restrained border, stable summary height, and no nested card treatment.

```css
.paint-guide-disclosure {
  border-top: 1px solid #dce4df;
}

.paint-guide-disclosure > summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.paint-guide-content {
  display: grid;
  gap: 16px;
  padding-top: 12px;
}
```

- [ ] **Step 5: Run E2E and frontend validation**

Run: `corepack pnpm test:e2e -- --grep "MVP workflow"`

Expected: PASS.

Run: `corepack pnpm test`

Expected: 55 backend tests and all TypeScript test scripts pass.

Run: `corepack pnpm build`

Expected: TypeScript and Vite build succeed.

### Task 4: Browser Acceptance Evidence

**Files:**
- Create: `output/screenshots/latest/coraline-balanced-original-on.png`
- Create: `output/screenshots/latest/coraline-balanced-original-off.png`
- Create: `output/screenshots/latest/coraline-balanced-print-preview.png`
- Create: `output/screenshots/latest/coraline-balanced-paint-guide-collapsed.png`
- Create: `output/screenshots/latest/coraline-balanced-paint-guide-expanded.png`

- [ ] **Step 1: Restart the app and load the Coraline-style fixture**

Run the backend and frontend with `corepack pnpm dev:backend` and `corepack pnpm dev:frontend`, then open `http://127.0.0.1:5173/` in the in-app browser.

- [ ] **Step 2: Verify framing**

Generate Balanced starter lines and measure the visible subject bounds relative to `.trace-editor-viewport`. Confirm the subject occupies 70-85% of viewport height and its center is within 10% of the viewport center on both axes.

- [ ] **Step 3: Capture required states**

Capture original on, original off, printable preview, collapsed Paint Guide, and expanded Paint Guide after checking the first three cleanup steps. Keep the same desktop viewport for direct comparison and repeat framing at a narrow viewport.

- [ ] **Step 4: Record acceptance decision**

Report whether the underlay-off head/face lines remain genuinely noisy and whether click-to-remove can isolate bad marks without deleting useful connected lines. Do not tune tracing algorithms in this task.

### Task 5: Final Verification and Commit

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run complete verification**

Run: `corepack pnpm test`

Expected: all tests pass.

Run: `corepack pnpm build`

Expected: production build succeeds.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 2: Review scope**

Confirm the diff contains no backend tracing or preset-algorithm changes and that Paint Guide state changes do not reset palette edits.

- [ ] **Step 3: Commit**

```powershell
git add src/main.tsx src/traceViewport.ts src/traceQuality.ts src/styles.css tests/traceViewport.test.ts tests/traceQuality.test.ts tests/e2e/mvp-workflow.spec.ts output/screenshots/latest
git commit -m "Improve trace acceptance workflow"
```

