# Closed Paint Regions Design

## Goal

Make the Max trace pattern easier to paint by representing every meaningful
color-fill area as a clean, closed boundary. Preserve open expression and
construction strokes where closure would add clutter or imply a paint region
that does not exist.

## Scope

This source-driven pass covers meaningful paint regions visible in the clean
Max source, including:

- eye whites
- pupils
- inner ears
- antler openings and distinct antler paint areas
- major face, chest, paw, leg, and tail color boundaries where the source
  actually defines a separate fill area

The pass does not close eyelashes, brows, mouth lines, toe marks, fur accents,
or other expressive Detail Lines that do not surround a paintable area.

## Pipeline Behavior

1. Extract deliberate authored ink while suppressing marker texture and
   dot-sized remnants.
2. Identify bounded source regions large enough to represent practical paint
   areas.
3. Preserve or repair small gaps in those boundaries before line
   simplification.
4. Smooth the repaired boundary without merging neighboring paint regions.
5. Combine closed paint boundaries with retained open Feature Lines.
6. Keep the result in the accepted editable Detail Line layer; the Cut Line and
   printable geometry remain unchanged.

Gap repair is limited to short, source-supported gaps. The pipeline must not
invent a boundary across a genuinely open region or redraw a major feature.

## Output Rules

- Each retained paint region forms one visually unambiguous closed loop.
- Eye whites and pupils remain distinct regions.
- Solid black regions continue to export as boundary outlines.
- No dot-sized artifacts are introduced.
- No duplicate outer silhouette is created.
- Trace pages remain black-and-white linework only.

## Validation

The Max fixture must prove through exported Detail Lines and PDF output that:

- both eye-white regions are closed
- both pupil regions are closed and remain inside their corresponding eyes
- meaningful ear and antler paint regions remain understandable
- mouth, lashes, brows, and toe marks remain open where appropriate
- existing semantic-region, Cut Line, page geometry, overlap, calibration, SVG,
  save/restore, and provider-request protections still pass

The final PDF requires visual inspection after Chromium regeneration. Physical
printing and maker acceptance remain `ready-for-human`.
