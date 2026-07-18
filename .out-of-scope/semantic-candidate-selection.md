# Semantic Candidate Selection

Cutout Studio will not pursue the deterministic-candidate/provider-selection
architecture as the next semantic linework implementation.

## Why this is out of scope

The Semantic Boundary-Selection Wayfinder tested a strict architecture in which
the provider could select only locally generated candidate or bundle IDs. This
kept provider output away from source geometry, the Cut Line, and printable
geometry, but it depended on deterministic candidate generation producing a
clean and complete option for every required semantic role.

The final credential-free candidate-completeness gate produced acceptable
candidates for only 4 of 32 required roles. The remaining candidates were
partial, ambiguous, entangled with competing features, or missing important
paint boundaries. Provider selection cannot recover geometry that is absent
from its permitted catalog, and inventing that geometry would violate the
architecture's core safety boundary.

The maker-facing need is instead served by the shipped AI Linework Proposal
workflow. It accepts one explicit, disclosed direct-raster proposal, applies
local normalization and duplicate-silhouette suppression, requires visual
review before acceptance, preserves existing edits, and exports only accepted
Detail Lines. The deterministic Cut Line, Finished Size, tiling, calibration,
SVG geometry, and PDF assembly remain protected.

This decision does not prohibit all future AI linework research. A materially
different model-generated-linework architecture must start with a new problem
definition and Wayfinder, fixed evaluation evidence, explicit cost/privacy
gates, and the same protected-geometry boundary. It must not be treated as a
continuation of the rejected candidate-selection MVP.

## Prior requests

- [Semantic linework simplification](../.scratch/cutout-template-generator/issues/08-semantic-linework-simplification.md)
