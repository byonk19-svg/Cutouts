# AI Linework Ticket 02 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, reversible maker review/apply lifecycle for ticket-01 AI linework proposals without expanding provider or export authority.

**Architecture:** Keep the proposal lifecycle in a small pure TypeScript module and let `main.tsx` adapt it to the existing canvas/history/workflow state. The review card owns the three required visual modes; only a technically valid proposal whose three views were visited can be accepted. Applying swaps only the editable detail raster, records the prior raster once in the existing history stack, and leaves analysis geometry, paint state, and manual stroke state untouched.

**Tech Stack:** React 19, TypeScript, Vite, Node assertion-style unit tests, Playwright Chromium.

---

### Task 1: Define the proposal review state machine

**Files:**
- Create: `src/aiLineworkReview.ts`
- Create: `tests/aiLineworkReview.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing lifecycle tests**

Cover pending initialization with AI-lines-only visited, required Original Overlay and Print Preview visits, review-only refusal, explicit acceptance, rejection, and later-request reset.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types tests/aiLineworkReview.test.ts`

Expected: FAIL because `src/aiLineworkReview.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure lifecycle module**

Export explicit review views, state constructors/transitions, `canAcceptAiProposal`, and an acceptance transition that is unavailable for review-only proposals.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --experimental-strip-types tests/aiLineworkReview.test.ts`

Expected: PASS.

### Task 2: Wire review, apply, reject, undo, and workflow gating

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Modify: `tests/e2e/ai-linework-proposal.spec.ts`

- [ ] **Step 1: Write failing browser tests**

Add credential-free routed responses proving all three review views, disabled Accept until every view is visited, explicit acceptance, exactly one Undo restoration, review-only no-accept, rejection, later-request preservation, and Clean Lines gating. Capture geometry, paint, and canvas/stroke evidence before the lifecycle actions.

- [ ] **Step 2: Run the focused Playwright spec and verify RED**

Run: `pnpm test:e2e -- tests/e2e/ai-linework-proposal.spec.ts`

Expected: FAIL on missing review controls and actions.

- [ ] **Step 3: Implement the UI adapter**

Render AI-lines-only, Original Overlay, and Print Preview from existing source/proposal/cutline assets. Accept only via the pure lifecycle guard; save the current editable detail raster once, replace it with the proposal raster, clear redo, and preserve `analysis`, `projectPalette`, and `manualStrokes`. Reject or start another request without changing accepted state. Keep Clean Lines advancement disabled for requesting and pending-review states.

- [ ] **Step 4: Run focused unit and browser tests and verify GREEN**

Run: `node --experimental-strip-types tests/aiLineworkReview.test.ts`

Run: `pnpm test:e2e -- tests/e2e/ai-linework-proposal.spec.ts`

Expected: PASS.

### Task 3: Validate and review the bounded ticket

**Files:**
- Modify only files needed to fix in-scope findings.

- [ ] **Step 1: Run full verification**

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm test:e2e`

Run: `git diff --check`

- [ ] **Step 2: Run Standards and Spec reviews**

Review the branch diff for code quality/security/maintainability, then separately trace each ticket-02 acceptance criterion to code and fresh evidence. Fix every in-scope finding and rerun affected checks.

- [ ] **Step 3: Inspect scope and commit locally**

Confirm no provider request implementation, PDF geometry, ticket-03 export logic, or unrelated files changed. Commit the green ticket on `codex/ai-linework-ticket-02` without pushing or merging.
