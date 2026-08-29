"""Read-only print-scale Detail Line quality diagnostics.

This module is deliberately not imported by the production tracing pipeline.
It reports measurable raster properties so repeated line-quality findings can be
compared without turning subjective maker acceptance into an automatic claim.
"""

from __future__ import annotations

import argparse
import io
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import fitz
import numpy as np
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject


INK_THRESHOLD = 180


@dataclass(frozen=True)
class LineQualityMetrics:
    image_width_px: int
    image_height_px: int
    comparison_dpi: float
    width_p50_px: float
    width_p90_px: float
    width_p95_px: float
    width_p50_pt: float
    width_p90_pt: float
    width_p95_pt: float
    ink_density: float
    component_count: int
    broad_ink_fraction: float
    broad_ink_fraction_4pt: float
    boundary_complexity: float
    small_component_fraction: float

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class LineworkPage:
    image: Image.Image
    trace_page_index: int | None
    pdf_page_index: int | None
    row: int | None
    column: int | None
    label: str | None


def analyze_linework(image: Image.Image | np.ndarray, comparison_dpi: float = 72.0) -> LineQualityMetrics:
    if comparison_dpi <= 0:
        raise ValueError("comparison_dpi must be greater than zero")
    gray = _to_grayscale(image)
    ink = gray < INK_THRESHOLD
    ink_pixels = int(np.count_nonzero(ink))
    total_pixels = max(1, int(ink.size))
    density = ink_pixels / total_pixels
    if ink_pixels == 0:
        return LineQualityMetrics(
            image_width_px=gray.shape[1],
            image_height_px=gray.shape[0],
            comparison_dpi=comparison_dpi,
            width_p50_px=0.0,
            width_p90_px=0.0,
            width_p95_px=0.0,
            width_p50_pt=0.0,
            width_p90_pt=0.0,
            width_p95_pt=0.0,
            ink_density=0.0,
            component_count=0,
            broad_ink_fraction=0.0,
            broad_ink_fraction_4pt=0.0,
            boundary_complexity=0.0,
            small_component_fraction=0.0,
        )

    distances = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 5)
    widths = distances[ink] * 2.0
    component_count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
        ink.astype(np.uint8), connectivity=8
    )
    broad_fraction = float(np.count_nonzero(widths >= 8.0) / max(1, len(widths)))
    broad_width_px = 4.0 * comparison_dpi / 72.0
    broad_fraction_4pt = float(np.count_nonzero(widths >= broad_width_px) / max(1, len(widths)))
    small_fraction = float(
        sum(int(stats[label, cv2.CC_STAT_AREA]) for label in range(1, component_count) if stats[label, cv2.CC_STAT_AREA] < 16)
        / max(1, ink_pixels)
    )
    complexity = _boundary_complexity(ink, labels, stats, component_count)
    width_p50_px = float(np.percentile(widths, 50))
    width_p90_px = float(np.percentile(widths, 90))
    width_p95_px = float(np.percentile(widths, 95))
    pixels_to_points = 72.0 / comparison_dpi
    return LineQualityMetrics(
        image_width_px=gray.shape[1],
        image_height_px=gray.shape[0],
        comparison_dpi=comparison_dpi,
        width_p50_px=round(width_p50_px, 3),
        width_p90_px=round(width_p90_px, 3),
        width_p95_px=round(width_p95_px, 3),
        width_p50_pt=round(width_p50_px * pixels_to_points, 3),
        width_p90_pt=round(width_p90_px * pixels_to_points, 3),
        width_p95_pt=round(width_p95_px * pixels_to_points, 3),
        ink_density=round(density, 6),
        component_count=max(0, component_count - 1),
        broad_ink_fraction=round(broad_fraction, 6),
        broad_ink_fraction_4pt=round(broad_fraction_4pt, 6),
        boundary_complexity=round(complexity, 6),
        small_component_fraction=round(small_fraction, 6),
    )


def compare_linework(
    baseline: Image.Image | np.ndarray,
    candidate: Image.Image | np.ndarray,
) -> dict[str, Any]:
    baseline_metrics = analyze_linework(baseline)
    candidate_metrics = analyze_linework(candidate)
    return {
        "baseline": baseline_metrics.to_json(),
        "candidate": candidate_metrics.to_json(),
        "widthP90DeltaPx": round(candidate_metrics.width_p90_px - baseline_metrics.width_p90_px, 3),
        "inkDensityDelta": round(candidate_metrics.ink_density - baseline_metrics.ink_density, 6),
        "broadInkFractionDelta": round(candidate_metrics.broad_ink_fraction - baseline_metrics.broad_ink_fraction, 6),
        "boundaryComplexityDelta": round(candidate_metrics.boundary_complexity - baseline_metrics.boundary_complexity, 6),
    }


def load_linework_images(value: bytes | bytearray | Path | str) -> list[Image.Image]:
    return [page.image for page in load_linework_page_records(value)]


