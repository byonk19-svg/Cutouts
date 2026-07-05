from __future__ import annotations

import base64
import io
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


TEMPLATE_STYLES = {"cutOnly", "clean", "detailed"}
TEMPLATE_STYLE_ALIASES = {"outline": "cutOnly", "paint": "clean", "extra": "detailed"}
LETTER_WIDTH_IN = 8.5
LETTER_HEIGHT_IN = 11.0
PDF_MARGIN_IN = 0.35
TILE_HEADER_IN = 0.42
OVERLAP_IN = 0.25
PREVIEW_MAX_PX = 960
PRINT_DPI = 144
DETAIL_LINE_COLOR = (118, 118, 118)
BLACK_LINE_COLOR = (0, 0, 0, 255)


@dataclass(frozen=True)
class TemplateSettings:
    finished_height_in: float = 36.0
    threshold: int = 42
    smoothing: int = 2
    speck_area: int = 60
    hole_area: int = 220
    detail_lines: bool = True
    detail_cleanup: int = 70
    template_style: str = "clean"
    palette_size: int = 6

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "TemplateSettings":
        template_style = TEMPLATE_STYLE_ALIASES.get(str(data.get("templateStyle", cls.template_style)), str(data.get("templateStyle", cls.template_style)))
        if template_style not in TEMPLATE_STYLES:
            template_style = cls.template_style
        return cls(
            finished_height_in=_bounded_float(data.get("finishedHeightIn"), 6.0, 96.0, cls.finished_height_in),
            threshold=_bounded_int(data.get("threshold"), 0, 180, cls.threshold),
            smoothing=_bounded_int(data.get("smoothing"), 0, 8, cls.smoothing),
            speck_area=_bounded_int(data.get("speckArea"), 0, 2000, cls.speck_area),
            hole_area=_bounded_int(data.get("holeArea"), 0, 5000, cls.hole_area),
            detail_lines=bool(data.get("detailLines", cls.detail_lines)),
            detail_cleanup=_bounded_int(data.get("detailCleanup"), 0, 100, cls.detail_cleanup),
            template_style=template_style,
            palette_size=_bounded_int(data.get("paletteSize"), 2, 12, cls.palette_size),
        )


@dataclass(frozen=True)
class Paint:
    brand: str
    name: str
    rgb: tuple[int, int, int]
    source: str


@dataclass(frozen=True)
class PaintMatch:
    brand: str
    name: str
    rgb: tuple[int, int, int]
    distance: float
    source: str


@dataclass(frozen=True)
class PaletteColor:
    rgb: tuple[int, int, int]
    coverage: float
    matches: tuple[PaintMatch, ...]


@dataclass(frozen=True)
class TemplateAnalysis:
    source_width_px: int
    source_height_px: int
    subject_bounds_px: tuple[int, int, int, int]
    finished_width_in: float
    finished_height_in: float
    tile_cols: int
    tile_rows: int
    tile_count: int
    preview_png: bytes
    outer_line_png: bytes
    detail_line_png: bytes
    paint_guide_png: bytes
    preview_width_px: int
    preview_height_px: int
    palette: tuple[PaletteColor, ...]

    def to_json(self) -> dict[str, Any]:
        return {
            "sourceWidthPx": self.source_width_px,
            "sourceHeightPx": self.source_height_px,
            "subjectBoundsPx": self.subject_bounds_px,
            "finishedWidthIn": round(self.finished_width_in, 2),
            "finishedHeightIn": round(self.finished_height_in, 2),
            "tileCols": self.tile_cols,
            "tileRows": self.tile_rows,
            "tileCount": self.tile_count,
            "previewPngDataUrl": "data:image/png;base64," + base64.b64encode(self.preview_png).decode("ascii"),
            "outerLinePngDataUrl": "data:image/png;base64," + base64.b64encode(self.outer_line_png).decode("ascii"),
            "detailLinePngDataUrl": "data:image/png;base64," + base64.b64encode(self.detail_line_png).decode("ascii"),
            "paintGuidePngDataUrl": "data:image/png;base64," + base64.b64encode(self.paint_guide_png).decode("ascii"),
            "previewWidthPx": self.preview_width_px,
            "previewHeightPx": self.preview_height_px,
            "palette": [
                {
                    "rgb": color.rgb,
                    "hex": _hex(color.rgb),
                    "coverage": round(color.coverage, 3),
                    "matches": [
                        {
                            "brand": match.brand,
                            "name": match.name,
                            "rgb": match.rgb,
                            "hex": _hex(match.rgb),
                            "distance": round(match.distance, 1),
                            "source": match.source,
                        }
                        for match in color.matches
                    ],
                }
                for color in self.palette
            ],
        }


