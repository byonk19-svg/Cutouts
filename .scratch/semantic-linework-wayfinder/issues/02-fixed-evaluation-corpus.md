# Define the fixed evaluation corpus

**Status:** resolved
**Label:** wayfinder:task
**Parent:** [Semantic boundary-selection wayfinder](../map.md)
**Assignee:** Codex
**Claimed:** 2026-07-13
**Resolved by:** Codex on 2026-07-13

## Question

Which stable, legally usable, non-sensitive fixtures and artifact comparisons will form the fixed evaluation corpus for semantic linework experiments?

## Resolution must record

- one soft-shaded rendered character
- one flat outlined JPEG cartoon
- one transparent PNG cartoon
- one character with dark colored fills or clothing
- one character with complex hands, hair, fur, or accessories
- expected transfer-worthy boundaries for each fixture
- stable locations and naming for source, linework, SVG, and PDF evidence

## Resolution

The fixed corpus is established under [`../corpus/`](../corpus/README.md) as
four deterministic, original synthetic character fixtures. Existing
Coraline/Grinch-derived images and screenshots were not reused because the
repository does not establish redistribution rights for those character
uploads.

| Fixture | Source | Dimensions | Coverage |
| --- | --- | --- | --- |
| `soft-shaded-render` | `corpus/sources/soft-shaded-render.png` | 720 x 960 RGBA | soft-shaded rendered character |
| `flat-outlined-cartoon` | `corpus/sources/flat-outlined-cartoon.jpg` | 720 x 960 RGB JPEG | flat outlined JPEG cartoon |
| `transparent-cartoon` | `corpus/sources/transparent-cartoon.png` | 720 x 960 RGBA with real alpha | transparent PNG cartoon |
| `dark-complex-cartoon` | `corpus/sources/dark-complex-cartoon.png` | 800 x 960 RGBA | dark fills/clothing plus complex hands, hair, fur, and accessory boundaries |

### Provenance and legal use

All fixture artwork is generated solely from geometric primitives by
[`generate_fixtures.py`](../corpus/generate_fixtures.py). It contains no
external images, characters, fonts, stock assets, or sensitive data. The
fixture-specific permission grant is recorded in
[`FIXTURE-LICENSE.txt`](../corpus/FIXTURE-LICENSE.txt). Exact source formats,
dimensions, and SHA-256 hashes are recorded in
[`generated-files.json`](../corpus/generated-files.json).

### Expected boundaries

The corpus README records the transfer-worthy boundary inventory per fixture.
Across the set this includes the complete outer silhouette and selected face,
hair, clothing, limb, footwear, hand, fur, and accessory boundaries. It also
names the fixture-specific seams, straps, bags, and lantern boundaries that
must survive semantic selection. Shading steps, texture, highlights, duplicate
contours, and solid dark fills are explicitly not expected as linework.

### Stable evidence locations

Every experiment uses:

```text
corpus/runs/<experiment-id>/<fixture-id>/source.<png|jpg>
corpus/runs/<experiment-id>/<fixture-id>/semantic-output.png
corpus/runs/<experiment-id>/<fixture-id>/generated-linework.png
corpus/runs/<experiment-id>/<fixture-id>/original-off-preview.png
corpus/runs/<experiment-id>/<fixture-id>/linework.svg
corpus/runs/<experiment-id>/<fixture-id>/template.pdf
corpus/runs/<experiment-id>/<fixture-id>/rendered-pdf/page-001.png
corpus/runs/<experiment-id>/<fixture-id>/acceptance.md
```

Additional rendered PDF pages use three-digit print-order numbering. Sources
copied into a run must match the canonical SHA-256 hashes.

### Human acceptance comparisons

[`acceptance-comparisons.md`](../corpus/acceptance-comparisons.md) fixes four
side-by-side reviews:

1. source vs generated linework for semantic feature selection;
2. generated linework vs original-off preview for layer/compositing fidelity;
3. original-off preview vs SVG for editable vector fidelity;
4. SVG vs rendered PDF pages for export, scale, alignment, and line-weight
   fidelity.

The checklist requires a per-fixture pass/fail verdict, missing and unwanted
boundaries, export discrepancies, and estimated manual additions/deletions.

## Comments

- Resolved after generating and visually inspecting all four canonical source
  fixtures. The corpus is reproducible from its checked-in generator rather
  than merely proposed.
