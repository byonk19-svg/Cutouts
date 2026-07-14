# Semantic boundary-selection prototype

This is throwaway feasibility code. It tests whether a local zero-shot vision
model can select transfer-worthy character regions and boundaries without
controlling Cutout Studio's subject mask, outer cutline, sizing, tiling, SVG,
or PDF geometry.

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .scratch\semantic-linework-wayfinder\prototype\run.ps1
```

The first run installs the isolated JavaScript dependency and downloads the
pinned CLIPSeg ONNX weights. Downloaded dependencies and raw logits stay under
the ignored `prototype/work/` directory. Review artifacts are written to:

```text
.scratch/semantic-linework-wayfinder/corpus/runs/clipseg-local-v1-replay/
```

Set `SEMANTIC_RUN_ID` before running to choose a different output directory.
The reviewed `clipseg-local-v1` evidence is never overwritten by the default
command.

The model is a feasibility instrument, not a proposed production dependency.
The production MVP may not require a GPU, specialist setup, or a mandatory
large model download.

## Recorded outcome

The `clipseg-local-v1` run concluded **Revise**. Deterministic projection and
export integration worked, but the model omitted major paint boundaries on all
four fixtures. See the run's `verdict.md`; do not treat this prototype as a
production implementation.
