# Opt-In Thin-Silhouette Reinforcement

## Status

Approved product direction, awaiting review of this written implementation contract.

## Context

Run 8 of the corrected field test uses a transparent stick-figure source whose
character geometry survives generation but whose long structural sections are
far too narrow to be a dependable wood silhouette. A bounded feasibility
diagnostic showed that finished-inch reinforcement is resolution-stable and
can produce materially stronger alternatives. It also showed that buffering can
join components, close gaps, and distort junctions.

The repository does not define a universally safe woodworking minimum. The
maker has therefore selected an opt-in preview-and-accept workflow rather than
warning-only behavior, silent automatic thickening, or a claimed-safe default.

## Product Contract

1. The original generated Cut Line remains authoritative unless the maker
   explicitly accepts a reinforced proposal.
2. Cutout Studio detects structurally significant thin sections using finished
   physical dimensions, not source pixels.
3. Detection exposes a **Reinforce thin areas** option in Clean Lines. Sources
   that are not detected as thin do not gain a new primary control.
4. Opening the option generates an exact reinforced Cut Line preview at an
   initial value of 0.50 inches.
5. The maker can explore the tested 0.25-0.75-inch range. These values describe
   proposed finished geometry; they are not safety claims.
6. The maker sees the original and proposed Cut Lines side by side before
   deciding.
7. The product reports topology changes, including joined foreground
   components and created or removed enclosed regions. Any detected topology
   change also carries an explicit warning that nearby parts or gaps may have
   merged.
8. **Use reinforced** atomically replaces the authoritative Cut Line with the
   exact previewed proposal. **Keep original** leaves the project unchanged.
9. If the backend cannot produce one valid closed outer silhouette, the app
   explains that the source cannot be reinforced coherently and keeps the
   original Cut Line.
10. Changing the Finished Size invalidates an accepted or pending reinforcement,
    restores the original Cut Line, and requires a new exact preview and maker
    acceptance at the new physical size. Changing or regenerating the Source
    Image has the same invalidation behavior.

## Explicit Non-Goals

- No automatic acceptance or invisible thickening.
- No claim that 0.50 inches, or any available value, is universally safe.
- No reinforcement of Detail Lines, facial marks, colors, or manual
  `TraceStroke` geometry.
- No reopened centerline, source-stroke ownership, Run 6 accessory, Color Guide,
  SVG-import, Run 7, AI/ML, tiling, calibration, or export-performance work.
- No attempt to preserve every disconnected alpha-mask component as a separate
  wood island.

## Considered Approaches

### Warning or refusal only

This is the safest fallback and requires no invented geometry, but it does not
help the maker complete Run 8. It remains the outcome when a coherent proposal
cannot be generated.

### Invisible automatic reinforcement

This can produce stronger geometry, but the diagnostic proved that the same
operation can merge a small intentional gap. It is rejected because the maker
would not see or approve the semantic change.

### Opt-in exact preview with maker-controlled finished width

This is the selected approach. It makes topology changes visible, avoids
claiming a universal material rule, and keeps the original Cut Line recoverable
until the maker accepts the proposal.

## Geometry Boundary

Thinness is measured on the candidate physical silhouette after subject-mask
cleanup and cropping:

```text
pixels_per_finished_inch = cropped_mask_height_px / finished_height_in
local_width_in = local_width_px / pixels_per_finished_inch
```

A detector may use distance-transform width along a skeleton and require both a
substantial thin fraction and a meaningful connected thin run. It answers only
whether the silhouette contains physically narrow structural geometry. It does
not classify semantic source strokes.

Proposal generation operates on outer-silhouette candidates only. Small
interior components such as facial marks remain part of the original
source/detail processing and cannot become independent Cut Line islands. The
proposal buffers narrow structural geometry to the requested finished width,
unions the result, derives one external contour, simplifies it within existing
Cut Line tolerances, and validates the resulting path.

The 0.25-0.75-inch range and 0.50-inch initial preview are product controls from
the governed diagnostic. They are not stored or described as woodworking safety
limits.

## Backend Responsibilities

The existing analysis pipeline remains responsible for the original subject
mask, original Cut Line, Detail Lines, paint guide, and palette.

A narrow reinforcement seam will:

1. calculate thin-silhouette diagnostics during ordinary analysis;
2. return detection metadata without altering the original Cut Line;
3. accept a separate local proposal request containing the source, current
   generation settings, and requested finished width;
4. return the proposed outer Cut Line path, its exact preview layer, physical
   width diagnostics, and topology changes;
5. reject invalid widths or incoherent geometry without modifying project data.

PDF export must receive the accepted authoritative Cut Line path and its preview
coordinate dimensions. It must render that path for the outer Cut Line while
continuing to derive Detail Lines and colors from the original source/mask.
Analysis preview, SVG export, and PDF export must therefore consume the same
accepted path rather than independently choosing outer geometry.

## Project Session and Persistence

The Project Session remains the sole write authority. The durable project model
will retain:

