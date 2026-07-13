# Fixed Semantic Linework Evaluation Corpus

This directory contains four deterministic, original synthetic character
fixtures for comparing semantic boundary-selection experiments. No source is
derived from an uploaded character, stock asset, font, or external image.

Run `python generate_fixtures.py` from this directory to reproduce every source
and `generated-files.json`. Pillow is the only runtime dependency.

## Fixture coverage

| Fixture | Source | Dimensions | Required category coverage | Expected transfer-worthy boundaries |
| --- | --- | --- | --- | --- |
| `soft-shaded-render` | `sources/soft-shaded-render.png` | 720 x 960 RGBA | soft-shaded rendered character | complete silhouette; hair mass; eyes and mouth; face/hair border; coat outer panels, center opening, waist seam, and belt; both arms and legs; boots; lantern outline and handle |
| `flat-outlined-cartoon` | `sources/flat-outlined-cartoon.jpg` | 720 x 960 RGB JPEG | flat outlined JPEG cartoon | complete silhouette; cap and brim; face, eyes, and mouth; jacket edge, center opening, and waist seam; arms, hands, legs, and shoes; diagonal satchel strap and bag |
| `transparent-cartoon` | `sources/transparent-cartoon.png` | 720 x 960 RGBA with real alpha | transparent PNG cartoon | complete silhouette; hair spikes and face border; eyes and mouth; coat edge and center opening; arms, hands, legs, and boots; diagonal strap; round accessory and handle |
| `dark-complex-cartoon` | `sources/dark-complex-cartoon.png` | 800 x 960 RGBA | dark clothing/fills; complex hands, hair, fur, and accessory | complete silhouette; distinct hair points; face, eyes, and mouth; light fur/collar boundary against dark coat; coat center and hem; articulated fingers; arms, legs, and boots; diagonal strap and satchel |

Categories may overlap, but each input-format category has its own fixture so a
failure can be attributed to the source type rather than another variable.

## Stable artifact layout

Experiments must not overwrite `sources/`. For an experiment named
`<experiment-id>`, save this exact set for every `<fixture-id>`:

```text
runs/<experiment-id>/<fixture-id>/source.<png|jpg>
runs/<experiment-id>/<fixture-id>/semantic-output.png
runs/<experiment-id>/<fixture-id>/generated-linework.png
runs/<experiment-id>/<fixture-id>/original-off-preview.png
runs/<experiment-id>/<fixture-id>/linework.svg
runs/<experiment-id>/<fixture-id>/template.pdf
runs/<experiment-id>/<fixture-id>/rendered-pdf/page-001.png
runs/<experiment-id>/<fixture-id>/acceptance.md
```

The copied `source` must have the same SHA-256 value as `generated-files.json`.
Additional rendered PDF pages use three-digit numbering in print order.

## Human comparison

Reviewers use [acceptance-comparisons.md](acceptance-comparisons.md) and compare:

1. source beside generated linework to judge semantic selection;
2. generated linework beside original-off preview to catch compositing errors;
3. original-off preview beside SVG to confirm editable vector fidelity;
4. SVG beside rendered PDF pages to catch print/export loss, scaling, or line
   weight changes.

An experiment is comparable only when all four fixtures have the complete
artifact set and the model/provider/version, request version, output-contract
version, latency, cost, result, and human notes are recorded in the shared
evidence manifest outside this ticket's ownership boundary.
