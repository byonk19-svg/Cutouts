"""PROTOTYPE: normalize CLIPSeg output and build deterministic review artifacts."""

from __future__ import annotations

import base64
import io
import json
import os
import re
import shutil
from pathlib import Path

import cv2
import fitz
import numpy as np
from PIL import Image, ImageDraw

from backend.cutout_studio.pipeline import (
    TemplateSettings,
    _load_image,
    _mask_bounds,
    _subject_mask,
    analyze_template,
    build_template_pdf,
)


ROOT = Path(__file__).resolve().parent
CORPUS = ROOT.parent / "corpus"
WORK = ROOT / "work"
RUN_ID = os.environ.get("SEMANTIC_RUN_ID", "clipseg-local-v1-replay")
if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", RUN_ID):
    raise ValueError("SEMANTIC_RUN_ID must be a lowercase filename-safe identifier.")
RUNS_ROOT = (CORPUS / "runs").resolve()
RUN_ROOT = (RUNS_ROOT / RUN_ID).resolve()
if RUN_ROOT.parent != RUNS_ROOT:
    raise ValueError("Prototype run output must stay inside the corpus runs directory.")
THRESHOLD = 0.5
MIN_COMPONENT_RATIO = 0.001
COLORS = [
    (202, 67, 75),
    (29, 119, 159),
    (238, 173, 45),
    (67, 151, 92),
    (128, 82, 159),
    (220, 104, 42),
    (49, 157, 154),
    (192, 78, 135),
]


def sigmoid(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, -30, 30)
    return 1.0 / (1.0 + np.exp(-values))


def png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def data_url(image: Image.Image) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes(image)).decode("ascii")


def connected_components(mask: np.ndarray, probabilities: np.ndarray) -> list[tuple[np.ndarray, float]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    minimum = max(24, round(mask.size * MIN_COMPONENT_RATIO))
    components: list[tuple[np.ndarray, float]] = []
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) < minimum:
            continue
        component = labels == index
        confidence = float(np.mean(probabilities[component]))
        components.append((component, confidence))
    return components


