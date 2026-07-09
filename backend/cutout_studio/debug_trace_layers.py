from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from .pipeline import (
    TemplateSettings,
    _border_background_rgb,
    _load_image,
    _looks_like_line_art,
    _make_preview_layers,
    _mask_bounds,
    _mask_to_svg_path,
    _preview_mask,
    _subject_mask,
)


def export_trace_debug_layers(image_bytes: bytes, settings: TemplateSettings, output_dir: Path | str) -> list[Path]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    source = _load_image(image_bytes)
    initial_mask = _initial_debug_mask(source, settings)
    subject_mask = _subject_mask(source, settings)
    bounds = _mask_bounds(subject_mask)

    cropped_source = source.crop(bounds)
    cropped_mask = subject_mask.crop(bounds)
    preview_png, outer_line_png, _detail_line_png, _paint_guide_png = _make_preview_layers(cropped_source, cropped_mask, settings)
    path_mask = _preview_mask(cropped_source, cropped_mask)
    outer_cut_path = _mask_to_svg_path(path_mask, simplify_px=max(1.2, settings.smoothing))

    written = [
        _write_image(output_path / "source.png", source),
        _write_image(output_path / "mask.png", initial_mask),
        _write_image(output_path / "filled-mask.png", subject_mask),
        _write_bytes(output_path / "outer-line.png", outer_line_png),
        _write_text(output_path / "outer-cut-path.svg", _debug_svg(path_mask.width, path_mask.height, outer_cut_path)),
        _write_bytes(output_path / "final-preview.png", preview_png),
    ]
    return written


def _initial_debug_mask(image: Image.Image, settings: TemplateSettings) -> Image.Image:
    arr = np.asarray(image, dtype=np.int16)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]

    if np.any(alpha < 245):
        foreground = alpha > 24
    elif _looks_like_line_art(rgb, alpha):
        rgb_float = rgb.astype(np.float32)
        distance_from_white = np.sqrt(np.sum((255.0 - rgb_float) ** 2, axis=2))
        foreground = (distance_from_white > max(28, settings.threshold)) & (alpha > 24)
    else:
        rgb_float = rgb.astype(np.float32)
        bg = _border_background_rgb(rgb)
        distance_from_bg = np.sqrt(np.sum((rgb_float - bg) ** 2, axis=2))
        foreground = distance_from_bg > settings.threshold
    return Image.fromarray((foreground.astype(np.uint8) * 255), mode="L")


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