def analyze_template(image_bytes: bytes, settings: TemplateSettings) -> TemplateAnalysis:
    source = _load_image(image_bytes)
    mask = _subject_mask(source, settings)
    bounds = _mask_bounds(mask)
    cropped_source = source.crop(bounds)
    cropped_mask = mask.crop(bounds)
    finished_width = settings.finished_height_in * (cropped_source.width / cropped_source.height)
    tile_cols, tile_rows = tile_grid(finished_width, settings.finished_height_in)
    preview, outer_line, detail_line, paint_guide = _make_preview_layers(cropped_source, cropped_mask, settings)
    palette = extract_palette(cropped_source, cropped_mask, settings.palette_size)

    return TemplateAnalysis(
        source_width_px=source.width,
        source_height_px=source.height,
        subject_bounds_px=bounds,
        finished_width_in=finished_width,
        finished_height_in=settings.finished_height_in,
        tile_cols=tile_cols,
        tile_rows=tile_rows,
        tile_count=tile_cols * tile_rows,
        preview_png=preview,
        outer_line_png=outer_line,
        detail_line_png=detail_line,
        paint_guide_png=paint_guide,
        preview_width_px=Image.open(io.BytesIO(preview)).width,
        preview_height_px=Image.open(io.BytesIO(preview)).height,
        palette=palette,
    )


def build_template_pdf(image_bytes: bytes, settings: TemplateSettings, edited_detail_png: bytes | None = None) -> bytes:
    source = _load_image(image_bytes)
    mask = _subject_mask(source, settings)
    bounds = _mask_bounds(mask)
    cropped_source = source.crop(bounds)
    cropped_mask = mask.crop(bounds)
    finished_width = settings.finished_height_in * (cropped_source.width / cropped_source.height)
    tile_cols, tile_rows = tile_grid(finished_width, settings.finished_height_in)
    trace = _make_trace_image(cropped_source, cropped_mask, settings, finished_width, settings.finished_height_in, edited_detail_png)
    palette = extract_palette(cropped_source, cropped_mask, settings.palette_size)

    out = io.BytesIO()
    pdf = canvas.Canvas(out, pagesize=letter)
    pdf.setTitle("Cutout Studio Template Pack")
    _draw_overview_page(pdf, cropped_source, finished_width, settings.finished_height_in, tile_cols, tile_rows)
    pdf.showPage()
    _draw_color_guide_page(pdf, cropped_source, palette)
    pdf.showPage()
    _draw_tile_pages(pdf, trace, finished_width, settings.finished_height_in, tile_cols, tile_rows)
    pdf.save()
    return out.getvalue()


def tile_grid(width_in: float, height_in: float) -> tuple[int, int]:
    tile_w = LETTER_WIDTH_IN - 2 * PDF_MARGIN_IN
    tile_h = LETTER_HEIGHT_IN - 2 * PDF_MARGIN_IN - TILE_HEADER_IN
    step_w = tile_w - OVERLAP_IN
    step_h = tile_h - OVERLAP_IN
    cols = max(1, math.ceil(max(0.01, width_in - OVERLAP_IN) / step_w))
    rows = max(1, math.ceil(max(0.01, height_in - OVERLAP_IN) / step_h))
    return cols, rows