def semantic_masks(
    logits: np.ndarray,
    metadata: dict,
    source_size: tuple[int, int],
    subject: np.ndarray,
) -> tuple[dict, np.ndarray, Image.Image, dict[str, int]]:
    width, height = source_size
    protected: list[dict] = []
    boundaries: list[dict] = []
    combined_boundaries = np.zeros((height, width), dtype=np.uint8)
    overlay = Image.new("RGBA", source_size, (255, 255, 255, 255))
    counts = {"protected": 0, "boundaries": 0}

    for index, prompt in enumerate(metadata["prompts"]):
        low_res = sigmoid(logits[index])
        probability = cv2.resize(low_res, source_size, interpolation=cv2.INTER_LINEAR)
        binary = (probability >= THRESHOLD) & subject
        components = connected_components(binary, probability)
        if prompt["group"] == "protectedRegions":
            for component_index, (component, confidence) in enumerate(components, start=1):
                mask_image = Image.fromarray(component.astype(np.uint8) * 255, mode="L")
                color = COLORS[index % len(COLORS)] + (92,)
                color_layer = Image.new("RGBA", source_size, color)
                color_layer.putalpha(mask_image.point(lambda value: round(value * 0.36)))
                overlay.alpha_composite(color_layer)
                protected.append(
                    {
                        "id": f"{prompt['label']}-{component_index}",
                        "label": prompt["label"],
                        "confidence": round(confidence, 4),
                        "maskPngDataUrl": data_url(mask_image),
                    }
                )
                counts["protected"] += 1
            continue

        for component_index, (component, confidence) in enumerate(components, start=1):
            component_u8 = component.astype(np.uint8) * 255
            edge = cv2.morphologyEx(component_u8, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
            edge &= (subject.astype(np.uint8) * 255)
            edge_components = connected_components(edge > 0, probability)
            for edge_index, (edge_component, edge_confidence) in enumerate(edge_components, start=1):
                edge_image = Image.fromarray(edge_component.astype(np.uint8) * 255, mode="L")
                combined_boundaries[edge_component] = 255
                boundaries.append(
                    {
                        "id": f"{prompt['label']}-{component_index}-{edge_index}",
                        "label": prompt["label"],
                        "confidence": round(min(confidence, edge_confidence), 4),
                        "maskPngDataUrl": data_url(edge_image),
                    }
                )
                counts["boundaries"] += 1

    boundary_overlay = Image.fromarray(combined_boundaries, mode="L")
    ink = Image.new("RGBA", source_size, (0, 0, 0, 255))
    ink.putalpha(boundary_overlay)
    overlay.alpha_composite(ink)
    contract = {
        "schemaVersion": "semantic-selection-v1",
        "coordinateSpace": "source-pixels",
        "widthPx": width,
        "heightPx": height,
        "protectedRegions": protected,
        "importantBoundaries": boundaries,
    }
    return contract, combined_boundaries, overlay.convert("RGB"), counts


def preview_detail(boundaries: np.ndarray, subject: np.ndarray, bounds: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    subject_u8 = subject.astype(np.uint8) * 255
    outer_band = cv2.morphologyEx(subject_u8, cv2.MORPH_GRADIENT, np.ones((9, 9), np.uint8)) > 0
    interior = boundaries.copy()
    interior[outer_band] = 0
    x0, y0, x1, y1 = bounds
    cropped = interior[y0:y1, x0:x1]
    resized = cv2.resize(cropped, size, interpolation=cv2.INTER_NEAREST)
    resized = cv2.morphologyEx(resized, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    alpha = Image.fromarray(resized, mode="L")
    detail = Image.new("RGBA", size, (0, 0, 0, 255))
    detail.putalpha(alpha)
    return detail


def linework_preview(outer_png: bytes, detail: Image.Image) -> Image.Image:
    outer = Image.open(io.BytesIO(outer_png)).convert("RGBA")
    canvas = Image.new("RGBA", outer.size, (255, 255, 255, 255))
    canvas.alpha_composite(detail)
    canvas.alpha_composite(outer)
    return canvas.convert("RGB")


def write_svg(path: Path, analysis, detail: Image.Image) -> None:
    encoded = base64.b64encode(png_bytes(detail)).decode("ascii")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{analysis.finished_width_in:.3f}in" height="{analysis.finished_height_in:.3f}in" viewBox="0 0 {analysis.preview_width_px} {analysis.preview_height_px}">
<rect width="100%" height="100%" fill="#fff"/>
<path id="cutline-layer" d="{analysis.outer_cut_path}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<image id="accepted-detail-layer" href="data:image/png;base64,{encoded}" x="0" y="0" width="{analysis.preview_width_px}" height="{analysis.preview_height_px}"/>
</svg>
'''
    path.write_text(svg, encoding="utf-8", newline="\n")


def render_pdf(pdf_path: Path, target: Path) -> int:
    target.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    for index, page in enumerate(document):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
        pixmap.save(target / f"page-{index + 1:03d}.png")
    count = len(document)
    document.close()
    return count


def contact_sheet(source: Image.Image, semantic: Image.Image, linework: Image.Image, path: Path) -> None:
    items = [("Source", source.convert("RGB")), ("Semantic output", semantic), ("Printable linework", linework)]
    thumb_size = (360, 480)
    sheet = Image.new("RGB", (len(items) * 390, 540), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(items):
        preview = image.copy()
        preview.thumbnail(thumb_size, Image.Resampling.LANCZOS)
        x = index * 390 + (390 - preview.width) // 2
        y = 42 + (480 - preview.height) // 2
        sheet.paste(preview, (x, y))
        draw.text((index * 390 + 16, 14), label, fill="black")
    sheet.save(path)


def main() -> None:
    summary = json.loads((WORK / "inference-summary.json").read_text(encoding="utf-8"))
    fixture_manifest = json.loads((CORPUS / "generated-files.json").read_text(encoding="utf-8"))
    shutil.rmtree(RUN_ROOT, ignore_errors=True)
    RUN_ROOT.mkdir(parents=True)
    evidence_rows: list[dict] = []

    for fixture in fixture_manifest["fixtures"]:
        fixture_id = fixture["id"]
        source_path = CORPUS / fixture["source"]
        source_bytes = source_path.read_bytes()
        source = _load_image(source_bytes)
        settings = TemplateSettings(
            finished_height_in=18,
            detail_lines=False,
            project_name=f"Semantic Prototype - {fixture_id}",
        )
        analysis = analyze_template(source_bytes, settings)
        subject_image = _subject_mask(source, settings)
        subject = np.asarray(subject_image.convert("L")) > 0
        bounds = _mask_bounds(subject_image)
        metadata = json.loads((WORK / "raw" / fixture_id / "metadata.json").read_text(encoding="utf-8"))
        dimensions = metadata["logitsDimensions"]
        raw = np.fromfile(WORK / "raw" / fixture_id / "logits.f32", dtype=np.float32)
        logits = raw.reshape(dimensions)
        contract, boundaries, semantic, counts = semantic_masks(logits, metadata, source.size, subject)
        detail = preview_detail(boundaries, subject, bounds, (analysis.preview_width_px, analysis.preview_height_px))
        linework = linework_preview(analysis.outer_line_png, detail)

        target = RUN_ROOT / fixture_id
        target.mkdir(parents=True)
        shutil.copy2(source_path, target / f"source{source_path.suffix}")
        semantic.save(target / "semantic-output.png")
        detail.save(target / "generated-linework.png")
        linework.save(target / "original-off-preview.png")
        (target / "contract.json").write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8", newline="\n")
        write_svg(target / "linework.svg", analysis, detail)
        pdf = build_template_pdf(source_bytes, settings, edited_detail_png=png_bytes(detail))
        pdf_path = target / "template.pdf"
        pdf_path.write_bytes(pdf)
        page_count = render_pdf(pdf_path, target / "rendered-pdf")
        contact_sheet(source, semantic, linework, target / "review.png")

        dark_pixels = int(np.count_nonzero(np.asarray(detail.getchannel("A")) > 0))
        review = f"""# {fixture_id} acceptance

- Overall: pending human review
- Protected-region components: {counts['protected']}
- Important-boundary components: {counts['boundaries']}
- Preview detail pixels: {dark_pixels}
- PDF pages: {page_count}
- Inference latency: {metadata['inferenceMs']} ms
- Peak process RSS: {metadata['peakRssBytes']} bytes
- Estimated model-call cost: $0.00 (local model)
- Missing important boundaries: pending human review
- Unwanted minor boundaries: pending human review
- Export discrepancies: pending human review
- Estimated manual additions/deletions: pending human review
"""
        (target / "acceptance.md").write_text(review, encoding="utf-8", newline="\n")
        evidence_rows.append(
            {
                "fixture": fixture_id,
                "source": fixture["source"],
                "dimensions": f"{fixture['width']}x{fixture['height']}",
                "model": f"{summary['model']}@{summary['modelRevision']}",
                "request": summary["requestVersion"],
                "contract": summary["outputContractVersion"],
                "latencyMs": metadata["inferenceMs"],
                "estimatedCostUsd": 0,
                "status": "success",
                "artifactPath": str(target.relative_to(CORPUS.parent.parent)).replace("\\", "/"),
                "failureCategory": "none",
            }
        )

    (RUN_ROOT / "run-metadata.json").write_text(json.dumps({**summary, "evidence": evidence_rows}, indent=2) + "\n", encoding="utf-8", newline="\n")
    manifest_lines = [
        "# CLIPSeg local prototype evidence",
        "",
        "| Fixture | Source | Dimensions | Model | Request | Contract | Latency | Cost | Status | Artifacts | Review | Failure |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in evidence_rows:
        manifest_lines.append(
            f"| {row['fixture']} | {row['source']} | {row['dimensions']} | {row['model']} | {row['request']} | {row['contract']} | {row['latencyMs']} ms | $0.00 | {row['status']} | `{row['artifactPath']}` | Pending | {row['failureCategory']} |"
        )
    (RUN_ROOT / "evidence-manifest.md").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8", newline="\n")
    print(f"Evidence written to {RUN_ROOT}")


if __name__ == "__main__":
    main()
