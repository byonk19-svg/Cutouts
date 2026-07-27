# Forward-plan and workflow-hygiene reconciliation inventory

Recorded: 2026-07-26

This receipt records the inventory and disposition used to combine the
forward-plan and workflow-hygiene lanes. It was reconstructed from the immutable
source refs after integration so that the decisions remain reviewable without
depending on a machine-local worktree.

## Source refs and verification

| Lane | Base | Source head | Verification |
| --- | --- | --- | --- |
| forward plan | `c1144b656a2897a1444c82be3b4edb35a985431e` | `a58fbc7774efc174b1fd4f88fca6535c517c7ec5` | all 11 source commits are ancestors of the integration branch |
| workflow hygiene | `c1144b656a2897a1444c82be3b4edb35a985431e` | `f78297b` | all 19 changed paths were compared with the integrated copies |

The inventory was checked with `git log --reverse`, `git diff --name-status`,
`git diff --numstat`, `git ls-tree -rl`, and `git grep` against those refs.
The portability cleanup is commit `f93beaf` on the integration branch.

## Forward-plan commits

All source commits were retained in their original order:

| Commit | Subject |
| --- | --- |
| `1d4f9ac` | docs: reconcile project session tracker |
| `2ba28e1` | docs: define Cutout Studio forward plan |
| `8ad948e` | docs: clarify physical validation gate |
| `34380eb` | docs: record physical MVP packet evidence |
| `711ca32` | docs: correct physical packet metadata |
| `3839dd0` | docs: accept v0.1 physical baseline |
| `d443182` | docs: reopen maker-ready v0.1 gate |
| `be635c5` | docs: define maker-ready Coraline target |
| `d2d62e4` | fix: produce maker-ready real-color templates |
| `247482c` | fix: preserve authored SVG quality at print scale |
| `a58fbc7` | docs: close the accepted v0.1 baseline |

## Artifact classification and disposition

| Class | Inventory | Disposition |
| --- | --- | --- |
| source input | owner-local Coraline JPEG and Grinch SVG | do not track; retain filename, stable source ID, byte size, hash, dimensions or path count, and rights rationale in manifests |
| derived output | 21 newly tracked PDFs and PNG captures, 4,370,632 bytes total | remove from Git; retain regeneration locations and acceptance metadata |
| manifest | five JSON manifests under `output/acceptance` and `output/playwright` | retain after replacing absolute paths with portable metadata, hashes, dimensions, settings, and results |
| troubleshooting and acceptance record | `.scratch/cutout-template-generator/issues/09-maker-ready-jigsaw-template.md` and related acceptance docs | retain; describe rejected and accepted outcomes and how to regenerate untracked evidence |
| protected test/source evidence | backend fixtures, implementation, and tests | retain unchanged except for the source-lane fixes; no protected cutline or PDF geometry was altered by reconciliation |

### Removed source-derived binaries

These files were introduced by the forward-plan lane and removed by `f93beaf`.
The byte counts are from the source tree at `a58fbc7`.

| Path | Bytes |
| --- | ---: |
| `output/acceptance/physical-mvp/export-workspace.png` | 46,113 |
| `output/acceptance/physical-mvp/page-01-cover.png` | 186,788 |
| `output/acceptance/physical-mvp/page-02-paint-guide.png` | 76,638 |
| `output/acceptance/physical-mvp/page-03-first-tile.png` | 229,540 |
| `output/acceptance/physical-mvp/page-04-adjacent-tile.png` | 114,186 |
| `output/pdf/coraline-maker-ready-baseline-rejected.pdf` | 239,460 |
| `output/pdf/coraline-maker-ready-jigsaw-template.pdf` | 1,174,567 |
| `output/pdf/coraline-physical-mvp-template-packet.pdf` | 411,573 |
| `output/pdf/grinch-decorating-maker-ready.pdf` | 251,873 |
| `output/playwright/grinch-maker-ready-final/clean-lines-after-one-removal.png` | 97,735 |
| `output/playwright/maker-ready-reproduction/01-upload.png` | 37,256 |
| `output/playwright/maker-ready-reproduction/02-clean-lines-initial.png` | 95,458 |
| `output/playwright/maker-ready-reproduction/03-clean-lines-original-hidden.png` | 75,676 |
| `output/playwright/maker-ready-reproduction/04-linework-canvas.png` | 24,923 |
| `output/playwright/maker-ready-reproduction/05-print-preview.png` | 434,762 |
| `output/playwright/maker-ready-reproduction/06-colors-initial.png` | 52,753 |
| `output/playwright/maker-ready-reproduction/07-export.png` | 88,388 |
| `output/playwright/maker-ready-reproduction/08-clean-lines-fixed.png` | 116,802 |
| `output/playwright/maker-ready-reproduction/09-print-preview-fixed.png` | 357,228 |
| `output/playwright/maker-ready-reproduction/19-preview-after-three-deletes.png` | 178,500 |
| `output/playwright/maker-ready-reproduction/20-export-ready.png` | 80,413 |