def extract_palette(image: Image.Image, mask: Image.Image, palette_size: int) -> tuple[PaletteColor, ...]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    mask_arr = np.asarray(mask.convert("L")) > 0
    pixels = rgb[mask_arr]
    if len(pixels) == 0:
        raise ValueError("No subject pixels were detected.")

    if len(pixels) > 12000:
        stride = max(1, len(pixels) // 12000)
        pixels = pixels[::stride]

    quantized = (pixels // 24) * 24 + 12
    values, counts = np.unique(quantized, axis=0, return_counts=True)
    order = np.argsort(counts)[::-1][:palette_size]
    paints = load_paint_catalog()
    total = float(counts.sum())

    colors_out = []
    for idx in order:
        color = tuple(int(v) for v in values[idx])
        matches = tuple(match_paints(color, paints, limit=3))
        colors_out.append(PaletteColor(rgb=color, coverage=float(counts[idx]) / total, matches=matches))
    return tuple(colors_out)


def match_paints(rgb: tuple[int, int, int], paints: list[Paint], limit: int = 3) -> list[PaintMatch]:
    scored = []
    source = np.array(rgb, dtype=float)
    for paint in paints:
        target = np.array(paint.rgb, dtype=float)
        distance = float(np.linalg.norm(source - target))
        scored.append(PaintMatch(paint.brand, paint.name, paint.rgb, distance, paint.source))
    scored.sort(key=lambda match: match.distance)
    return scored[:limit]


def load_paint_catalog() -> list[Paint]:
    path = Path(__file__).with_name("paint_catalog.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [
        Paint(
            brand=item["brand"],
            name=item["name"],
            rgb=tuple(int(v) for v in item["rgb"]),
            source=item["source"],
        )
        for item in payload
    ]


def _load_image(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception as exc:
        raise ValueError("Upload must be a readable PNG or JPG image.") from exc
    if image.width < 20 or image.height < 20:
        raise ValueError("Image is too small to create a printable template.")
    return image


def _subject_mask(image: Image.Image, settings: TemplateSettings) -> Image.Image:
    arr = np.asarray(image, dtype=np.int16)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    has_alpha_subject = np.any(alpha < 245)

    if has_alpha_subject:
        foreground = alpha > 24
    else:
        rgb_float = rgb.astype(float)
        distance_from_white = np.sqrt(np.sum((255.0 - rgb_float) ** 2, axis=2))
        foreground = distance_from_white > settings.threshold

    mask = Image.fromarray((foreground.astype(np.uint8) * 255), mode="L")
    if settings.smoothing > 0:
        radius = max(1, settings.smoothing)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=radius)).point(lambda px: 255 if px >= 128 else 0)
    if settings.speck_area > 0:
        mask = _remove_small_components(mask, settings.speck_area)
    if settings.hole_area > 0:
        mask = _fill_small_holes(mask, settings.hole_area)

    if not np.any(np.asarray(mask) > 0):
        raise ValueError("No subject was detected. Try lowering the threshold or using a simpler background.")
    return mask


def _remove_small_components(mask: Image.Image, min_area: int) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    keep = np.zeros(arr.shape, dtype=bool)
    visited = np.zeros(arr.shape, dtype=bool)
    height, width = arr.shape
    for y in range(height):
        for x in range(width):
            if visited[y, x] or not arr[y, x]:
                continue
            pixels = _flood(arr, visited, x, y, target=True)
            if len(pixels) >= min_area:
                for px, py in pixels:
                    keep[py, px] = True
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _fill_small_holes(mask: Image.Image, max_area: int) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    visited = np.zeros(arr.shape, dtype=bool)
    filled = arr.copy()
    height, width = arr.shape
    for y in range(height):
        for x in range(width):
            if visited[y, x] or arr[y, x]:
                continue
            pixels = _flood(arr, visited, x, y, target=False)
            touches_edge = any(px == 0 or py == 0 or px == width - 1 or py == height - 1 for px, py in pixels)
            if not touches_edge and len(pixels) <= max_area:
                for px, py in pixels:
                    filled[py, px] = True
    return Image.fromarray((filled.astype(np.uint8) * 255), mode="L")


def _flood(arr: np.ndarray, visited: np.ndarray, start_x: int, start_y: int, target: bool) -> list[tuple[int, int]]:
    height, width = arr.shape
    stack = [(start_x, start_y)]
    visited[start_y, start_x] = True
    pixels = []
    while stack:
        x, y = stack.pop()
        pixels.append((x, y))
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or visited[ny, nx] or arr[ny, nx] != target:
                continue
            visited[ny, nx] = True
            stack.append((nx, ny))
    return pixels


def _mask_bounds(mask: Image.Image) -> tuple[int, int, int, int]:
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("No subject was detected.")
    left, top, right, bottom = bbox
    pad = max(6, round(min(mask.size) * 0.015))
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(mask.width, right + pad),
        min(mask.height, bottom + pad),
    )


