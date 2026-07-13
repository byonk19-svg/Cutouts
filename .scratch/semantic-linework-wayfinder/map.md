# Semantic boundary-selection wayfinder

**Status:** ready-for-agent
**Label:** wayfinder:map

## Destination

Produce the decisions and evidence needed to write a safe implementation spec for AI-assisted semantic boundary selection in Cutout Studio. The resulting architecture must preserve deterministic cutline geometry, editing, vectorization, print scale, and tiled export.

## Notes

- Parent problem: [Semantic linework simplification](../cutout-template-generator/issues/08-semantic-linework-simplification.md)
- This map produces decisions, not production implementation.
- Evaluate semantic feature selection rather than direct end-to-end template generation.
- Preserve the existing accepted Wood Template - Recommended workflow throughout investigation.
- Use stable, non-sensitive character fixtures and save comparable source, linework, SVG, and rendered-PDF evidence.

## Decisions so far

- [Decide product and model constraints](issues/01-product-model-constraints.md) - Keep the deterministic workflow local and make external AI optional, disclosed, provider-independent, bounded by cost/latency limits, and unable to control cutline or print geometry.
- [Define the fixed evaluation corpus](issues/02-fixed-evaluation-corpus.md) - Use four reproducible, permissively licensed synthetic fixtures covering rendered shading, outlined JPEG, transparent PNG, dark fills, and complex character features with fixed review artifacts.
- [Choose the semantic output contract](issues/03-semantic-output-contract.md) - Exchange validated full-source protected-region and important-boundary masks, then deterministically clip, crop, resize, clean, and vectorize them without any model-owned silhouette or export geometry.

## Not yet specified

- Exact semantic-linework MVP behavior and service boundary after feasibility is known.
- Regeneration and edit-preservation contract for AI-generated starter details.
- Production rollout, failure handling, observability, and fallback behavior.
- Final acceptance thresholds and human-review rubric derived from the fixed corpus.

## Out of scope

- Changing subject-mask or outer-cutline generation.
- Allowing an AI model to control dimensions, tiling, overlap, calibration, or PDF assembly.
- Further tuning of generic OpenCV pruning thresholds as a substitute for semantic selection.
- Promoting Minimal - Experimental as Max-style output during this investigation.

## Map completion criteria

This wayfinder is complete when:

- product/model constraints are resolved
- the fixed evaluation corpus is committed
- one semantic output contract is selected
- the feasibility prototype has comparable artifacts for every fixture
- cost, latency, resource use, and failures are documented
- the final recommendation is proceed, revise, or stop
- enough evidence exists to write a bounded production MVP specification