### Retained portable manifests

- `output/acceptance/physical-mvp/manifest.json`
- `output/playwright/grinch-maker-ready-final/browser-acceptance.json`
- `output/playwright/grinch-maker-ready-final/candidate-manifest.json`
- `output/playwright/maker-ready-reproduction/candidate-manifest.json`
- `output/playwright/maker-ready-reproduction/manifest.json`

Together they retain the relevant SHA-256 values, byte sizes, rendered
dimensions, source identifiers, workflow settings, provider-request counts,
acceptance decisions, and repository-relative regeneration locations.

### Absolute machine-path inventory

The forward-plan source ref contained these machine-local artifact values:

| Source occurrence | Disposition |
| --- | --- |
| `C:\Users\byonk\OneDrive\Desktop\Grinch SVGs\Grinch\grinch decorating.svg` | replaced by filename, source ID, byte size, SHA-256, path count, and rights disposition |
| `C:\Users\byonk\Downloads\coraline-jones-wybie-lovat-youtube-other-mother-png-favpng-KtJE4LMVAEBZCVcR067bzMXqu.jpg` (two manifests) | replaced by filename, source ID, dimensions, byte size, SHA-256, and rights disposition |
| `C:\Users\byonk\.codex\worktrees\cutout-forward-plan\Cutouts\output\pdf\grinch-decorating-maker-ready.pdf` | replaced by repository-relative regeneration location plus PDF metadata |

The workflow-hygiene source ref also contained Windows literals. The
machine-specific audit and evidence paths were converted to portable worktree
identifiers by `441d503`. The remaining `C:\repo\Cutouts`, `C:\temp`, and
`C:\Windows` strings are synthetic test fixtures or the Windows command-shell
fallback, not artifact provenance or a dependency on the author's checkout.
The current feature status intentionally records the active canonical worktree
and is refreshed when the operational lane changes.

## Workflow-hygiene file inventory

All 19 paths changed by `c1144b6..f78297b` were retained. Historical evidence
and audit paths were made portable where necessary.

- `.scratch/_templates/STATUS.md`
- `.scratch/workflow-hygiene/PRD.md`
- `.scratch/workflow-hygiene/STATUS.md`
- `.scratch/workflow-hygiene/WORKTREE_AUDIT.md`
- `.scratch/workflow-hygiene/evidence/verify-release-20260723-014209.md`
- `.scratch/workflow-hygiene/evidence/verify-release-20260723-014835.md`
- `.scratch/workflow-hygiene/evidence/verify-release-20260724-005633.md`
- `.scratch/workflow-hygiene/evidence/verify-release-20260724-012243.md`
- `.scratch/workflow-hygiene/issues/01-status-contract-and-workflow-commands.md`
- `.scratch/workflow-hygiene/issues/02-read-only-worktree-audit.md`
- `.scratch/workflow-hygiene/issues/03-authorized-worktree-cleanup.md`
- `AGENTS.md`
- `README.md`
- `docs/agents/feature-orchestration.md`
- `package.json`
- `scripts/verify-release.mjs`
- `scripts/workflow-doctor.mjs`
- `tests/verifyRelease.test.ts`
- `tests/workflowDoctor.test.ts`

## Reconciliation result

- Preserve all 11 forward-plan commits and their product/test/documentation
  changes.
- Preserve all workflow-hygiene tooling, contracts, tests, and historical
  records.
- Remove only the 21 source-derived binaries listed above.
- Preserve evidence as portable manifests and acceptance records.
- Do not make a provider request, change tracing algorithms, or alter protected
  cutline/PDF geometry during reconciliation.