def load_linework_page_records(value: bytes | bytearray | Path | str) -> list[LineworkPage]:
    payload = Path(value).read_bytes() if isinstance(value, (Path, str)) else bytes(value)
    if payload.startswith(b"%PDF"):
        return _render_pdf_trace_pages(payload)
    with Image.open(io.BytesIO(payload)) as image:
        return [LineworkPage(image.convert("RGB").copy(), 1, None, None, None, None)]


def load_pdf_layers(value: bytes | bytearray | Path | str) -> list[dict[str, Any]]:
    """Extract complete, furniture-only, and embedded trace rasters per PDF page."""
    payload = Path(value).read_bytes() if isinstance(value, (Path, str)) else bytes(value)
    if not payload.startswith(b"%PDF"):
        raise ValueError("PDF layer extraction requires PDF bytes or a PDF path.")
    document = fitz.open(stream=payload, filetype="pdf")
    furniture_document = fitz.open(stream=_pdf_without_image_xobjects(payload), filetype="pdf")
    pages = list(document)
    parsed: list[tuple[int, Any, re.Match[str] | None, re.Match[str] | None]] = []
    for pdf_index, page in enumerate(pages, start=1):
        text = page.get_text()
        page_match = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", text)
        row_match = re.search(r"Row\s+(\d+)\s*/\s*Column\s+(\d+)", text)
        if page_match:
            parsed.append((pdf_index, page, page_match, row_match))
    selected = parsed or [(index, page, None, None) for index, page in enumerate(pages, start=1)]
    layers: list[dict[str, Any]] = []
    for trace_index, (pdf_index, page, page_match, row_match) in enumerate(selected, start=1):
        complete = _render_page(page)
        furniture = _render_page(furniture_document[pdf_index - 1])
        trace = _extract_largest_embedded_image(document, page)
        trace_native_size = list(trace.size) if trace is not None else None
        placement = _largest_image_rect(page)
        if trace is not None and placement is not None:
            target_size = (max(1, round(placement.width)), max(1, round(placement.height)))
            trace = trace.resize(target_size, Image.Resampling.LANCZOS)
        layers.append({
            "complete": complete,
            "furniture": furniture,
            "trace": trace,
            "traceNativeSize": trace_native_size,
            "tracePlacementRect": (
                [round(placement.x0, 3), round(placement.y0, 3), round(placement.x1, 3), round(placement.y1, 3)]
                if placement is not None else None
            ),
            "comparisonDpi": 72,
            "traceResampling": "LANCZOS to PDF placement rectangle",
            "tracePageIndex": int(page_match.group(1)) if page_match else trace_index,
            "pdfPageIndex": pdf_index,
            "row": int(row_match.group(1)) if row_match else None,
            "column": int(row_match.group(2)) if row_match else None,
            "label": page.get_text().splitlines()[0].strip() if page.get_text().splitlines() else None,
        })
    document.close()
    furniture_document.close()
    return layers


def build_report(value: bytes | bytearray | Path | str) -> dict[str, Any]:
    pages = load_linework_page_records(value)
    metrics = [
        {
            **analyze_linework(page.image).to_json(),
            "tracePageIndex": page.trace_page_index,
            "pdfPageIndex": page.pdf_page_index,
            "row": page.row,
            "column": page.column,
            "label": page.label,
        }
        for page in pages
    ]
    for field in ("width_p90_px", "broad_ink_fraction", "boundary_complexity"):
        maximum = max((page[field] for page in metrics), default=0)
        flag = {
            "width_p90_px": "isMaxWidthP90",
            "broad_ink_fraction": "isMaxBroadInk",
            "boundary_complexity": "isMaxComplexity",
        }[field]
        for page in metrics:
            page[flag] = page[field] == maximum
    return {
        "pageCount": len(pages),
        "pages": metrics,
        "aggregate": {
            "widthP90MedianPx": round(float(np.median([page["width_p90_px"] for page in metrics])), 3) if metrics else 0.0,
            "inkDensityMedian": round(float(np.median([page["ink_density"] for page in metrics])), 6) if metrics else 0.0,
            "broadInkFractionMedian": round(float(np.median([page["broad_ink_fraction"] for page in metrics])), 6) if metrics else 0.0,
            "boundaryComplexityMedian": round(float(np.median([page["boundary_complexity"] for page in metrics])), 6) if metrics else 0.0,
        },
    }


def build_pdf_layer_report(value: bytes | bytearray | Path | str) -> dict[str, Any]:
    """Measure complete-page, furniture-only, and embedded trace layers."""
    pages: list[dict[str, Any]] = []
    for layer_page in load_pdf_layers(value):
        layer_metrics: dict[str, dict[str, Any] | None] = {}
        for layer_name in ("complete", "furniture", "trace"):
            image = layer_page[layer_name]
            layer_metrics[layer_name] = analyze_linework(image).to_json() if image is not None else None
        pages.append({
            "tracePageIndex": layer_page["tracePageIndex"],
            "pdfPageIndex": layer_page["pdfPageIndex"],
            "row": layer_page["row"],
            "column": layer_page["column"],
            "label": layer_page["label"],
            "layers": layer_metrics,
            "traceNativeSize": layer_page["traceNativeSize"],
            "tracePlacementRect": layer_page["tracePlacementRect"],
            "comparisonDpi": layer_page["comparisonDpi"],
            "traceResampling": layer_page["traceResampling"],
        })
    return {"pageCount": len(pages), "pages": pages}


