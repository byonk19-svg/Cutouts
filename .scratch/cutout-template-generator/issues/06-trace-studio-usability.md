Status: ready-for-human

# Manual Trace Studio Usability

## Scope

Make manual detail tracing faster and clearer now that the outer cutline pipeline is stable. This issue must stay focused on user guidance and Trace Studio ergonomics. Do not add more automatic detail-tracing algorithms from this issue.

## UX Gaps

- Make the original underlay easier to understand and use while tracing.
- Improve zoom/pan defaults only if validation shows the current fit blocks tracing.
- Add keyboard shortcuts for frequent Trace Studio actions.
- Add an easy way to hide the cutline while drawing interior details.
- Make thin / normal / bold line weights clearer before drawing.
- Keep stroke count and export readiness visible.
- Remind users to trace only transfer-worthy lines.
- Make selected stroke handles easier to grab.

## First Implementation Pass

Add a small "What to trace" helper panel in Trace Studio:

- face features
- clothing borders
- hair shape
- paint boundaries
- accessories
- major folds/details

The panel should also tell users to skip shadows, texture, tiny highlights, and photo noise.

## Acceptance Criteria

- [x] The helper panel appears inside Trace Studio after analysis.
- [x] The helper panel is absent from the plain preview state.
- [x] The helper panel tells users to trace face features, clothing borders, hair shape, paint boundaries, accessories, and major folds/details.
- [x] The helper panel tells users to skip shadows, texture, tiny highlights, and photo noise.
- [x] Existing Trace Quality Review, manual stroke editing, SVG export, PDF export, and paint guide behavior remain unchanged.
- [x] Browser smoke covers the helper panel appearing in Trace Studio.

## Baseline

- Current product baseline: `c4d7fbd Add trace quality review panel`
- Tracing/vector baseline: `ddcaeb5 Improve tracing pipeline and SVG cutline export`

## Comments

- This is a product workflow pass. The goal is helping a normal user decide which manual details to transfer onto wood.
- First pass implemented as a Trace Studio-only "What to trace" helper panel. Remaining UX bullets should become separate narrow issues if table validation shows they are needed.
