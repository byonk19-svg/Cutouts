# Full-Color SVG Import Design

## Problem

Cutout Studio misclassifies some full-color, compound-path SVG artwork as ready
black line art. The SVG fast path then retains only dark-neutral pixels and
removes ink near the protected outer cutline. Purchased artwork can therefore
lose color-region boundaries, produce fragmented character features, and gain
detached remnants even though the source SVG is structurally valid.

The Band Member and Cindy field-test sources reproduce this failure. The Car
source is more usable but passes through the same risky classification path.
These copyrighted sources remain local and are not committed.

## Desired Behavior

- Genuine black line-art SVGs continue to use the authored-ink fast path.
- Full-color SVG artwork with black filled outlines is classified as rendered
  artwork rather than ready line art.
- Full-color SVGs use the existing rendered-art analysis so color-region
  boundaries can become paint guides.
- The result retains one protected outer jigsaw cutline and useful interior
  paint boundaries without detached exterior fragments.
- No paid AI request, new vectorization engine, export change, or PDF geometry
  change is introduced.

## Approach

Extend SVG classification using rendered-pixel evidence. In addition to the
existing dark-ink morphology checks, measure meaningful chromatic artwork. An
SVG with substantial nonwhite chromatic content must not be promoted to the
authored-ink fast path merely because its black compound outlines are thin.

The existing upload and analysis flow remains intact:

1. Safely validate and render the SVG locally.
2. Measure dark ink and chromatic artwork at the bounded classification size.
3. Use the authored-ink fast path only when dark ink resembles linework and the
   rendered image does not contain substantial full-color artwork.
4. Otherwise send the locally rasterized SVG through the ordinary rendered-art
   analysis and report that it needs generated/simplified starter lines.

This is preferred over parsing arbitrary SVG path geometry or adding a second
color-boundary engine in the browser. It fixes the incorrect routing decision
at its source and reuses the pipeline that already owns rendered-image boundary
extraction.

## Failure Handling

Existing SVG safety validation remains unchanged. Ambiguous classification is
conservative: the file uses rendered-art analysis instead of being declared
ready authored linework. If rendered-art output remains inadequate for the
local field-test sources, that evidence will define a separate boundary-
extraction defect rather than being hidden behind additional classifier tuning.

## Verification

- Add a synthetic full-color compound-path SVG regression that currently
  misclassifies as authored linework and confirm the new test fails first.
- Prove genuine black stroked and black filled line-art fixtures still use the
  fast path.
- Prove color-only and large-solid-ink SVG behavior remains conservative.
- Run the focused TypeScript and browser SVG-import tests, then the repository's
  standard typecheck, lint, test, build, and diff checks.
- Validate Band Member, Cindy, and Car through the real browser using their
  local files. Do not commit those sources or generated copyrighted artifacts.
- Compare the initial Clean Lines result for coherent outer shape, preserved
  face/body/prop boundaries, and detached fragments.

## Scope Boundary

This change affects SVG import classification and only the minimum downstream
handling required to make the corrected route work. It does not redesign the
editor, add AI behavior, change export formats, tune general raster tracing for
one character, or alter physical PDF layout.