- the original generated Cut Line path and preview layer;
- detection metadata;
- the accepted Cut Line choice (`original` or `reinforced`);
- when reinforced, the exact accepted path, preview layer, chosen finished-inch
  width, preview coordinate size, and recorded topology changes.

Proposal loading and width changes are transient asynchronous preparation. A
proposal may be accepted only if the Project Revision and source analysis from
which it began are still current. A stale, failed, cancelled, or kept-original
proposal leaves durable project data unchanged.

Accepting or reverting the Cut Line revokes completed linework and color review
milestones and returns the Guided Workflow to Clean Lines. Save, autosave, and
restore preserve an accepted reinforced Cut Line. Older project files normalize
to the original Cut Line choice.

Changing Finished Size discards pending or accepted reinforcement and restores
the original generated Cut Line. The prior proposal cannot remain authoritative
because its finished-inch width is no longer true, and the app cannot silently
generate a new shape without maker review. Source replacement or analysis
regeneration discards reinforcement state for the same ownership reason.

## Clean Lines UX

When analysis detects thin structural geometry, Clean Lines shows a compact
warning explaining that some finished sections are unusually narrow and may be
difficult to cut reliably. The warning offers **Reinforce thin areas**.

The review surface contains:

- original Cut Line preview;
- proposed reinforced Cut Line preview;
- finished minimum-width control from 0.25 to 0.75 inches;
- clear text that the value is not a universal safety recommendation;
- topology summary and warning when components, holes, or gap relationships
  change;
- **Use reinforced**, **Keep original**, and **Cancel** actions.

Changing the width updates only the proposal. During loading, the previous
proposal is visibly stale and cannot be accepted. Proposal failure leaves the
original authoritative and offers the warning/refusal fallback. After acceptance,
Clean Lines identifies the active Cut Line as reinforced and provides a
**Restore original Cut Line** action.

## Error and Lifecycle Behavior

- Detection failure must not block ordinary generation; it records no thin
  recommendation and preserves the original Cut Line.
- Proposal request failure reports an actionable local error and preserves the
  original or previously accepted Cut Line.
- Width values outside 0.25-0.75 inches are rejected in both the client and
  backend.
- A stale proposal response is discarded through Project Revision matching.
- A proposal with no contour, multiple unresolved physical islands,
  non-finite coordinates, or out-of-bounds geometry is review-only/refused and
  cannot be accepted.
- Export rejects an accepted-path payload that does not match the recorded
  preview dimensions or cannot be validated.
- Detail Lines, paint state, and manual Feature Lines never enter the
  reinforcement calculation.

## Test Strategy

Implementation follows test-first red/green cycles.

Backend coverage:

- ten generated synthetic fixtures from the diagnostic;
- Run-8-like transparent thin-subject fixture;
- ordinary filled silhouette does not trigger;
- finished-size and source-resolution consistency;
- bounds, width-range, invalid-contour, component-join, and hole-change cases;
- proposal affects the outer Cut Line only;
- PDF uses the accepted path while preserving original Detail Lines;
- existing transparent, dark-background, checkerboard, line-art, Max, and
  Coraline regressions remain green.

Project/session coverage:

- detection metadata is durable;
- proposal start, stale completion, failure, cancellation, keep-original,
  acceptance, and restore-original transitions;
- acceptance is one atomic durable transition;
- review milestones are invalidated by Cut Line changes;
- Finished Size invalidates reinforcement and restores the original Cut Line;
- source replacement/regeneration invalidates reinforcement;
- save/restore preserves accepted reinforcement;
- legacy projects normalize to original.

Browser coverage:

- option appears only for detected thin sources;
- original is authoritative before acceptance;
- review opens at 0.50 inches and states that it is not a safety guarantee;
- 0.25 and 0.75 bounds work;
- topology warning is visible for a merging fixture;
- loading/stale proposals cannot be accepted;
- Keep original and failure preserve the project;
- Use reinforced changes preview, saved project, SVG, and PDF consistently;
- Restore original works;
- Detail Lines and manual Feature Lines remain unchanged.

Local acceptance uses the exact rights-cleared Run 8 source without committing
it. The final packet must be visually compared with the accepted preview. No
physical woodworking safety claim or physical-test pass is produced by this
feature.

## Acceptance Criteria

The feature is complete only when:

1. detected thin subjects offer reinforcement without changing the original;
2. the preview starts at 0.50 inches and supports 0.25-0.75 inches;
3. topology changes are plainly disclosed;
4. the maker must explicitly accept reinforced geometry;
5. accepted preview, saved project, SVG, and PDF share the same Cut Line;
6. original source geometry continues to own Detail Lines and colors;
7. Keep original, cancel, failure, stale completion, and restore-original paths
   preserve coherent project state;
8. Run 8 produces a recognizable reinforced proposal while protected regression
   sources remain unchanged;
9. Finished Size or Source Image changes cannot silently retain or regenerate a
   physically stale reinforced Cut Line;
10. no UI or documentation claims that a selected width is universally safe;
11. no out-of-scope linework, accessory, Color Guide, or print-mechanics behavior
    changes.
