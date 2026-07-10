from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageFilter

from .pipeline import (
    PREVIEW_MAX_PX,
    TemplateSettings,
    _clean_color_boundary_mask,
    _clean_feature_line_tuning,
    _detail_line_mask,
    _filter_clean_detail_components,
    _flatten_detail_work_image,
    _head_feature_boost_mask,
    _initial_subject_mask,
    _load_image,
    _make_preview_layers,
    _mask_bounds,
    _mask_to_svg_path,
    _preview_mask,
    _remove_small_components,
    _subject_mask,
)


def export_trace_debug_layers(image_bytes: bytes, settings: TemplateSettings, output_dir: Path | str) -> list[Path]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    source = _load_image(image_bytes)
    initial_mask = _initial_subject_mask(source, settings)
    subject_mask = _subject_mask(source, settings)
    bounds = _mask_bounds(subject_mask)

    cropped_source = source.crop(bounds)
    cropped_mask = subject_mask.crop(bounds)
    preview_png, outer_line_png, _detail_line_png, _paint_guide_png = _make_preview_layers(cropped_source, cropped_mask, settings)
    preview_source = cropped_source.copy()
    preview_source.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.Resampling.LANCZOS)
    preview_mask = cropped_mask.resize(preview_source.size, Image.Resampling.NEAREST)
    starter_template_style = settings.template_style if settings.template_style != "manual" else "paint"
    flattened_source = _flatten_detail_work_image(preview_source, settings.detail_cleanup, starter_template_style)
    luminance_edges = _debug_luminance_edges(flattened_source, preview_mask, settings)
    color_boundaries = _clean_color_boundary_mask(flattened_source, preview_mask, settings.detail_cleanup, print_scale=False)
    dark_features = _head_feature_boost_mask(flattened_source, preview_mask, settings.detail_cleanup)
    raw_detail_candidates = _combine_masks(luminance_edges, color_boundaries, dark_features)
    cleaned_detail_components = _debug_clean_components(raw_detail_candidates, settings)
    starter_detail_mask = _detail_line_mask(
        preview_source,
        preview_mask,
        cleanup=settings.detail_cleanup,
        print_scale=False,
        template_style=starter_template_style,
    )
    path_mask = _preview_mask(cropped_source, cropped_mask)
    outer_cut_path = _mask_to_svg_path(path_mask, simplify_px=max(1.2, settings.smoothing))

    written = [
        _write_image(output_path / "source.png", source),
        _write_image(output_path / "mask.png", initial_mask),
        _write_image(output_path / "filled-mask.png", subject_mask),
        _write_image(output_path / "flattened.png", flattened_source),
        _write_image(output_path / "luminance-edges.png", luminance_edges),
        _write_image(output_path / "color-boundaries.png", color_boundaries),
        _write_image(output_path / "dark-features.png", dark_features),
        _write_image(output_path / "raw-detail-candidates.png", raw_detail_candidates),
        _write_image(output_path / "cleaned-detail-components.png", cleaned_detail_components),
        _write_image(output_path / "final-starter-details.png", starter_detail_mask),
        _write_bytes(output_path / "outer-line.png", outer_line_png),
        _write_text(output_path / "outer-cut-path.svg", _debug_svg(path_mask.width, path_mask.height, outer_cut_path)),
        _write_bytes(output_path / "final-preview.png", preview_png),
    ]
    return written


def _debug_luminance_edges(image: Image.Image, mask: Image.Image, settings: TemplateSettings) -> Image.Image:
    blur_radius, edge_threshold, _min_area = _clean_feature_line_tuning(settings.detail_cleanup, print_scale=False)
    gray = image.convert("L").filter(ImageFilter.GaussianBlur(radius=blur_radius))
    edge_arr = np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.uint8) > edge_threshold
    mask_arr = np.asarray(mask.convert("L")) > 0
    return Image.fromarray(((edge_arr & mask_arr).astype(np.uint8) * 255), mode="L")


def _combine_masks(*masks: Image.Image) -> Image.Image:
    if not masks:
        return Image.new("L", (1, 1), 0)
    combined = np.zeros((masks[0].height, masks[0].width), dtype=bool)
    for mask in masks:
        combined |= np.asarray(mask.convert("L")) > 0
    return Image.fromarray((combined.astype(np.uint8) * 255), mode="L")


def _debug_clean_components(mask: Image.Image, settings: TemplateSettings) -> Image.Image:
    _blur_radius, _edge_threshold, min_area = _clean_feature_line_tuning(settings.detail_cleanup, print_scale=False)
    cleaned = _remove_small_components(mask, max(8, min_area))
    return _filter_clean_detail_components(cleaned)


def _debug_svg(width: int, height: int, path_data: str) -> str:
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>',
            f'<path d="{path_data}" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
            "</svg>",
        ]
    )


def _write_image(path: Path, image: Image.Image) -> Path:
    image.save(path, format="PNG")
    return path


def _write_bytes(path: Path, payload: bytes) -> Path:
    path.write_bytes(payload)
    return path


def _write_text(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Cutout Studio tracing debug layers.")
    parser.add_argument("image", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--threshold", type=int, default=TemplateSettings.threshold)
    parser.add_argument("--smoothing", type=int, default=TemplateSettings.smoothing)
    args = parser.parse_args()

    settings = TemplateSettings(threshold=args.threshold, smoothing=args.smoothing)
    written = export_trace_debug_layers(args.image.read_bytes(), settings, args.output_dir)
    for path in written:
        print(path)


if __name__ == "__main__":
    main()
