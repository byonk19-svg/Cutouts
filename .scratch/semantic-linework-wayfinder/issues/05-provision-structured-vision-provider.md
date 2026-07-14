# Provision an approved structured-vision provider

**Status:** ready-for-human
**Label:** wayfinder:task
**Parent:** [Semantic boundary-selection wayfinder](../map.md)

## Question

Can one approved structured-vision provider be made available for a bounded
comparison against the failed local CLIPSeg baseline?

## Completion checklist

- select a provider whose submitted images are not used for model training
- make authentication available through an environment variable or supported
  local CLI without committing credentials
- confirm a text-only request succeeds before any image request
- cap the comparison at $0.25 per fixture and report total multi-pass cost
- use only the fixed synthetic corpus
- record provider, model, version, retention policy, and authentication method

The existing deterministic workflow must remain the fallback. Completing this
ticket provisions research access only; it does not approve production use.