def _make_preview_layers(image: Image.Image, mask: Image.Image, settings: TemplateSettings) -> tuple[bytes, bytes, bytes, bytes]:
    preview_image = image.copy()
    preview_mask = mask.copy()
    preview_image.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.Resampling.LANCZOS)
    preview_mask = preview_mask.resize(preview_image.size, Image.Resampling.NEAREST)
    composed, outer, detail = _line_art_layers(
        preview_image,
        preview_mask,
        settings.detail_lines,
        outer_line_width=3,
        detail_line_width=_detail_line_width(settings, print_scale=False),
        detail_cleanup=settings.detail_cleanup,
        template_style=settings.template_style,
        print_scale=False,
    )
    paint_guide = _on_white(preview_image)
    return (
        _png_bytes(composed),
        _png_bytes(outer),
        _png_bytes(detail),
        _png_bytes(paint_guide),
    )


def _png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _make_trace_image(
    image: Image.Image,
    mask: Image.Image,
    settings: TemplateSettings,
    width_in: float,
    height_in: float,
    edited_detail_png: bytes | None = None,
) -> Image.Image:
    target_px = (max(1, round(width_in * PRINT_DPI)), max(1, round(height_in * PRINT_DPI)))
    scaled_image = image.resize(target_px, Image.Resampling.LANCZOS)
    scaled_mask = mask.resize(target_px, Image.Resampling.LANCZOS)
    if settings.smoothing > 0:
        scaled_mask = scaled_mask.filter(ImageFilter.GaussianBlur(radius=max(1, settings.smoothing * 2)))
    scaled_mask = scaled_mask.point(lambda px: 255 if px >= 128 else 0)
    composed, outer, detail = _line_art_layers(
        scaled_image,
        scaled_mask,
        settings.detail_lines,
        outer_line_width=9,
        detail_line_width=_detail_line_width(settings, print_scale=True),
        detail_cleanup=settings.detail_cleanup,
        template_style=settings.template_style,
        print_scale=True,
    )
    if edited_detail_png:
        edited_detail = _edited_detail_layer(edited_detail_png, target_px)
        return _compose_line_layers(outer, edited_detail)
    return composed


def _line_art(
    image: Image.Image,
    mask: Image.Image,
    detail_lines: bool,
    line_width: int,
    detail_cleanup: int,
    print_scale: bool,
) -> Image.Image:
    composed, _outer, _detail = _line_art_layers(
        image,
        mask,
        detail_lines,
        outer_line_width=line_width,
        detail_line_width=5 if print_scale else 3,
        detail_cleanup=detail_cleanup,
        template_style="detailed",
        print_scale=print_scale,
    )
    return composed