def _to_grayscale(image: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(image, Image.Image):
        return np.asarray(image.convert("L"), dtype=np.uint8)
    array = np.asarray(image)
    if array.ndim == 2:
        return array.astype(np.uint8)
    if array.ndim == 3 and array.shape[2] in {3, 4}:
        return cv2.cvtColor(array[:, :, :3].astype(np.uint8), cv2.COLOR_RGB2GRAY)
    raise ValueError("Linework image must be grayscale, RGB, or RGBA.")


def _boundary_complexity(
    ink: np.ndarray,
    labels: np.ndarray,
    stats: np.ndarray,
    component_count: int,
) -> float:
    weighted_sum = 0.0
    weight_total = 0
    for label in range(1, component_count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < 4:
            continue
        component = (labels == label).astype(np.uint8) * 255
        contours, _hierarchy = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        perimeter = cv2.arcLength(contour, True)
        hull = cv2.convexHull(contour)
        hull_perimeter = max(1.0, cv2.arcLength(hull, True))
        weighted_sum += (perimeter / hull_perimeter) * area
        weight_total += area
    return weighted_sum / max(1, weight_total)


def _render_pdf_trace_pages(payload: bytes) -> list[LineworkPage]:
    document = fitz.open(stream=payload, filetype="pdf")
    pages = list(document)
    parsed: list[tuple[int, Any, re.Match[str] | None, re.Match[str] | None]] = []
    for pdf_index, page in enumerate(pages, start=1):
        text = page.get_text()
        page_match = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", text)
        row_match = re.search(r"Row\s+(\d+)\s*/\s*Column\s+(\d+)", text)
        if page_match:
            parsed.append((pdf_index, page, page_match, row_match))
    selected = parsed or [(index, page, None, None) for index, page in enumerate(pages, start=1)]
    rendered: list[LineworkPage] = []
    for trace_index, (pdf_index, page, page_match, row_match) in enumerate(selected, start=1):
        image = _render_page(page)
        rendered.append(LineworkPage(
            image=image,
            trace_page_index=int(page_match.group(1)) if page_match else trace_index,
            pdf_page_index=pdf_index,
            row=int(row_match.group(1)) if row_match else None,
            column=int(row_match.group(2)) if row_match else None,
            label=page.get_text().splitlines()[0].strip() if page.get_text().splitlines() else None,
        ))
    document.close()
    return rendered


def _render_page(page: Any) -> Image.Image:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.0, 1.0), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def _extract_largest_embedded_image(document: Any, page: Any) -> Image.Image | None:
    candidates: list[tuple[int, Image.Image]] = []
    for image_info in page.get_images(full=True):
        try:
            pixmap = fitz.Pixmap(document, image_info[0])
            if pixmap.n - pixmap.alpha > 3:
                pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
            mode = "L" if pixmap.n - pixmap.alpha == 1 else "RGB"
            image = Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples).convert("RGB")
            candidates.append((image.width * image.height, image))
        except Exception:
            continue
    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None


def _largest_image_rect(page: Any) -> Any | None:
    rects: list[Any] = []
    for image_info in page.get_images(full=True):
        rects.extend(page.get_image_rects(image_info[0]))
    return max(rects, key=lambda rect: rect.width * rect.height) if rects else None


def _pdf_without_image_xobjects(payload: bytes) -> bytes:
    reader = PdfReader(io.BytesIO(payload))
    pages = list(reader.pages)
    writer = PdfWriter()
    for page in pages:
        resources = page.get("/Resources")
        xobjects = resources.get("/XObject") if resources else None
        if not xobjects:
            continue
        image_names = [
            str(name).lstrip("/")
            for name, reference in xobjects.items()
            if _is_trace_xobject(reference.get_object(), str(name))
        ]
        if not image_names:
            continue
        contents = page.get_contents()
        if contents is None:
            continue
        data = contents.get_data()
        for image_name in image_names:
            data = re.sub(rb"/" + re.escape(image_name.encode("ascii")) + rb"\s+Do\b", b"", data)
        stream = DecodedStreamObject()
        stream.set_data(data)
        page[NameObject("/Contents")] = stream
    for page in pages:
        writer.add_page(page)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def _is_trace_xobject(value: Any, name: str) -> bool:
    subtype = value.get("/Subtype")
    if subtype == "/Image":
        return True
    if subtype != "/Form":
        return False
    nested_resources = value.get("/Resources")
    nested_xobjects = nested_resources.get("/XObject") if nested_resources else None
    if nested_xobjects:
        return any(reference.get_object().get("/Subtype") == "/Image" for reference in nested_xobjects.values())
    return name.startswith("/FormXob")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect print-scale Detail Line quality.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    report = build_report(args.input)
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
