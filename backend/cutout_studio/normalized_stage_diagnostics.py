"""Read-only, fixed-plane source-to-print detail-line diagnostics.

This module mirrors the current production pipeline through private helpers but
is intentionally not imported by the tracing or export paths.  It records every
rendered-raster transition with native/effective DPI metadata and a deterministic
144-DPI comparison plane so cross-resolution conclusions are meaningful.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
from PIL import Image, ImageFilter

from .detail_quality_diagnostics import analyze_linework, build_pdf_layer_report
from .pipeline import (
    PRINT_DPI,
    TemplateSettings,
    _antialias_line_art_mask,
    _authoritative_cut_line_mask,
    _clean_color_boundary_mask,
    _clean_feature_line_tuning,
    _compose_line_layers,
    _detail_line_mask,
    _detail_line_width,
    _detail_work_image,
    _detail_extraction_mode_used,
    _enclosed_hole_boundary_mask,
    _feature_line_interior,
    _filter_clean_detail_components,
    _flatten_detail_work_image,
    _head_feature_boost_mask,
    _load_image,
    _remove_small_components,
    _restore_detail_support_boundaries,
    _subject_geometry,
    _suppress_exterior_detail_band,
    _trace_extent_in,
    build_template_pdf,
)


CANONICAL_DPI = float(PRINT_DPI)
BROAD_WIDTH_PT = 4.0
DEFAULT_ROI = (0.27, 0.24, 0.73, 0.54)


@dataclass(frozen=True)
class _Stage:
    name: str
    image: Image.Image
    native_dpi: float
    binary: bool = True


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest().upper()


def _image_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _normalize(image: Image.Image, size: tuple[int, int], binary: bool) -> Image.Image:
    return image.resize(size, Image.Resampling.NEAREST if binary else Image.Resampling.LANCZOS)


def _linework_view(image: Image.Image, binary: bool) -> Image.Image:
    """Render internal white-foreground masks as conventional black-on-white linework."""
    if not binary:
        return image
    values = np.asarray(image.convert("L"), dtype=np.uint8)
    return Image.fromarray(255 - values, mode="L")


def _crop_roi(image: Image.Image, roi: tuple[float, float, float, float]) -> Image.Image:
    left, top, right, bottom = roi
    x0 = max(0, min(image.width - 1, round(left * image.width)))
    y0 = max(0, min(image.height - 1, round(top * image.height)))
    x1 = max(x0 + 1, min(image.width, round(right * image.width)))
    y1 = max(y0 + 1, min(image.height, round(bottom * image.height)))
    return image.crop((x0, y0, x1, y1))


def _metrics(image: Image.Image, dpi: float) -> dict[str, Any]:
    if image.mode == "RGBA":
        alpha = image.getchannel("A")
        white = Image.new("RGB", image.size, "white")
        black = image.convert("RGB")
        image = Image.composite(black, white, alpha)
    return analyze_linework(image, comparison_dpi=dpi).to_json()


def _rendered_detail_stages(
    image: Image.Image,
    mask: Image.Image,
    cleanup: int,
    print_scale: bool,
    speck_area: int,
    physical_width_in: float,
    on_stage: Callable[[_Stage], None] | None = None,
) -> tuple[list[_Stage], Image.Image]:
    """Mirror _clean_feature_line_mask and expose each real transition."""
    work_image, work_mask, original_size = _detail_work_image(image, mask)
    native_dpi = work_image.width / max(0.01, physical_width_in)
    stages: list[_Stage] = []

    def emit(stage: _Stage) -> None:
        if on_stage is not None:
            on_stage(stage)
        else:
            stages.append(stage)

    blur_radius, edge_threshold, min_area = _clean_feature_line_tuning(cleanup, print_scale)
    flattened = _flatten_detail_work_image(work_image, cleanup, "clean")
    emit(_Stage("flattened-work-image", flattened, native_dpi, False))
    gray = flattened.convert("L").filter(ImageFilter.GaussianBlur(radius=blur_radius))
    edge_arr = np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.uint8) > edge_threshold
    mask_arr = np.asarray(work_mask.convert("L")) > 0
    interior_arr = np.asarray(_feature_line_interior(work_mask)) > 0
    luminance = Image.fromarray((edge_arr & mask_arr & interior_arr).astype(np.uint8) * 255, mode="L")
    emit(_Stage("luminance-edge-candidate", luminance, native_dpi))
    area_filtered = _remove_small_components(luminance, min_area)
    emit(_Stage("small-component-filtering", area_filtered, native_dpi))
    cleaned_components = _filter_clean_detail_components(area_filtered)
    emit(_Stage("clean-detail-filtering", cleaned_components, native_dpi))
    color = _clean_color_boundary_mask(flattened, work_mask, cleanup, print_scale)
    emit(_Stage("color-boundary-candidate", color, native_dpi))
    head = _head_feature_boost_mask(flattened, work_mask, cleanup)
    emit(_Stage("head-feature-candidate", head, native_dpi))
    holes = Image.fromarray((_enclosed_hole_boundary_mask(work_mask, min_area)).astype(np.uint8) * 255, mode="L")
    emit(_Stage("enclosed-hole-candidate", holes, native_dpi))
    combined = Image.fromarray(
        ((np.asarray(cleaned_components) > 0) | (np.asarray(color) > 0) | (np.asarray(head) > 0) | (np.asarray(holes) > 0)).astype(np.uint8) * 255,
        mode="L",
    )
    emit(_Stage("combined-raw-candidate", combined, native_dpi))
    restored = _restore_detail_support_boundaries(combined, work_mask, speck_area)
    emit(_Stage("support-boundary-restoration", restored, native_dpi))
    area_filtered_again = _remove_small_components(restored, max(24, min_area - 14))
    emit(_Stage("component-filtering", area_filtered_again, native_dpi))
    filtered_again = _filter_clean_detail_components(area_filtered_again)
    emit(_Stage("component-filtered-detail", filtered_again, native_dpi))
    if filtered_again.size != original_size:
        filtered_again = filtered_again.resize(original_size, Image.Resampling.LANCZOS if print_scale else Image.Resampling.NEAREST)
    emit(_Stage("final-detail-before-exterior-suppression", filtered_again, native_dpi))
    suppressed = _suppress_exterior_detail_band(filtered_again, mask, print_scale)
    emit(_Stage("exterior-band-suppression", suppressed, native_dpi))
    final = _restore_detail_support_boundaries(suppressed, mask, speck_area)
    emit(_Stage("final-detail-mask", final, native_dpi))
    expected = _detail_line_mask(image, mask, cleanup, print_scale, template_style="clean", detail_extraction_mode="rendered", speck_area=speck_area)
    if np.asarray(expected).tobytes() != np.asarray(final).tobytes():
        raise AssertionError("Diagnostic rendered path diverged from _detail_line_mask")
    return stages, final


def _line_art_stages(
    image: Image.Image,
    mask: Image.Image,
    cleanup: int,
    print_scale: bool,
    template_style: str = "clean",
    physical_width_in: float = 1.0,
    on_stage: Callable[[_Stage], None] | None = None,
) -> tuple[list[_Stage], Image.Image]:
    work_image, work_mask, _original_size = _detail_work_image(image, mask, max_work_edge=1800 if print_scale else 1400)
    native_dpi = work_image.width / max(0.01, physical_width_in)
    rgb = np.asarray(work_image.convert("RGB"), dtype=np.uint8)
    median = cv2.medianBlur(rgb, 3)
    stages: list[_Stage] = []

    def emit(stage: _Stage) -> None:
        if on_stage is not None:
            on_stage(stage)
        else:
            stages.append(stage)

    emit(_Stage("line-art-median-work-image", Image.fromarray(median, mode="RGB"), native_dpi, False))
    lab = cv2.cvtColor(median, cv2.COLOR_RGB2LAB)
    lightness = lab[:, :, 0].astype(np.int16)
    chroma = np.hypot(lab[:, :, 1].astype(np.float32) - 128, lab[:, :, 2].astype(np.float32) - 128)
    interior = np.asarray(_erode_for_diagnostic(work_mask, 15)) > 0
    neutral_dark = (lightness < 115) & (chroma < 24)
    local_lightness = cv2.GaussianBlur(lightness.astype(np.float32), (0, 0), sigmaX=2.2, sigmaY=2.2)
    locally_dark = ((local_lightness - lightness) > 22) & (lightness < 150)
    raw = (neutral_dark | locally_dark) & interior
    emit(_Stage("line-art-ink-candidate", Image.fromarray(raw.astype(np.uint8) * 255, mode="L"), native_dpi))
    cleaned = _remove_small_components(Image.fromarray(raw.astype(np.uint8) * 255, mode="L"), 8 + round((cleanup / 100) * (28 if print_scale else 12)))
    emit(_Stage("line-art-component-filtering", cleaned, native_dpi))
    final = _detail_line_mask(
        image,
        mask,
        cleanup,
        print_scale,
        template_style=template_style,
        detail_extraction_mode="lineArt",
    )
    emit(_Stage("final-detail-mask", final, native_dpi))
    return stages, final


def _erode_for_diagnostic(mask: Image.Image, kernel_size: int) -> Image.Image:
    size = max(1, kernel_size)
    if size % 2 == 0:
        size += 1
    return Image.fromarray(cv2.erode(np.asarray(mask.convert("L"), dtype=np.uint8), np.ones((size, size), dtype=np.uint8)), mode="L")


def capture_source_stages(
    source_path: Path,
    settings: TemplateSettings,
    output_dir: Path,
    *,
    roi: tuple[float, float, float, float] = DEFAULT_ROI,
    label: str = "run-10",
) -> dict[str, Any]:
    source_bytes = source_path.read_bytes()
    source = _load_image(source_bytes)
    initial, support, cut_line, support_bounds, cut_line_bounds = _subject_geometry(source, settings)
    cropped_source = source.crop(support_bounds)
    cropped_support = support.crop(support_bounds)
    cropped_cut_line = cut_line.crop(support_bounds)
    trace_width, trace_height = _trace_extent_in(support_bounds, cut_line, cut_line_bounds, settings.finished_height_in)
    canonical_size = (max(1, round(trace_width * CANONICAL_DPI)), max(1, round(trace_height * CANONICAL_DPI)))
    preview_source = cropped_source.copy()
    preview_source.thumbnail((960, 960), Image.Resampling.LANCZOS)
    preview_support = cropped_support.resize(preview_source.size, Image.Resampling.NEAREST)
    preview_cut_line = cropped_cut_line.resize(preview_source.size, Image.Resampling.NEAREST)
    output_dir.mkdir(parents=True, exist_ok=True)
    native_dir = output_dir / "native"
    canonical_dir = output_dir / "canonical-144dpi"
    roi_dir = output_dir / "roi-144dpi"
    native_dir.mkdir(exist_ok=True)
    canonical_dir.mkdir(exist_ok=True)
    roi_dir.mkdir(exist_ok=True)

    records: list[dict[str, Any]] = []

    def record_stage(stage: _Stage) -> None:
        view = _linework_view(stage.image, stage.binary)
        native_name = f"{_slug(stage.name)}.png"
        native_path = native_dir / native_name
        native_path.write_bytes(_image_bytes(view))
        canonical = _normalize(view, canonical_size, stage.binary)
        canonical_path = canonical_dir / native_name
        canonical_path.write_bytes(_image_bytes(canonical))
        roi_image = _crop_roi(canonical, roi)
        roi_path = roi_dir / native_name
        roi_path.write_bytes(_image_bytes(roi_image))
        records.append({
            "name": stage.name,
            "nativePath": str(native_path),
            "canonicalPath": str(canonical_path),
            "roiPath": str(roi_path),
            "nativeSize": list(view.size),
            "canonicalSize": list(canonical.size),
            "nativeDpi": round(view.width / trace_width, 6),
            "effectiveDpi": round(view.width / trace_width, 6),
            "comparisonDpi": CANONICAL_DPI,
            "physicalSizeIn": [round(trace_width, 6), round(trace_height, 6)],
            "sha256": _sha256(canonical_path.read_bytes()),
            "nativeSha256": _sha256(native_path.read_bytes()),
            "metrics": _metrics(view, view.width / trace_width),
            "canonicalMetrics": _metrics(canonical, CANONICAL_DPI),
            "roiMetrics": _metrics(roi_image, CANONICAL_DPI),
        })

    for stage in (
        _Stage("original-source", source.convert("RGB"), source.width / trace_width, False),
        _Stage("cropped-support-source", cropped_source.convert("RGB"), cropped_source.width / trace_width, False),
        _Stage("support-mask", cropped_support, cropped_support.width / trace_width),
        _Stage("authoritative-cut-line-mask", cropped_cut_line, cropped_cut_line.width / trace_width),
        _Stage("preview-flattened-work-image", _flatten_detail_work_image(preview_source, settings.detail_cleanup, "clean"), preview_source.width / trace_width, False),
    ):
        record_stage(stage)
    preview_mode = _detail_extraction_mode_used(
        preview_source,
        preview_support,
        settings.template_style,
        settings.detail_extraction_mode,
    )
    preview_stages, preview_final = (
        _line_art_stages(preview_source, preview_support, settings.detail_cleanup, False, template_style=settings.template_style, physical_width_in=trace_width)
        if preview_mode == "lineArt"
        else _rendered_detail_stages(preview_source, preview_support, settings.detail_cleanup, False, settings.speck_area, trace_width)
    )
    for stage in preview_stages:
        if stage.name == "flattened-work-image":
            continue
        record_stage(_Stage(f"preview-{stage.name}", stage.image, stage.native_dpi, stage.binary))
    preview_normalized = _normalize(preview_final, canonical_size, True)
    record_stage(_Stage("preview-detail-normalized-144dpi", preview_normalized, CANONICAL_DPI))

    print_image = cropped_source.resize(canonical_size, Image.Resampling.LANCZOS)
    resized_support = cropped_support.resize(canonical_size, Image.Resampling.LANCZOS)
    if settings.smoothing > 0:
        resized_support = resized_support.filter(ImageFilter.GaussianBlur(radius=max(1, settings.smoothing * 2)))
    print_support = resized_support.point(lambda px: 255 if px >= 128 else 0)
    print_cut_line = cropped_cut_line.resize(canonical_size, Image.Resampling.NEAREST)
    for stage in (
        _Stage("print-source-resized-144dpi", print_image, CANONICAL_DPI, False),
        _Stage("print-support-mask", print_support, CANONICAL_DPI),
        _Stage("print-authoritative-cut-line-mask", print_cut_line, CANONICAL_DPI),
    ):
        record_stage(stage)
    print_mode = "lineArt" if settings.detail_extraction_mode == "lineArt" else preview_mode
    if print_mode == "lineArt":
        print_stages, print_final = _line_art_stages(
            print_image,
            print_support,
            settings.detail_cleanup,
            True,
            template_style=settings.template_style,
            physical_width_in=trace_width,
            on_stage=lambda stage: record_stage(_Stage(f"print-{stage.name}", stage.image, CANONICAL_DPI, stage.binary)),
        )
    else:
        print_stages, print_final = _rendered_detail_stages(
            print_image,
            print_support,
            settings.detail_cleanup,
            True,
            settings.speck_area,
            trace_width,
            on_stage=lambda stage: record_stage(_Stage(f"print-{stage.name}", stage.image, CANONICAL_DPI, stage.binary)),
        )
    detail_before_width = print_final
    width = _detail_line_width(settings, print_scale=True, detail_extraction_mode=print_mode)
    expanded = detail_before_width.filter(ImageFilter.MaxFilter(max(1, width if width % 2 else width + 1)))
    record_stage(_Stage("print-detail-after-width-expansion", expanded, CANONICAL_DPI))
    antialiased = _antialias_line_art_mask(expanded) if print_mode == "lineArt" else expanded
    if print_mode == "lineArt":
        record_stage(_Stage("print-detail-after-antialias", antialiased, CANONICAL_DPI))
    rgba_detail = Image.new("RGBA", antialiased.size, (0, 0, 0, 0))
    rgba_detail.putalpha(antialiased)
    record_stage(_Stage("print-final-rgba-detail-layer", rgba_detail, CANONICAL_DPI, False))
    cut_only = _authoritative_cut_line_mask(print_support)
    eroded = _erode_for_diagnostic(cut_only, 3)
    boundary = Image.fromarray(np.maximum(0, np.asarray(cut_only, dtype=np.int16) - np.asarray(eroded, dtype=np.int16)).astype(np.uint8), mode="L")
    outer = boundary.filter(ImageFilter.MaxFilter(9))
    record_stage(_Stage("print-cut-line-only", outer, CANONICAL_DPI))
    composed = _compose_line_layers(Image.fromarray(np.dstack([np.zeros_like(outer), np.zeros_like(outer), np.zeros_like(outer), np.asarray(outer)]), mode="RGBA"), rgba_detail)
    record_stage(_Stage("print-composed-trace", composed, CANONICAL_DPI, False))

    manifest = {
        "label": label,
        "source": str(source_path),
        "sourceSha256": _sha256(source_bytes),
        "settings": {
            "finishedHeightIn": settings.finished_height_in,
            "threshold": settings.threshold,
            "smoothing": settings.smoothing,
            "speckArea": settings.speck_area,
            "holeArea": settings.hole_area,
            "detailCleanup": settings.detail_cleanup,
            "templateStyle": settings.template_style,
            "detailExtractionModeRequested": settings.detail_extraction_mode,
            "detailExtractionModeUsed": preview_mode,
        },
        "supportBounds": list(support_bounds),
        "cutLineBounds": list(cut_line_bounds),
        "traceSizeIn": [round(trace_width, 6), round(trace_height, 6)],
        "canonicalDpi": CANONICAL_DPI,
        "canonicalSizePx": list(canonical_size),
        "broadWidthPt": BROAD_WIDTH_PT,
        "interpolation": {"binary": "NEAREST", "source": "LANCZOS"},
        "roi": {
            "description": "Run 10 face interior containing both eyes, nose, mustache, and mouth; excludes the authoritative Cut Line.",
            "normalizedSupport": list(roi),
            "sourceCoordinates": [
                round(support_bounds[0] + roi[0] * cropped_source.width, 3),
                round(support_bounds[1] + roi[1] * cropped_source.height, 3),
                round(support_bounds[0] + roi[2] * cropped_source.width, 3),
                round(support_bounds[1] + roi[3] * cropped_source.height, 3),
            ],
            "sourceSupportCoordinates": [round(roi[0] * cropped_source.width, 3), round(roi[1] * cropped_source.height, 3), round(roi[2] * cropped_source.width, 3), round(roi[3] * cropped_source.height, 3)],
            "previewCoordinates": [round(roi[0] * preview_source.width, 3), round(roi[1] * preview_source.height, 3), round(roi[2] * preview_source.width, 3), round(roi[3] * preview_source.height, 3)],
            "printCoordinates": [round(roi[0] * canonical_size[0], 3), round(roi[1] * canonical_size[1], 3), round(roi[2] * canonical_size[0], 3), round(roi[3] * canonical_size[1], 3)],
            "cutLineExcluded": True,
        },
        "stages": records,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def run_source_diagnostic(source_path: Path, settings: TemplateSettings, output_root: Path, label: str) -> dict[str, Any]:
    stage_dir = output_root / label
    manifest = capture_source_stages(source_path, settings, stage_dir, label=label)
    pdf = build_template_pdf(source_path.read_bytes(), settings)
    pdf_path = output_root / f"{label}-current-main.pdf"
    pdf_path.write_bytes(pdf)
    manifest["freshPdf"] = {
        "path": str(pdf_path),
        "sha256": _sha256(pdf),
        "layerReport": build_pdf_layer_report(pdf),
    }
    (stage_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def run_control_summary(source_path: Path, settings: TemplateSettings, output_root: Path, label: str) -> dict[str, Any]:
    """Capture the control's final physical-plane transitions without duplicating huge intermediates."""
    source = _load_image(source_path.read_bytes())
    _initial, support, cut_line, support_bounds, cut_line_bounds = _subject_geometry(source, settings)
    cropped_source = source.crop(support_bounds)
    cropped_support = support.crop(support_bounds)
    trace_width, trace_height = _trace_extent_in(support_bounds, cut_line, cut_line_bounds, settings.finished_height_in)
    canonical_size = (max(1, round(trace_width * CANONICAL_DPI)), max(1, round(trace_height * CANONICAL_DPI)))
    print_image = cropped_source.resize(canonical_size, Image.Resampling.LANCZOS)
    resized_support = cropped_support.resize(canonical_size, Image.Resampling.LANCZOS)
    if settings.smoothing > 0:
        resized_support = resized_support.filter(ImageFilter.GaussianBlur(radius=max(1, settings.smoothing * 2)))
    print_support = resized_support.point(lambda px: 255 if px >= 128 else 0)
    mode = _detail_extraction_mode_used(cropped_source, cropped_support, settings.template_style, settings.detail_extraction_mode)
    before = _detail_line_mask(print_image, print_support, settings.detail_cleanup, True, template_style=settings.template_style, detail_extraction_mode=mode, speck_area=settings.speck_area)
    width = _detail_line_width(settings, print_scale=True, detail_extraction_mode=mode)
    after = before.filter(ImageFilter.MaxFilter(max(1, width if width % 2 else width + 1)))
    after_for_measurement = _antialias_line_art_mask(after) if mode == "lineArt" else after
    roi_before = _crop_roi(_linework_view(before, True), DEFAULT_ROI)
    roi_after = _crop_roi(_linework_view(after_for_measurement, True), DEFAULT_ROI)
    pdf = build_template_pdf(source_path.read_bytes(), settings)
    output_root.mkdir(parents=True, exist_ok=True)
    pdf_path = output_root / f"{label}-current-main.pdf"
    pdf_path.write_bytes(pdf)
    manifest = {
        "label": label,
        "source": str(source_path),
        "sourceSha256": _sha256(source_path.read_bytes()),
        "settings": {"finishedHeightIn": settings.finished_height_in, "templateStyle": settings.template_style, "detailExtractionModeUsed": mode},
        "traceSizeIn": [round(trace_width, 6), round(trace_height, 6)],
        "canonicalDpi": CANONICAL_DPI,
        "canonicalSizePx": list(canonical_size),
        "roi": {"normalizedSupport": list(DEFAULT_ROI), "cutLineExcluded": True},
        "transitions": {
            "detailBeforeWidthExpansion": {"canonicalMetrics": _metrics(_linework_view(before, True), CANONICAL_DPI), "roiMetrics": _metrics(roi_before, CANONICAL_DPI)},
            "detailAfterWidthExpansion": {"canonicalMetrics": _metrics(_linework_view(after, True), CANONICAL_DPI), "roiMetrics": _metrics(_crop_roi(_linework_view(after, True), DEFAULT_ROI), CANONICAL_DPI)},
            "detailAfterAntialias": {"canonicalMetrics": _metrics(_linework_view(after_for_measurement, True), CANONICAL_DPI), "roiMetrics": _metrics(roi_after, CANONICAL_DPI)},
        },
        "freshPdf": {"path": str(pdf_path), "sha256": _sha256(pdf), "layerReport": build_pdf_layer_report(pdf)},
    }
    (output_root / f"{label}-control-summary.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Capture normalized source-to-print detail stages.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--label", default="run-10")
    parser.add_argument("--finished-height", type=float, default=36.0)
    parser.add_argument("--project-name", default="Run 10 Mustache Cartoon")
    parser.add_argument("--smoothing", type=int, default=2)
    parser.add_argument("--minimum-tile-cols", type=int, default=0)
    parser.add_argument("--minimum-tile-rows", type=int, default=0)
    parser.add_argument("--control-summary", action="store_true")
    args = parser.parse_args(argv)
    settings = TemplateSettings(
        finished_height_in=args.finished_height,
        project_name=args.project_name,
        smoothing=args.smoothing,
        minimum_tile_cols=args.minimum_tile_cols,
        minimum_tile_rows=args.minimum_tile_rows,
    )
    manifest = run_control_summary(args.source, settings, args.output, args.label) if args.control_summary else run_source_diagnostic(args.source, settings, args.output, args.label)
    print(json.dumps({"label": manifest["label"], "sourceSha256": manifest["sourceSha256"], "pdf": manifest["freshPdf"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