def _line_art_layers(
    image: Image.Image,
    mask: Image.Image,
    detail_lines: bool,
    outer_line_width: int,
    detail_line_width: int,
    detail_cleanup: int,
    template_style: str,
    print_scale: bool,
) -> tuple[Image.Image, Image.Image, Image.Image]:
    mask_l = mask.convert("L")
    eroded = mask_l.filter(ImageFilter.MinFilter(3))
    boundary = Image.fromarray(np.maximum(0, np.asarray(mask_l, dtype=np.int16) - np.asarray(eroded, dtype=np.int16)).astype(np.uint8), mode="L")
    outer = _transparent_line_layer(boundary.filter(ImageFilter.MaxFilter(outer_line_width)))
    detail = Image.new("RGBA", image.size, (255, 255, 255, 0))

    if detail_lines:
        detail_mask = _detail_line_mask(image, mask_l, detail_cleanup, print_scale, template_style=template_style)
        if detail_line_width > 1:
            detail_mask = detail_mask.filter(ImageFilter.MaxFilter(_odd_filter_size(detail_line_width)))
        detail = _transparent_line_layer(detail_mask)

    return _compose_line_layers(outer, detail), outer, detail


def _transparent_line_layer(mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", mask.size, BLACK_LINE_COLOR)
    layer.putalpha(mask.convert("L"))
    return layer


def _compose_line_layers(outer: Image.Image, detail: Image.Image) -> Image.Image:
    base = Image.new("RGBA", outer.size, (255, 255, 255, 255))
    base.alpha_composite(detail.convert("RGBA"))
    base.alpha_composite(outer.convert("RGBA"))
    return base.convert("RGB")


def _edited_detail_layer(edited_detail_png: bytes, target_size: tuple[int, int]) -> Image.Image:
    try:
        if edited_detail_png.startswith(b"data:image"):
            payload = edited_detail_png.decode("utf-8")
            edited_detail_png = base64.b64decode(payload.split(",", 1)[1])
        layer = Image.open(io.BytesIO(edited_detail_png)).convert("RGBA")
    except Exception as exc:
        raise ValueError("Edited detail layer must be a readable PNG image.") from exc
    if layer.size != target_size:
        layer = layer.resize(target_size, Image.Resampling.LANCZOS)
    alpha = layer.getchannel("A")
    dark = layer.convert("L").point(lambda px: 255 if px < 230 else 0)
    mask = Image.fromarray(np.minimum(np.asarray(alpha), np.asarray(dark)).astype(np.uint8), mode="L")
    return _transparent_line_layer(mask)


def _odd_filter_size(size: int) -> int:
    size = max(1, size)
    return size if size % 2 == 1 else size + 1


def _detail_line_width(settings: TemplateSettings, print_scale: bool) -> int:
    if settings.template_style == "clean":
        return 3 if print_scale else 1
    return 5 if print_scale else 3


def _detail_line_mask(
    image: Image.Image,
    mask: Image.Image,
    cleanup: int,
    print_scale: bool,
    template_style: str = "detailed",
) -> Image.Image:
    if template_style == "clean":
        cleanup = max(cleanup, 76)
    work_image, work_mask, original_size = _detail_work_image(image, mask)
    blur_radius = 1.0 + (cleanup / 100) * (2.2 if print_scale else 1.6)
    smoothed = work_image.convert("RGB").filter(ImageFilter.GaussianBlur(radius=blur_radius))
    rgb = np.asarray(smoothed, dtype=np.uint8)
    mask_arr = np.asarray(work_mask.convert("L")) > 0
    cluster_count = 2 + round(((100 - cleanup) / 100) * (2 if template_style == "clean" else 4))
    labels = _cluster_subject_colors(rgb, mask_arr, cluster_count)

    detail_arr = np.zeros(mask_arr.shape, dtype=bool)
    rgb_float = rgb.astype(float)
    local_threshold = 8 + round((cleanup / 100) * (18 if template_style == "clean" else 12))
    horizontal_delta = np.linalg.norm(rgb_float[:, 1:, :] - rgb_float[:, :-1, :], axis=2)
    vertical_delta = np.linalg.norm(rgb_float[1:, :, :] - rgb_float[:-1, :, :], axis=2)
    horizontal_edges = (
        (labels[:, 1:] != labels[:, :-1])
        & (labels[:, 1:] >= 0)
        & (labels[:, :-1] >= 0)
        & (horizontal_delta > local_threshold)
    )
    vertical_edges = (
        (labels[1:, :] != labels[:-1, :])
        & (labels[1:, :] >= 0)
        & (labels[:-1, :] >= 0)
        & (vertical_delta > local_threshold)
    )
    detail_arr[:, 1:] |= horizontal_edges
    detail_arr[:, :-1] |= horizontal_edges
    detail_arr[1:, :] |= vertical_edges
    detail_arr[:-1, :] |= vertical_edges
    detail_arr &= mask_arr

    if template_style == "clean":
        detail_arr |= _dark_feature_arr(work_image, work_mask, cleanup)

    detail = Image.fromarray(detail_arr.astype(np.uint8) * 255, mode="L")
    min_area = 4 + round((cleanup / 100) * (110 if print_scale else 28))
    if template_style == "clean":
        min_area = max(min_area, 4 + round((cleanup / 100) * (780 if print_scale else 240)))
    if min_area > 4:
        detail = _remove_small_components(detail, min_area)
    if detail.size != original_size:
        detail = detail.resize(original_size, Image.Resampling.NEAREST)
    return detail


def _dark_feature_arr(image: Image.Image, mask: Image.Image, cleanup: int) -> np.ndarray:
    mask_l = mask.convert("L")
    mask_arr = np.asarray(mask_l) > 0
    inner_mask = np.asarray(mask_l.filter(ImageFilter.MinFilter(9))) > 0
    edge_band = mask_arr & ~inner_mask
    gray = np.asarray(image.convert("L"), dtype=np.uint8)
    dark_threshold = 92 + round(((100 - cleanup) / 100) * 30)
    dark = (gray < dark_threshold) & mask_arr & ~edge_band
    dark_mask = Image.fromarray(dark.astype(np.uint8) * 255, mode="L")
    dark_mask = _remove_small_components(dark_mask, 10 + round((cleanup / 100) * 18))
    dark_mask = _traceable_dark_feature_mask(dark_mask, mask_l).filter(ImageFilter.MaxFilter(3))
    return np.asarray(dark_mask.convert("L")) > 0


def _component_outline_mask(mask: Image.Image) -> Image.Image:
    mask_l = mask.convert("L")
    eroded = mask_l.filter(ImageFilter.MinFilter(3))
    outline = np.maximum(0, np.asarray(mask_l, dtype=np.int16) - np.asarray(eroded, dtype=np.int16))
    return Image.fromarray(outline.astype(np.uint8), mode="L")


def _traceable_dark_feature_mask(mask: Image.Image, subject_mask: Image.Image) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    height, width = arr.shape
    subject_pixels = int(np.count_nonzero(np.asarray(subject_mask.convert("L")) > 0))
    max_area = max(900, round(subject_pixels * 0.025))
    fill_area = max(240, round(subject_pixels * 0.008))
    fill_span = max(20, round(min(width, height) * 0.12))
    keep_arr = np.zeros(arr.shape, dtype=np.uint8)
    visited = np.zeros(arr.shape, dtype=bool)
    for y in range(height):
        for x in range(width):
            if visited[y, x] or not arr[y, x]:
                continue
            pixels = _flood(arr, visited, x, y, target=True)
            if len(pixels) > max_area:
                continue
            xs = [px for px, _py in pixels]
            ys = [py for _px, py in pixels]
            component_width = max(xs) - min(xs) + 1
            component_height = max(ys) - min(ys) + 1
            component_center_y = (min(ys) + max(ys)) / 2
            is_upper_feature = component_center_y < height * 0.45
            if not is_upper_feature:
                continue
            if component_width > width * 0.45 or component_height > height * 0.45:
                continue
            component_arr = np.zeros(arr.shape, dtype=np.uint8)
            for px, py in pixels:
                component_arr[py, px] = 255
            component = Image.fromarray(component_arr, mode="L")
            should_fill = len(pixels) <= fill_area and component_width <= fill_span and component_height <= fill_span
            if not should_fill:
                component = _component_outline_mask(component)
            component_arr = np.asarray(component.convert("L")) > 0
            keep_arr[component_arr] = 255
    return Image.fromarray(keep_arr, mode="L")


def _detail_work_image(image: Image.Image, mask: Image.Image) -> tuple[Image.Image, Image.Image, tuple[int, int]]:
    original_size = image.size
    max_edge = max(original_size)
    if max_edge <= 1400:
        return image, mask, original_size
    scale = 1400 / max_edge
    size = (max(1, round(original_size[0] * scale)), max(1, round(original_size[1] * scale)))
    return image.resize(size, Image.Resampling.LANCZOS), mask.resize(size, Image.Resampling.NEAREST), original_size


def _cluster_subject_colors(rgb: np.ndarray, mask_arr: np.ndarray, cluster_count: int) -> np.ndarray:
    pixels = rgb[mask_arr].astype(float)
    if len(pixels) == 0:
        return np.full(mask_arr.shape, -1, dtype=np.int16)

    if len(pixels) > 20000:
        stride = max(1, len(pixels) // 20000)
        sample = pixels[::stride]
    else:
        sample = pixels

    centers = _initial_color_centers(sample, cluster_count)
    for _ in range(7):
        distances = np.linalg.norm(sample[:, None, :] - centers[None, :, :], axis=2)
        sample_labels = np.argmin(distances, axis=1)
        next_centers = centers.copy()
        for idx in range(len(centers)):
            members = sample[sample_labels == idx]
            if len(members) > 0:
                next_centers[idx] = members.mean(axis=0)
        if np.allclose(centers, next_centers, atol=0.5):
            break
        centers = next_centers

    labels = np.full(mask_arr.shape, -1, dtype=np.int16)
    for start in range(0, rgb.shape[0], 160):
        stop = min(rgb.shape[0], start + 160)
        chunk = rgb[start:stop].astype(float)
        distances = np.linalg.norm(chunk[:, :, None, :] - centers[None, None, :, :], axis=3)
        chunk_labels = np.argmin(distances, axis=2).astype(np.int16)
        labels[start:stop] = np.where(mask_arr[start:stop], chunk_labels, -1)
    return labels


def _initial_color_centers(sample: np.ndarray, cluster_count: int) -> np.ndarray:
    quantized = (sample.astype(np.uint8) // 36) * 36 + 18
    values, counts = np.unique(quantized, axis=0, return_counts=True)
    order = np.argsort(counts)[::-1]
    centers = values[order[:cluster_count]].astype(float)
    if len(centers) >= cluster_count:
        return centers
    fallback = np.linspace(0, len(sample) - 1, cluster_count, dtype=int)
    return sample[fallback].astype(float)


def _draw_overview_page(
    pdf: canvas.Canvas,
    source: Image.Image,
    width_in: float,
    height_in: float,
    tile_cols: int,
    tile_rows: int,
) -> None:
    width_pt, height_pt = letter
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(40, height_pt - 58, "Cutout Studio Template Pack")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(40, height_pt - 86, "Print at 100 percent scale. Do not use fit-to-page.")
    pdf.drawString(40, height_pt - 106, f"Finished size: {width_in:.2f} in wide x {height_in:.2f} in tall")
    pdf.drawString(40, height_pt - 126, f"Trace pages: {tile_cols} columns x {tile_rows} rows ({tile_cols * tile_rows} pages)")

    preview = _on_white(source)
    preview.thumbnail((260, 260))
    pdf.drawImage(ImageReader(preview), 40, height_pt - 430, width=preview.width, height=preview.height, preserveAspectRatio=True)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(350, height_pt - 180, "Calibration")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(350, height_pt - 198, "This square should measure exactly 1 inch.")
    pdf.rect(350, height_pt - 286, 72, 72, stroke=1, fill=0)


def _draw_color_guide_page(pdf: canvas.Canvas, source: Image.Image, palette: tuple[PaletteColor, ...]) -> None:
    width_pt, height_pt = letter
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(40, height_pt - 54, "Color Guide")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height_pt - 76, "Paint matches are approximate. Check bottles in store when color accuracy matters.")

    preview = _on_white(source)
    preview.thumbnail((210, 210))
    pdf.drawImage(ImageReader(preview), 40, height_pt - 315, width=preview.width, height=preview.height, preserveAspectRatio=True)

    y = height_pt - 130
    for idx, color in enumerate(palette, start=1):
        x = 300
        pdf.setFillColor(colors.HexColor(_hex(color.rgb)))
        pdf.rect(x, y - 22, 34, 34, stroke=1, fill=1)
        pdf.setFillColor(colors.black)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(x + 46, y - 2, f"Color {idx}: {_hex(color.rgb)} ({color.coverage:.0%})")
        pdf.setFont("Helvetica", 8)
        match_text = "; ".join(f"{m.brand} {m.name}" for m in color.matches)
        pdf.drawString(x + 46, y - 16, match_text[:84])
        y -= 58


def _draw_tile_pages(
    pdf: canvas.Canvas,
    trace: Image.Image,
    width_in: float,
    height_in: float,
    tile_cols: int,
    tile_rows: int,
) -> None:
    width_pt, height_pt = letter
    margin_pt = PDF_MARGIN_IN * 72
    header_pt = TILE_HEADER_IN * 72
    tile_w_in = LETTER_WIDTH_IN - 2 * PDF_MARGIN_IN
    tile_h_in = LETTER_HEIGHT_IN - 2 * PDF_MARGIN_IN - TILE_HEADER_IN
    step_w_in = tile_w_in - OVERLAP_IN
    step_h_in = tile_h_in - OVERLAP_IN

    for row in range(tile_rows):
        for col in range(tile_cols):
            page_num = row * tile_cols + col + 1
            crop_left_in = col * step_w_in
            crop_top_in = row * step_h_in
            crop_w_in = min(tile_w_in, max(0.01, width_in - crop_left_in))
            crop_h_in = min(tile_h_in, max(0.01, height_in - crop_top_in))
            crop_box = (
                round(crop_left_in * PRINT_DPI),
                round(crop_top_in * PRINT_DPI),
                round((crop_left_in + crop_w_in) * PRINT_DPI),
                round((crop_top_in + crop_h_in) * PRINT_DPI),
            )
            crop = trace.crop(crop_box)

            pdf.setFont("Helvetica-Bold", 16)
            pdf.drawString(margin_pt, height_pt - margin_pt - 12, f"Page {page_num} of {tile_cols * tile_rows}")
            pdf.setFont("Helvetica", 9)
            pdf.drawString(margin_pt + 110, height_pt - margin_pt - 11, f"Row {row + 1}, Column {col + 1}")
            pdf.drawImage(
                ImageReader(crop),
                margin_pt,
                height_pt - margin_pt - header_pt - crop_h_in * 72,
                width=crop_w_in * 72,
                height=crop_h_in * 72,
                preserveAspectRatio=False,
                mask="auto",
            )
            pdf.setStrokeColor(colors.lightgrey)
            pdf.rect(margin_pt, height_pt - margin_pt - header_pt - tile_h_in * 72, tile_w_in * 72, tile_h_in * 72, stroke=1, fill=0)
            pdf.setDash(3, 3)
            if col < tile_cols - 1:
                x = margin_pt + (tile_w_in - OVERLAP_IN) * 72
                pdf.line(x, height_pt - margin_pt - header_pt, x, height_pt - margin_pt - header_pt - tile_h_in * 72)
            if row < tile_rows - 1:
                y = height_pt - margin_pt - header_pt - (tile_h_in - OVERLAP_IN) * 72
                pdf.line(margin_pt, y, margin_pt + tile_w_in * 72, y)
            pdf.setDash()
            pdf.setStrokeColor(colors.black)
            pdf.rect(width_pt - margin_pt - 36, margin_pt, 36, 36, stroke=1, fill=0)
            pdf.setFont("Helvetica", 7)
            pdf.drawRightString(width_pt - margin_pt - 42, margin_pt + 13, "1 in")
            pdf.showPage()


def _bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def _bounded_float(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def _on_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    white.alpha_composite(rgba)
    return white.convert("RGB")
