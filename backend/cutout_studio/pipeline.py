from __future__ import annotations

import base64
import io
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


TEMPLATE_STYLES = {"cutOnly", "clean", "manual", "marker", "detailed"}
TEMPLATE_STYLE_ALIASES = {"outline": "cutOnly", "paint": "clean", "extra": "detailed"}
DETAIL_EXTRACTION_MODES = {"auto", "lineArt", "rendered"}
LETTER_WIDTH_IN = 8.5
LETTER_HEIGHT_IN = 11.0
PDF_MARGIN_IN = 0.35
TILE_HEADER_IN = 0.42
OVERLAP_IN = 0.25
PREVIEW_MAX_PX = 960
PRINT_DPI = 144
CALIBRATION_SQUARE_PT = 72
DETAIL_LINE_COLOR = (118, 118, 118)
BLACK_LINE_COLOR = (0, 0, 0, 255)


@dataclass(frozen=True)
class PaintGuideEntry:
    hex: str
    label: str
    note: str
    included: bool = True
    selected_match_id: str | None = None
    manual_override: str = ""
    coverage: float = 0.0


@dataclass(frozen=True)
class ManualTracePoint:
    x: float
    y: float


@dataclass(frozen=True)
class ManualTraceStroke:
    id: str
    points: tuple[ManualTracePoint, ...]
    width: float


@dataclass(frozen=True)
class TemplateSettings:
    finished_height_in: float = 36.0
    threshold: int = 42
    smoothing: int = 2
    speck_area: int = 60
    hole_area: int = 220
    detail_lines: bool = True
    detail_cleanup: int = 88
    template_style: str = "clean"
    detail_extraction_mode: str = "auto"
    palette_size: int = 6
    include_instruction_cover_page: bool = True
    include_paint_guide_page: bool = True
    paint_guide_entries_only: bool = False
    project_name: str = "Cutout Studio Template Pack"
    paint_guide_entries: tuple[PaintGuideEntry, ...] = field(default_factory=tuple)
    manual_strokes: tuple[ManualTraceStroke, ...] = field(default_factory=tuple)
    manual_stroke_source_width_px: float = 0.0
    manual_stroke_source_height_px: float = 0.0

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "TemplateSettings":
        template_style = TEMPLATE_STYLE_ALIASES.get(str(data.get("templateStyle", cls.template_style)), str(data.get("templateStyle", cls.template_style)))
        if template_style not in TEMPLATE_STYLES:
            template_style = cls.template_style
        detail_extraction_mode = str(data.get("detailExtractionMode", cls.detail_extraction_mode))
        if detail_extraction_mode not in DETAIL_EXTRACTION_MODES:
            detail_extraction_mode = cls.detail_extraction_mode
        return cls(
            finished_height_in=_bounded_float(data.get("finishedHeightIn"), 6.0, 96.0, cls.finished_height_in),
            threshold=_bounded_int(data.get("threshold"), 0, 180, cls.threshold),
            smoothing=_bounded_int(data.get("smoothing"), 0, 8, cls.smoothing),
            speck_area=_bounded_int(data.get("speckArea"), 0, 2000, cls.speck_area),
            hole_area=_bounded_int(data.get("holeArea"), 0, 5000, cls.hole_area),
            detail_lines=_bounded_bool(data.get("detailLines"), cls.detail_lines),
            detail_cleanup=_bounded_int(data.get("detailCleanup"), 0, 100, cls.detail_cleanup),
            template_style=template_style,
            detail_extraction_mode=detail_extraction_mode,
            palette_size=_bounded_int(data.get("paletteSize"), 2, 12, cls.palette_size),
            include_instruction_cover_page=_bounded_bool(data.get("includeInstructionCoverPage"), cls.include_instruction_cover_page),
            include_paint_guide_page=_bounded_bool(data.get("includePaintGuidePage"), cls.include_paint_guide_page),
            paint_guide_entries_only=_bounded_bool(data.get("paintGuideEntriesOnly"), cls.paint_guide_entries_only),
            project_name=_safe_project_name(data.get("projectName", cls.project_name)),
            paint_guide_entries=_paint_guide_entries_from_mapping(data.get("paintGuideEntries")),
            manual_strokes=_manual_strokes_from_mapping(data.get("manualStrokes")),
            manual_stroke_source_width_px=_bounded_float(data.get("manualStrokeSourceWidthPx"), 0.0, 10000.0, 0.0),
            manual_stroke_source_height_px=_bounded_float(data.get("manualStrokeSourceHeightPx"), 0.0, 10000.0, 0.0),
        )


@dataclass(frozen=True)
class Paint:
    id: str
    brand: str
    line: str
    color_name: str
    rgb: tuple[int, int, int]
    finish: str
    outdoor_recommended: bool
    retailer: str
    product_url: str
    notes: str


@dataclass(frozen=True)
class PaintMatch:
    id: str
    brand: str
    line: str
    color_name: str
    rgb: tuple[int, int, int]
    finish: str
    outdoor_recommended: bool
    retailer: str
    product_url: str
    notes: str
    distance: float
    confidence: str


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
    outer_cut_path: str
    detail_line_png: bytes
    paint_guide_png: bytes
    preview_width_px: int
    preview_height_px: int
    palette: tuple[PaletteColor, ...]
    trace_quality: dict[str, Any]

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
            "outerCutPath": self.outer_cut_path,
            "detailLinePngDataUrl": "data:image/png;base64," + base64.b64encode(self.detail_line_png).decode("ascii"),
            "paintGuidePngDataUrl": "data:image/png;base64," + base64.b64encode(self.paint_guide_png).decode("ascii"),
            "previewWidthPx": self.preview_width_px,
            "previewHeightPx": self.preview_height_px,
            "traceQuality": self.trace_quality,
            "palette": [
                {
                    "rgb": color.rgb,
                    "hex": _hex(color.rgb),
                    "coverage": round(color.coverage, 3),
                    "matches": [
                        {
                            "id": match.id,
                            "brand": match.brand,
                            "line": match.line,
                            "colorName": match.color_name,
                            "rgb": match.rgb,
                            "hex": _hex(match.rgb),
                            "finish": match.finish,
                            "outdoorRecommended": match.outdoor_recommended,
                            "retailer": match.retailer,
                            "productUrl": match.product_url,
                            "notes": match.notes,
                            "distance": round(match.distance, 1),
                            "confidence": match.confidence,
                        }
                        for match in color.matches
                    ],
                }
                for color in self.palette
            ],
        }


def analyze_template(image_bytes: bytes, settings: TemplateSettings) -> TemplateAnalysis:
    source = _load_image(image_bytes)
    initial_mask = _initial_subject_mask(source, settings)
    mask = _clean_subject_mask(initial_mask, settings)
    bounds = _mask_bounds(mask)
    cropped_source = source.crop(bounds)
    cropped_mask = mask.crop(bounds)
    finished_width = settings.finished_height_in * (cropped_source.width / cropped_source.height)
    tile_cols, tile_rows = tile_grid(finished_width, settings.finished_height_in)
    preview, outer_line, detail_line, paint_guide = _make_preview_layers(cropped_source, cropped_mask, settings)
    preview_mask = _preview_mask(cropped_source, cropped_mask)
    outer_cut_path = _mask_to_svg_path(preview_mask, simplify_px=max(1.2, settings.smoothing))
    palette = extract_palette(cropped_source, cropped_mask, settings.palette_size)
    trace_quality = _trace_quality_summary(
        source,
        initial_mask,
        mask,
        bounds,
        preview_mask.size,
        outer_cut_path,
        _detail_extraction_mode_used(cropped_source, cropped_mask, settings.template_style, settings.detail_extraction_mode),
        settings.detail_extraction_mode,
    )

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
        outer_cut_path=outer_cut_path,
        detail_line_png=detail_line,
        paint_guide_png=paint_guide,
        preview_width_px=Image.open(io.BytesIO(preview)).width,
        preview_height_px=Image.open(io.BytesIO(preview)).height,
        palette=palette,
        trace_quality=trace_quality,
    )


def build_template_pdf(image_bytes: bytes, settings: TemplateSettings, edited_detail_png: bytes | None = None) -> bytes:
    source = _load_image(image_bytes)
    mask = _subject_mask(source, settings)
    bounds = _mask_bounds(mask)
    cropped_source = source.crop(bounds)
    cropped_mask = mask.crop(bounds)
    finished_width = settings.finished_height_in * (cropped_source.width / cropped_source.height)
    tile_cols, tile_rows = tile_grid(finished_width, settings.finished_height_in)
    edited_detail_for_trace = None if settings.manual_strokes else edited_detail_png
    trace = _make_trace_image(cropped_source, cropped_mask, settings, finished_width, settings.finished_height_in, edited_detail_for_trace)
    palette = extract_palette(cropped_source, cropped_mask, settings.palette_size)
    manual_stroke_source_size = _manual_stroke_source_size(cropped_source, settings)

    out = io.BytesIO()
    pdf = canvas.Canvas(out, pagesize=letter)
    pdf.setTitle(f"{settings.project_name} Template Packet")
    if settings.include_instruction_cover_page:
        _draw_overview_page(pdf, settings.project_name, cropped_source, finished_width, settings.finished_height_in, tile_cols, tile_rows)
        pdf.showPage()
    if settings.include_paint_guide_page and palette:
        _draw_paint_guide_page(pdf, settings.project_name, palette, settings.paint_guide_entries, settings.paint_guide_entries_only)
        pdf.showPage()
    _draw_tile_pages(
        pdf,
        settings.project_name,
        trace,
        finished_width,
        settings.finished_height_in,
        tile_cols,
        tile_rows,
        settings.manual_strokes,
        manual_stroke_source_size,
    )
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
    source = _rgb_to_lab(rgb)
    for paint in paints:
        target = _rgb_to_lab(paint.rgb)
        distance = float(np.linalg.norm(source - target))
        scored.append(PaintMatch(
            paint.id,
            paint.brand,
            paint.line,
            paint.color_name,
            paint.rgb,
            paint.finish,
            paint.outdoor_recommended,
            paint.retailer,
            paint.product_url,
            paint.notes,
            distance,
            _match_confidence(distance),
        ))
    scored.sort(key=lambda match: (_tie_distance(match.distance), not match.outdoor_recommended, match.distance, match.brand, match.color_name))
    return scored[:limit]


def match_paint_hex(hex_value: str, limit: int = 3) -> list[dict[str, Any]]:
    rgb = _hex_to_rgb(hex_value)
    return [
        {
            "id": match.id,
            "brand": match.brand,
            "line": match.line,
            "colorName": match.color_name,
            "rgb": match.rgb,
            "hex": _hex(match.rgb),
            "finish": match.finish,
            "outdoorRecommended": match.outdoor_recommended,
            "retailer": match.retailer,
            "productUrl": match.product_url,
            "notes": match.notes,
            "distance": round(match.distance, 1),
            "confidence": match.confidence,
        }
        for match in match_paints(rgb, load_paint_catalog(), limit=limit)
    ]


def load_paint_catalog() -> list[Paint]:
    path = Path(__file__).with_name("craft_paint_catalog.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [
        Paint(
            id=item["id"],
            brand=item["brand"],
            line=item["line"],
            color_name=item["colorName"],
            rgb=_hex_to_rgb(item["hex"]),
            finish=item["finish"],
            outdoor_recommended=bool(item["outdoorRecommended"]),
            retailer=str(item.get("retailer", "")),
            product_url=str(item.get("productUrl", "")),
            notes=str(item.get("notes", "")),
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
    return _clean_subject_mask(_initial_subject_mask(image, settings), settings)


def _initial_subject_mask(image: Image.Image, settings: TemplateSettings) -> Image.Image:
    arr = np.asarray(image, dtype=np.int16)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    has_alpha_subject = np.any(alpha < 245)

    if has_alpha_subject:
        foreground = alpha > 24
        mask = Image.fromarray((foreground.astype(np.uint8) * 255), mode="L")
    elif _looks_like_line_art(rgb, alpha):
        mask = _filled_line_art_mask(rgb, alpha, settings)
    else:
        rgb_float = rgb.astype(np.float32)
        bg = _border_background_rgb(rgb)
        distance_from_bg = np.sqrt(np.sum((rgb_float - bg) ** 2, axis=2))
        foreground = distance_from_bg > settings.threshold
        mask = Image.fromarray((foreground.astype(np.uint8) * 255), mode="L")

    return mask


def _clean_subject_mask(mask: Image.Image, settings: TemplateSettings) -> Image.Image:
    if settings.smoothing > 0:
        radius = max(1, settings.smoothing)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=radius)).point(lambda px: 255 if px >= 128 else 0)
    if settings.speck_area > 0:
        mask = _remove_small_components(mask, settings.speck_area)
    if settings.hole_area > 0:
        mask = _fill_small_holes(mask, settings.hole_area)
    mask = _keep_largest_component(mask)

    if not np.any(np.asarray(mask) > 0):
        raise ValueError("No subject was detected. Try lowering the threshold or using a simpler background.")
    return mask


def _trace_quality_summary(
    image: Image.Image,
    initial_mask: Image.Image,
    final_mask: Image.Image,
    bounds: tuple[int, int, int, int],
    preview_size: tuple[int, int],
    outer_cut_path: str,
    detail_extraction_mode_used: str,
    detail_extraction_mode_requested: str,
) -> dict[str, Any]:
    source_area = max(1, image.width * image.height)
    subject_pixels = _mask_pixel_count(final_mask)
    subject_coverage = subject_pixels / source_area
    path_bounds = _svg_path_bounds(outer_cut_path)
    warnings: list[str] = []
    fake_checkerboard = _looks_like_fake_checkerboard_background(image)
    discarded_component_count, discarded_component_coverage = _discarded_component_summary(initial_mask, final_mask)
    left, top, right, bottom = bounds
    subject_w = max(0, right - left)
    subject_h = max(0, bottom - top)

    if fake_checkerboard:
        warnings.append(
            "This image looks like it has a checkerboard background baked into the file. "
            "For cleaner tracing, use a PNG with real transparency or remove the background first."
        )
    if subject_coverage < 0.05:
        warnings.append("The trace has a small detected subject. Check that the source image contains one complete cutout subject.")
    if subject_w < image.width * 0.18 or subject_h < image.height * 0.18:
        warnings.append("The detected subject bounds are small compared with the uploaded image. Crop or remove extra page/background space before tracing.")
    if discarded_component_count > 0 and discarded_component_coverage > 0.003:
        warnings.append("Small isolated marks were removed from the detected subject. Check for page numbers, tile labels, or background specks.")
    if _looks_like_finished_tile_page(image, initial_mask, subject_coverage):
        warnings.append("This input may be a finished trace tile or PDF page. Upload one complete source image instead of an output template page.")
    if path_bounds is not None:
        min_x, min_y, max_x, max_y = path_bounds
        preview_w, preview_h = preview_size
        if min_x < 0 or min_y < 0 or max_x > preview_w or max_y > preview_h:
            warnings.append("The vector cutline extends outside the preview bounds. Regenerate the cutline before exporting SVG.")
    if detail_extraction_mode_requested == "lineArt" and detail_extraction_mode_used == "rendered":
        warnings.append("Existing line art was selected, but no usable dark ink was found. Rendered image boundaries were used instead.")

    return {
        "subjectCoverage": round(subject_coverage, 4),
        "fakeCheckerboardBackground": fake_checkerboard,
        "discardedComponentCount": discarded_component_count,
        "discardedComponentCoverage": round(discarded_component_coverage, 4),
        "vectorCutlinePointCount": _svg_path_point_count(outer_cut_path),
        "pathBoundsPx": tuple(round(value, 3) for value in path_bounds) if path_bounds is not None else None,
        "detailExtractionModeUsed": detail_extraction_mode_used,
        "warnings": warnings,
    }


def _mask_pixel_count(mask: Image.Image) -> int:
    return int(np.count_nonzero(np.asarray(mask.convert("L")) > 0))


def _svg_path_point_count(path_data: str) -> int:
    return len(re.findall(r"[ML]\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?", path_data))


def _svg_path_bounds(path_data: str) -> tuple[float, float, float, float] | None:
    values = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", path_data)]
    if len(values) < 4:
        return None
    xs = values[0::2]
    ys = values[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def _discarded_component_summary(initial_mask: Image.Image, final_mask: Image.Image) -> tuple[int, float]:
    initial = np.asarray(initial_mask.convert("L")) > 0
    final = np.asarray(final_mask.convert("L")) > 0
    discarded = initial & ~final
    labels, stats = _connected_components(discarded)
    component_count = max(0, len(stats) - 1)
    coverage = float(np.count_nonzero(discarded)) / max(1, discarded.size)
    return component_count, coverage


def _looks_like_fake_checkerboard_background(image: Image.Image) -> bool:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    if np.any(alpha < 245):
        return False

    rgb = rgba[:, :, :3]
    edge = max(10, min(80, image.width // 5, image.height // 5))
    samples = np.concatenate(
        [
            rgb[:edge, :, :].reshape(-1, 3),
            rgb[-edge:, :, :].reshape(-1, 3),
            rgb[:, :edge, :].reshape(-1, 3),
            rgb[:, -edge:, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)
    gray = np.mean(samples, axis=1)
    saturation = np.max(samples, axis=1) - np.min(samples, axis=1)
    low = float(np.percentile(gray, 10))
    high = float(np.percentile(gray, 90))
    dark_ratio = float(np.mean(gray <= low + 6))
    light_ratio = float(np.mean(gray >= high - 6))
    return (
        high - low > 24
        and float(np.mean(saturation)) < 10
        and 155 <= low <= 235
        and high >= 220
        and dark_ratio > 0.18
        and light_ratio > 0.18
    )


def _looks_like_finished_tile_page(image: Image.Image, initial_mask: Image.Image, subject_coverage: float) -> bool:
    aspect = image.height / max(1, image.width)
    has_letterish_aspect = 1.18 <= aspect <= 1.42
    initial_coverage = _mask_pixel_count(initial_mask) / max(1, image.width * image.height)
    return has_letterish_aspect and initial_coverage < 0.18 and subject_coverage < 0.18


def _border_background_rgb(rgb: np.ndarray) -> np.ndarray:
    edge = max(2, min(12, rgb.shape[0] // 8, rgb.shape[1] // 8))
    samples = np.concatenate(
        [
            rgb[:edge, :, :].reshape(-1, 3),
            rgb[-edge:, :, :].reshape(-1, 3),
            rgb[:, :edge, :].reshape(-1, 3),
            rgb[:, -edge:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    return np.median(samples.astype(np.float32), axis=0)


def _looks_like_line_art(rgb: np.ndarray, alpha: np.ndarray) -> bool:
    opaque = alpha > 24
    if not np.any(opaque):
        return False

    gray = np.mean(rgb, axis=2)
    dark_ratio = float(np.mean((gray < 210) & opaque))
    light_ratio = float(np.mean((gray > 238) & opaque))
    return 0.002 < dark_ratio < 0.22 and light_ratio > 0.55


def _filled_line_art_mask(rgb: np.ndarray, alpha: np.ndarray, settings: TemplateSettings) -> Image.Image:
    rgb_float = rgb.astype(np.float32)
    distance_from_white = np.sqrt(np.sum((255.0 - rgb_float) ** 2, axis=2))
    ink = (distance_from_white > max(28, settings.threshold)) & (alpha > 24)

    kernel_size = _odd_filter_size(max(3, settings.smoothing * 2 + 1))
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    barrier = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    barrier = cv2.dilate(barrier, kernel, iterations=1)

    height, width = barrier.shape
    flood = ((barrier == 0).astype(np.uint8) * 255)
    flood_mask = np.zeros((height + 2, width + 2), dtype=np.uint8)

    for x in range(width):
        if flood[0, x] == 255:
            cv2.floodFill(flood, flood_mask, (x, 0), 128)
        if flood[height - 1, x] == 255:
            cv2.floodFill(flood, flood_mask, (x, height - 1), 128)

    for y in range(height):
        if flood[y, 0] == 255:
            cv2.floodFill(flood, flood_mask, (0, y), 128)
        if flood[y, width - 1] == 255:
            cv2.floodFill(flood, flood_mask, (width - 1, y), 128)

    subject = flood != 128
    return _keep_largest_component(Image.fromarray((subject.astype(np.uint8) * 255), mode="L"))


def _keep_largest_component(mask: Image.Image) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    labels, stats = _connected_components(arr)
    if len(stats) <= 1:
        return mask

    areas = stats[1:, cv2.CC_STAT_AREA]
    if len(areas) == 0 or int(areas.max()) == 0:
        return mask

    keep_label = int(np.argmax(areas) + 1)
    keep = labels == keep_label
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _remove_small_components(mask: Image.Image, min_area: int) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    labels, stats = _connected_components(arr)
    areas = stats[:, cv2.CC_STAT_AREA]
    keep_labels = np.flatnonzero(areas >= min_area)
    keep = (labels > 0) & np.isin(labels, keep_labels)
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _filter_clean_detail_components(mask: Image.Image) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    height, width = arr.shape
    scale = max(1.0, min(width, height) / 380)
    area_scale = scale * scale
    upper_min_area = round(24 * area_scale)
    base_min_area = round(75 * area_scale)
    lower_min_area = round(120 * area_scale)
    lower_span_min = round(42 * scale)
    compact_lower_min_area = round(48 * area_scale)
    compact_lower_max_area = round(150 * area_scale)
    upper_zone = height * 0.36
    lower_zone = height * 0.62
    foot_zone = height * 0.84
    labels, stats = _connected_components(arr)
    keep_labels = []

    for label in range(1, len(stats)):
        top = stats[label, cv2.CC_STAT_TOP]
        component_width = stats[label, cv2.CC_STAT_WIDTH]
        component_height = stats[label, cv2.CC_STAT_HEIGHT]
        area = stats[label, cv2.CC_STAT_AREA]
        center_y = top + (component_height - 1) / 2
        span = max(component_width, component_height)
        should_keep = area >= base_min_area
        if center_y <= upper_zone:
            should_keep = area >= upper_min_area
        elif top >= foot_zone:
            should_keep = span >= lower_span_min
        elif center_y >= lower_zone:
            should_keep = (
                span >= lower_span_min
                or area >= lower_min_area
                or compact_lower_min_area <= area <= compact_lower_max_area
            )
        if should_keep:
            keep_labels.append(label)

    keep = (labels > 0) & np.isin(labels, keep_labels)
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _fill_small_holes(mask: Image.Image, max_area: int) -> Image.Image:
    arr = np.asarray(mask.convert("L")) > 0
    filled = arr.copy()
    labels, stats = _connected_components(~arr)
    edge_labels = set(np.unique(labels[0, :]))
    edge_labels.update(np.unique(labels[-1, :]))
    edge_labels.update(np.unique(labels[:, 0]))
    edge_labels.update(np.unique(labels[:, -1]))
    for label in range(1, len(stats)):
        if label in edge_labels:
            continue
        if stats[label, cv2.CC_STAT_AREA] <= max_area:
            filled[labels == label] = True
    return Image.fromarray((filled.astype(np.uint8) * 255), mode="L")


def _connected_components(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    _count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
        arr.astype(np.uint8),
        connectivity=8,
    )
    return labels, stats


def _erode_mask(mask: Image.Image, kernel_size: int) -> Image.Image:
    kernel_size = _odd_filter_size(kernel_size)
    arr = np.asarray(mask.convert("L"), dtype=np.uint8)
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    eroded = cv2.erode(arr, kernel, iterations=1)
    return Image.fromarray(eroded, mode="L")


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
    detail_extraction_mode = _detail_extraction_mode_used(
        image,
        mask,
        settings.template_style,
        settings.detail_extraction_mode,
    )
    preview_image = image.copy()
    preview_image.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.Resampling.LANCZOS)
    preview_mask = mask.resize(preview_image.size, Image.Resampling.NEAREST)
    composed, outer, detail = _line_art_layers(
        preview_image,
        preview_mask,
        settings.detail_lines,
        outer_line_width=3,
        detail_line_width=_detail_line_width(settings, print_scale=False, detail_extraction_mode=detail_extraction_mode),
        detail_cleanup=settings.detail_cleanup,
        template_style=settings.template_style,
        detail_extraction_mode=detail_extraction_mode,
        print_scale=False,
    )
    paint_guide = _on_white(preview_image)
    return (
        _png_bytes(composed),
        _png_bytes(outer),
        _png_bytes(detail),
        _png_bytes(paint_guide),
    )


def _preview_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    preview_image = image.copy()
    preview_image.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.Resampling.LANCZOS)
    return mask.resize(preview_image.size, Image.Resampling.NEAREST)


def _mask_to_svg_path(mask: Image.Image, simplify_px: float = 2.0) -> str:
    arr = (np.asarray(mask.convert("L")) > 0).astype(np.uint8) * 255
    contours, _hierarchy = cv2.findContours(arr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return ""

    contour = max(contours, key=cv2.contourArea)
    epsilon = max(0.6, float(simplify_px))
    approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    if len(approx) == 0:
        return ""

    commands = [f"M {approx[0][0]:.3f} {approx[0][1]:.3f}"]
    commands.extend(f"L {x:.3f} {y:.3f}" for x, y in approx[1:])
    commands.append("Z")
    return " ".join(commands)


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
    detail_extraction_mode = _detail_extraction_mode_used(
        image,
        mask,
        settings.template_style,
        settings.detail_extraction_mode,
    )
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
        detail_line_width=_detail_line_width(settings, print_scale=True, detail_extraction_mode=detail_extraction_mode),
        detail_cleanup=settings.detail_cleanup,
        template_style=settings.template_style,
        detail_extraction_mode=detail_extraction_mode,
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
    detail_extraction_mode: str = "auto",
) -> tuple[Image.Image, Image.Image, Image.Image]:
    mask_l = mask.convert("L")
    eroded = _erode_mask(mask_l, 3)
    boundary = Image.fromarray(np.maximum(0, np.asarray(mask_l, dtype=np.int16) - np.asarray(eroded, dtype=np.int16)).astype(np.uint8), mode="L")
    outer = _transparent_line_layer(boundary.filter(ImageFilter.MaxFilter(outer_line_width)))
    detail = Image.new("RGBA", image.size, (255, 255, 255, 0))

    if detail_lines:
        detail_mask = _detail_line_mask(
            image,
            mask_l,
            detail_cleanup,
            print_scale,
            template_style=template_style,
            detail_extraction_mode=detail_extraction_mode,
        )
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


def _detail_line_width(settings: TemplateSettings, print_scale: bool, detail_extraction_mode: str = "rendered") -> int:
    if detail_extraction_mode == "lineArt":
        return 5 if print_scale else 3
    if settings.template_style == "marker":
        return 7 if print_scale else 3
    if settings.template_style == "clean":
        return 3 if print_scale else 1
    return 5 if print_scale else 3


def _clean_feature_line_tuning(cleanup: int, print_scale: bool) -> tuple[float, int, int]:
    cleanup_ratio = (cleanup - 76) / 24
    blur_radius = (1.15 if print_scale else 1.0) + cleanup_ratio * (0.95 if print_scale else 0.7)
    edge_threshold = 13 + round(cleanup_ratio * (14 if print_scale else 8))
    min_area = 26 + round((cleanup / 100) * (100 if print_scale else 32))
    return blur_radius, edge_threshold, min_area


def _detail_line_mask(
    image: Image.Image,
    mask: Image.Image,
    cleanup: int,
    print_scale: bool,
    template_style: str = "detailed",
    detail_extraction_mode: str = "auto",
) -> Image.Image:
    extraction_mode = _detail_extraction_mode_used(image, mask, template_style, detail_extraction_mode)
    if extraction_mode == "lineArt":
        faithful = _existing_line_art_detail_mask(image, mask, cleanup, print_scale)
        if template_style == "detailed":
            return faithful
        level = "simple" if template_style == "marker" else "balanced"
        return _simplify_existing_line_art_detail_mask(faithful, mask, level)
    if template_style == "marker":
        cleanup = max(cleanup, 90)
        return _marker_template_line_mask(image, mask, cleanup, print_scale)
    if template_style == "clean":
        cleanup = max(cleanup, 76)
        return _clean_feature_line_mask(image, mask, cleanup, print_scale)
    work_image, work_mask, original_size = _detail_work_image(image, mask)
    blur_radius = 1.0 + (cleanup / 100) * (2.2 if print_scale else 1.6)
    cluster_count = 2 + round(((100 - cleanup) / 100) * 4)
    local_threshold = 6 + round((cleanup / 100) * 14)
    flattened = _flatten_detail_work_image(work_image, cleanup, template_style)
    smoothed = flattened.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    rgb = np.asarray(smoothed, dtype=np.uint8)
    mask_arr = np.asarray(work_mask.convert("L")) > 0
    labels = _cluster_subject_colors(rgb, mask_arr, cluster_count)

    detail_arr = np.zeros(mask_arr.shape, dtype=bool)
    rgb_float = rgb.astype(float)
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

    detail = Image.fromarray(detail_arr.astype(np.uint8) * 255, mode="L")
    min_area = 4 + round((cleanup / 100) * (110 if print_scale else 28))
    if min_area > 4:
        detail = _remove_small_components(detail, min_area)
    if detail.size != original_size:
        detail = detail.resize(original_size, Image.Resampling.NEAREST)
    return detail


def _clean_feature_line_mask(image: Image.Image, mask: Image.Image, cleanup: int, print_scale: bool) -> Image.Image:
    work_image, work_mask, original_size = _detail_work_image(image, mask)
    blur_radius, edge_threshold, min_area = _clean_feature_line_tuning(cleanup, print_scale)
    flattened = _flatten_detail_work_image(work_image, cleanup, "clean")
    gray = flattened.convert("L").filter(ImageFilter.GaussianBlur(radius=blur_radius))
    edge_arr = np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.uint8) > edge_threshold
    mask_arr = np.asarray(work_mask.convert("L")) > 0
    interior_arr = np.asarray(_erode_mask(work_mask, 9)) > 0
    detail_arr = edge_arr & mask_arr & interior_arr

    detail = Image.fromarray(detail_arr.astype(np.uint8) * 255, mode="L")
    detail = _remove_small_components(detail, min_area)
    detail = _filter_clean_detail_components(detail)
    detail_arr = np.asarray(detail.convert("L")) > 0
    color_detail_arr = np.asarray(_clean_color_boundary_mask(flattened, work_mask, cleanup, print_scale).convert("L")) > 0
    head_detail_arr = np.asarray(_head_feature_boost_mask(flattened, work_mask, cleanup).convert("L")) > 0
    detail = Image.fromarray(((detail_arr | color_detail_arr | head_detail_arr).astype(np.uint8) * 255), mode="L")
    detail = _remove_small_components(detail, max(24, min_area - 14))
    detail = _filter_clean_detail_components(detail)
    if detail.size != original_size:
        detail = detail.resize(original_size, Image.Resampling.NEAREST)
    return detail


def _existing_line_art_detail_mask(image: Image.Image, mask: Image.Image, cleanup: int, print_scale: bool) -> Image.Image:
    work_image, work_mask, original_size = _detail_work_image(image, mask)
    rgb = np.asarray(work_image.convert("RGB"), dtype=np.uint8)
    rgb = cv2.medianBlur(rgb, 3)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    lightness = lab[:, :, 0].astype(np.int16)
    a = lab[:, :, 1].astype(np.float32) - 128
    b = lab[:, :, 2].astype(np.float32) - 128
    chroma = np.hypot(a, b)
    interior_arr = np.asarray(_erode_mask(work_mask, 15)) > 0
    neutral_dark_ink = (lightness < 115) & (chroma < 24)
    local_lightness = cv2.GaussianBlur(lightness.astype(np.float32), (0, 0), sigmaX=2.2, sigmaY=2.2)
    locally_dark_stroke = ((local_lightness - lightness) > 22) & (lightness < 150)
    detail_arr = (neutral_dark_ink | locally_dark_stroke) & interior_arr
    detail = Image.fromarray((detail_arr.astype(np.uint8) * 255), mode="L")
    min_area = 8 + round((cleanup / 100) * (28 if print_scale else 12))
    detail = _remove_small_components(detail, min_area)
    if detail.size != original_size:
        detail = detail.resize(original_size, Image.Resampling.NEAREST)
    return detail


def _simplify_existing_line_art_detail_mask(detail: Image.Image, mask: Image.Image, level: str) -> Image.Image:
    ink = (np.asarray(detail.convert("L")) > 0).astype(np.uint8) * 255
    if not np.any(ink):
        return Image.new("L", detail.size, 0)

    subject = np.asarray(mask.resize(detail.size, Image.Resampling.NEAREST).convert("L")) > 0
    subject_box = cv2.boundingRect(subject.astype(np.uint8))
    subject_x, subject_y, subject_width, subject_height = subject_box
    perimeter_radius = max(3, round(min(subject_width, subject_height) * (0.024 if level == "simple" else 0.016)))
    perimeter_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (perimeter_radius * 2 + 1, perimeter_radius * 2 + 1))
    interior = cv2.erode(subject.astype(np.uint8) * 255, perimeter_kernel) > 0
    ink = np.where(interior, ink, 0).astype(np.uint8)

    # Normalize thick source strokes to one centerline before deciding which
    # components are significant. This avoids tracing both sides of source ink.
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((3, 3), dtype=np.uint8))
    skeleton = _morphological_skeleton(closed)
    scale = max(1.0, min(subject_width, subject_height) / 220)
    upper_limit = subject_y + subject_height * 0.42
    protected_head_features = _protected_head_feature_skeleton(ink, subject_box, upper_limit)
    if level == "simple":
        body_min_length = round(40 * scale)
        head_min_length = round(8 * scale)
        spur_length = round(24 * scale)
    else:
        body_min_length = round(10 * scale)
        head_min_length = round(4 * scale)
        spur_length = round(4 * scale)

    skeleton = _prune_short_skeleton_spurs(skeleton, spur_length, upper_limit)
    labels, stats = _connected_components(skeleton > 0)
    retained = np.zeros_like(skeleton)
    for label in range(1, len(stats)):
        top = stats[label, cv2.CC_STAT_TOP]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]
        length = stats[label, cv2.CC_STAT_AREA]
        minimum = head_min_length if top + height / 2 <= upper_limit else body_min_length
        major_span = max(width, height) >= body_min_length
        if length >= minimum and (major_span or top + height / 2 <= upper_limit):
            retained[labels == label] = 255

    retained = cv2.bitwise_or(retained, protected_head_features)
    if level == "balanced":
        retained = cv2.dilate(retained, np.ones((3, 3), dtype=np.uint8), iterations=1)
    return Image.fromarray(retained, mode="L")


def _protected_head_feature_skeleton(
    ink: np.ndarray,
    subject_box: tuple[int, int, int, int],
    upper_limit: float,
) -> np.ndarray:
    subject_x, subject_y, subject_width, subject_height = subject_box
    labels, stats = _connected_components(ink > 0)
    protected = np.zeros_like(ink)
    for label in range(1, len(stats)):
        left = stats[label, cv2.CC_STAT_LEFT]
        top = stats[label, cv2.CC_STAT_TOP]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]
        area = stats[label, cv2.CC_STAT_AREA]
        if top + height / 2 > upper_limit or area < 8:
            continue
        if width > subject_width * 0.22 or height > subject_height * 0.16:
            continue
        if left <= subject_x + 2 or left + width >= subject_x + subject_width - 2:
            continue
        component = np.where(labels == label, 255, 0).astype(np.uint8)
        feature = _morphological_skeleton(component)
        if cv2.countNonZero(feature) < 6:
            center_x = left + width // 2
            center_y = top + height // 2
            cv2.circle(feature, (center_x, center_y), 3, 255, -1)
        protected = cv2.bitwise_or(protected, feature)
    return protected


def _morphological_skeleton(mask: np.ndarray) -> np.ndarray:
    remaining = mask.copy()
    skeleton = np.zeros_like(remaining)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    while cv2.countNonZero(remaining) > 0:
        opened = cv2.morphologyEx(remaining, cv2.MORPH_OPEN, element)
        skeleton = cv2.bitwise_or(skeleton, cv2.subtract(remaining, opened))
        remaining = cv2.erode(remaining, element)
    return skeleton


def _prune_short_skeleton_spurs(skeleton: np.ndarray, max_length: int, upper_limit: float) -> np.ndarray:
    if max_length <= 1:
        return skeleton
    result = skeleton.copy()
    for _pass in range(3):
        points = set(map(tuple, np.argwhere(result > 0)))
        endpoints = [point for point in points if len(_skeleton_neighbors(point, points)) == 1]
        removals: set[tuple[int, int]] = set()
        for endpoint in endpoints:
            path = [endpoint]
            previous: tuple[int, int] | None = None
            current = endpoint
            limit = max(2, round(max_length * (0.5 if endpoint[0] <= upper_limit else 1.0)))
            while len(path) <= limit:
                neighbors = [point for point in _skeleton_neighbors(current, points) if point != previous]
                if len(neighbors) != 1:
                    if len(neighbors) > 1 and len(path) <= limit:
                        removals.update(path[:-1])
                    break
                previous, current = current, neighbors[0]
                path.append(current)
        if not removals:
            break
        for y, x in removals:
            result[y, x] = 0
    return result


def _skeleton_neighbors(point: tuple[int, int], points: set[tuple[int, int]]) -> list[tuple[int, int]]:
    y, x = point
    return [
        (near_y, near_x)
        for near_y in range(y - 1, y + 2)
        for near_x in range(x - 1, x + 2)
        if (near_y, near_x) != point and (near_y, near_x) in points
    ]


def _marker_template_line_mask(image: Image.Image, mask: Image.Image, cleanup: int, print_scale: bool) -> Image.Image:
    clean = _clean_feature_line_mask(image, mask, cleanup, print_scale)
    work_clean, work_mask, original_size = _detail_work_image(clean.convert("RGBA"), mask)
    detail = _filter_marker_detail_components(work_clean.convert("L"), work_mask)
    if detail.size != original_size:
        detail = detail.resize(original_size, Image.Resampling.NEAREST)
    return detail


def _filter_marker_detail_components(detail: Image.Image, mask: Image.Image) -> Image.Image:
    arr = np.asarray(detail.convert("L")) > 0
    mask_arr = np.asarray(mask.convert("L")) > 0
    height, width = arr.shape
    scale = max(1.0, min(width, height) / 380)
    area_scale = scale * scale
    upper_zone = height * 0.38
    lower_zone = height * 0.68
    foot_zone = height * 0.84
    base_min_area = round(145 * area_scale)
    upper_min_area = round(58 * area_scale)
    lower_min_area = round(210 * area_scale)
    min_span = round(34 * scale)
    lower_min_span = round(58 * scale)
    foot_min_span = round(72 * scale)
    labels, stats = _connected_components(arr & mask_arr)
    keep_labels = []

    for label in range(1, len(stats)):
        top = stats[label, cv2.CC_STAT_TOP]
        component_width = stats[label, cv2.CC_STAT_WIDTH]
        component_height = stats[label, cv2.CC_STAT_HEIGHT]
        area = stats[label, cv2.CC_STAT_AREA]
        center_y = top + (component_height - 1) / 2
        span = max(component_width, component_height)
        should_keep = area >= base_min_area or (area >= round(80 * area_scale) and span >= min_span)
        if center_y <= upper_zone:
            should_keep = area >= upper_min_area and span >= round(16 * scale)
        elif top >= foot_zone:
            should_keep = area >= lower_min_area and span >= foot_min_span
        elif center_y >= lower_zone:
            should_keep = area >= lower_min_area or span >= lower_min_span
        if should_keep:
            keep_labels.append(label)

    keep = (labels > 0) & np.isin(labels, keep_labels)
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _clean_color_boundary_mask(image: Image.Image, mask: Image.Image, cleanup: int, print_scale: bool) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    blur_sigma = 1.1 + ((cleanup - 76) / 24) * (0.7 if print_scale else 0.45)
    smoothed = cv2.GaussianBlur(rgb, ksize=(0, 0), sigmaX=blur_sigma, sigmaY=blur_sigma)
    lab = cv2.cvtColor(smoothed, cv2.COLOR_RGB2LAB).astype(np.int16)
    mask_arr = np.asarray(mask.convert("L")) > 0
    interior_arr = np.asarray(_erode_mask(mask, 9)) > 0
    threshold = 12 + round(((cleanup - 76) / 24) * (8 if print_scale else 6))

    horizontal_delta = np.linalg.norm(lab[:, 1:, :] - lab[:, :-1, :], axis=2)
    vertical_delta = np.linalg.norm(lab[1:, :, :] - lab[:-1, :, :], axis=2)
    detail_arr = np.zeros(mask_arr.shape, dtype=bool)
    horizontal_edges = horizontal_delta > threshold
    vertical_edges = vertical_delta > threshold
    detail_arr[:, 1:] |= horizontal_edges
    detail_arr[:, :-1] |= horizontal_edges
    detail_arr[1:, :] |= vertical_edges
    detail_arr[:-1, :] |= vertical_edges
    detail_arr &= mask_arr & interior_arr
    y_grid = np.arange(mask_arr.shape[0])[:, None]
    detail_arr &= y_grid < mask_arr.shape[0] * 0.68

    return Image.fromarray((detail_arr.astype(np.uint8) * 255), mode="L")


def _head_feature_boost_mask(image: Image.Image, mask: Image.Image, cleanup: int) -> Image.Image:
    gray = np.asarray(image.convert("L"), dtype=np.int16)
    background = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(11)), dtype=np.int16)
    mask_l = mask.convert("L")
    mask_arr = np.asarray(mask_l) > 0
    interior_arr = np.asarray(_erode_mask(mask_l, 9)) > 0
    height, width = mask_arr.shape
    cleanup_ratio = (cleanup - 76) / 24
    dark_delta = 18 + round(cleanup_ratio * 8)
    head_zone = height * 0.32
    y_grid = np.arange(height)[:, None]
    dark_features = ((background - gray) > dark_delta) & (gray < 165) & mask_arr & interior_arr & (y_grid < head_zone)

    dark_mask = Image.fromarray((dark_features.astype(np.uint8) * 255), mode="L")
    eroded = _erode_mask(dark_mask, 3)
    outline_arr = np.maximum(0, np.asarray(dark_mask, dtype=np.int16) - np.asarray(eroded, dtype=np.int16)).astype(np.uint8)
    outline = Image.fromarray(outline_arr, mode="L")
    arr = np.asarray(outline) > 0
    scale = max(1.0, min(width, height) / 380)
    area_scale = scale * scale
    min_area = round(6 * area_scale)
    max_area = round(420 * area_scale)
    max_span = round(90 * scale)
    labels, stats = _connected_components(arr)
    keep_labels = []

    for label in range(1, len(stats)):
        component_width = stats[label, cv2.CC_STAT_WIDTH]
        component_height = stats[label, cv2.CC_STAT_HEIGHT]
        area = stats[label, cv2.CC_STAT_AREA]
        span = max(component_width, component_height)
        if min_area <= area <= max_area and span <= max_span:
            keep_labels.append(label)

    keep = (labels > 0) & np.isin(labels, keep_labels)
    return Image.fromarray((keep.astype(np.uint8) * 255), mode="L")


def _detail_work_image(image: Image.Image, mask: Image.Image) -> tuple[Image.Image, Image.Image, tuple[int, int]]:
    original_size = image.size
    max_edge = max(original_size)
    if max_edge <= 1400:
        return image, mask, original_size
    scale = 1400 / max_edge
    size = (max(1, round(original_size[0] * scale)), max(1, round(original_size[1] * scale)))
    return image.resize(size, Image.Resampling.LANCZOS), mask.resize(size, Image.Resampling.NEAREST), original_size


def _flat_line_art_metrics(image: Image.Image, mask: Image.Image) -> dict[str, float]:
    if max(image.size) > 600:
        scale = 600 / max(image.size)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
        mask = mask.resize(size, Image.Resampling.NEAREST)
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    mask_arr = np.asarray(mask.convert("L")) > 0
    subject = rgb[mask_arr]
    if len(subject) == 0:
        return {"backgroundWhiteCoverage": 0.0, "darkInkCoverage": 0.0, "darkCoreRatio": 1.0, "populatedColorBins": 0.0, "gradientDensity": 1.0}

    outside = rgb[~mask_arr]
    background_white_coverage = float(np.mean(np.all(outside >= 238, axis=1))) if len(outside) else 1.0
    luminance = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    dark_arr = luminance < 72
    dark_ink_coverage = float(np.mean(dark_arr[mask_arr]))
    dark_core = cv2.erode(dark_arr.astype(np.uint8), np.ones((5, 5), dtype=np.uint8)) > 0
    dark_core_ratio = float(np.count_nonzero(dark_core & mask_arr) / max(1, np.count_nonzero(dark_arr & mask_arr)))

    sample_stride = max(1, len(subject) // 50000)
    quantized = subject[::sample_stride] // 32
    _, counts = np.unique(quantized, axis=0, return_counts=True)
    populated_color_bins = int(np.count_nonzero(counts >= max(4, round(len(quantized) * 0.004))))

    ink_neighborhood = cv2.dilate(dark_arr.astype(np.uint8), np.ones((7, 7), dtype=np.uint8)) > 0
    smooth_region = mask_arr & ~ink_neighborhood
    gradient_x = cv2.Sobel(luminance, cv2.CV_32F, 1, 0, ksize=3)
    gradient_y = cv2.Sobel(luminance, cv2.CV_32F, 0, 1, ksize=3)
    gradient = cv2.magnitude(gradient_x, gradient_y)
    gradient_density = float(np.mean(gradient[smooth_region] > 36)) if np.any(smooth_region) else 1.0
    return {
        "backgroundWhiteCoverage": background_white_coverage,
        "darkInkCoverage": dark_ink_coverage,
        "darkCoreRatio": dark_core_ratio,
        "populatedColorBins": float(populated_color_bins),
        "gradientDensity": gradient_density,
    }


def _looks_like_flat_line_art(image: Image.Image, mask: Image.Image) -> bool:
    metrics = _flat_line_art_metrics(image, mask)
    return (
        metrics["backgroundWhiteCoverage"] >= 0.72
        and 0.06 <= metrics["darkInkCoverage"] <= 0.28
        and metrics["darkCoreRatio"] <= 0.45
        and metrics["populatedColorBins"] <= 32
        and metrics["gradientDensity"] <= 0.04
    )


def _detail_extraction_mode_used(image: Image.Image, mask: Image.Image, template_style: str, requested_mode: str) -> str:
    if template_style in {"cutOnly", "manual"} or requested_mode == "rendered":
        return "rendered"
    if requested_mode == "lineArt":
        return "lineArt" if _has_meaningful_existing_ink(image, mask) else "rendered"
    return "lineArt" if _looks_like_flat_line_art(image, mask) else "rendered"


def _has_meaningful_existing_ink(image: Image.Image, mask: Image.Image) -> bool:
    work_image, work_mask, _ = _detail_work_image(image, mask)
    gray = np.asarray(work_image.convert("L"), dtype=np.uint8)
    mask_arr = np.asarray(work_mask.convert("L")) > 0
    subject_pixels = np.count_nonzero(mask_arr)
    if subject_pixels == 0:
        return False
    dark_pixels = np.count_nonzero((gray < 105) & mask_arr)
    return dark_pixels >= max(20, round(subject_pixels * 0.001))


def _flatten_shading(image: Image.Image, spatial_radius: int = 10, color_radius: int = 22) -> Image.Image:
    """Collapse soft gradients/airbrushed shading into flat, spatially-coherent regions.

    Mean-shift segmentation is edge-aware: it merges nearby pixels that are
    similar in both position and color while leaving genuinely strong color
    boundaries alone. Photographic and 3D-rendered source images shade a
    single surface (hair, a cheek, a jacket) with hundreds of gradual color
    steps; running edge/boundary detection directly on that produces a
    speckled noise of tiny "edges" wherever the gradient happens to cross a
    cluster or contrast threshold. Flattening first turns each shaded surface
    into one (or a few) flat colors, so only real feature/paint-region
    boundaries remain for the detail-line detectors below.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    flattened = cv2.pyrMeanShiftFiltering(rgb, sp=spatial_radius, sr=color_radius)
    return Image.fromarray(flattened, mode="RGB")


def _flatten_detail_work_image(image: Image.Image, cleanup: int, template_style: str) -> Image.Image:
    if template_style in {"clean", "marker"}:
        adjusted_cleanup = max(cleanup, 90 if template_style == "marker" else 76)
        cleanup_ratio = (adjusted_cleanup - 76) / 24
        return _flatten_shading(image, color_radius=16 + round(cleanup_ratio * 14))
    return _flatten_shading(image, color_radius=18 + round((cleanup / 100) * 16))


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
    project_name: str,
    source: Image.Image,
    width_in: float,
    height_in: float,
    tile_cols: int,
    tile_rows: int,
) -> None:
    width_pt, height_pt = letter
    left = 40
    top = height_pt - 48
    pdf.setFont("Helvetica-Bold", 22)
    title_bottom = _draw_wrapped_pdf_text(pdf, project_name, left, top, 520, line_height=24, max_lines=2)
    info_top = title_bottom - 8
    pdf.setFont("Helvetica", 11)
    pdf.drawString(left, info_top, "Print at 100% / actual size.")
    pdf.drawString(left, info_top - 20, "In the print dialog, choose Actual size or 100% scale - never Fit to page.")
    pdf.drawString(left, info_top - 40, f"Finished size: {width_in:.2f} in wide x {height_in:.2f} in tall")
    pdf.drawString(left, info_top - 60, f"Trace pages: {tile_cols} columns x {tile_rows} rows ({tile_cols * tile_rows} pages)")

    preview = _on_white(source)
    preview.thumbnail((165, 210))
    pdf.drawImage(ImageReader(preview), left, info_top - 278, width=preview.width, height=preview.height, preserveAspectRatio=True)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(240, info_top - 90, "Supplies checklist")
    pdf.setFont("Helvetica", 9)
    supplies = [
        "plywood or foam board",
        "tape",
        "pencil/carbon paper",
        "jigsaw",
        "paint",
        "thick black marker",
        "outdoor clear coat/sealer",
    ]
    for index, item in enumerate(supplies):
        y = info_top - 110 - index * 16
        pdf.rect(240, y - 2, 8, 8, stroke=1, fill=0)
        pdf.drawString(254, y - 2, item)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(430, info_top - 90, "Workflow")
    pdf.setFont("Helvetica", 8.5)
    steps = [
        "Print all pages at 100%.",
        "Tape pages together using page labels.",
        "Trace outer cutline onto wood.",
        "Cut outer shape.",
        "Transfer interior details.",
        "Paint.",
        "Outline details with marker.",
        "Seal for outdoor use.",
    ]
    for index, step in enumerate(steps, start=1):
        pdf.drawString(430, info_top - 94 - index * 15, f"{index}. {step}")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, 282, "Page map")
    _draw_page_map(pdf, 40, 164, tile_cols, tile_rows)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(300, 282, "Linework legend")
    pdf.setLineWidth(3)
    pdf.line(300, 258, 372, 258)
    pdf.setLineWidth(1)
    pdf.line(300, 234, 372, 234)
    pdf.setLineWidth(0.5)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(384, 254, "Outer cutline")
    pdf.drawString(384, 230, "Detail/paint transfer line")
    pdf.drawString(300, 208, "Original image/underlay is not printed on tiled template pages.")
    pdf.drawString(300, 194, "Interior details can be transferred with carbon paper or heavy pen pressure.")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, 130, "1-inch calibration square")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(40, 112, "This square should measure exactly 1 inch after printing.")
    pdf.rect(40, 0.35 * 72, CALIBRATION_SQUARE_PT, CALIBRATION_SQUARE_PT, stroke=1, fill=0)


def _draw_page_map(pdf: canvas.Canvas, x: float, y: float, tile_cols: int, tile_rows: int) -> None:
    max_width = 210
    max_height = 96
    cell = min(max_width / tile_cols, max_height / tile_rows, 34)
    pdf.setFont("Helvetica", 6.5)
    for row in range(tile_rows):
        for col in range(tile_cols):
            page_num = row * tile_cols + col + 1
            cell_x = x + col * cell
            cell_y = y + (tile_rows - row - 1) * cell
            pdf.rect(cell_x, cell_y, cell, cell, stroke=1, fill=0)
            pdf.drawCentredString(cell_x + cell / 2, cell_y + cell / 2 + 3, str(page_num))
            pdf.drawCentredString(cell_x + cell / 2, cell_y + 5, f"R{row + 1} C{col + 1}")
    pdf.setFont("Helvetica", 8)
    pdf.drawString(x, y - 18, "Assemble left to right by row. Row 1 / Column 1 starts at the top left.")


def _draw_paint_guide_page(
    pdf: canvas.Canvas,
    project_name: str,
    palette: tuple[PaletteColor, ...],
    paint_guide_entries: tuple[PaintGuideEntry, ...],
    entries_only: bool = False,
) -> None:
    width_pt, height_pt = letter
    rows = _paint_guide_rows(palette, paint_guide_entries, entries_only)

    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(40, height_pt - 54, "Paint Guide")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height_pt - 76, _ellipsize_pdf_text(pdf, project_name, 520))
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(40, height_pt - 96, "Screen colors and printed colors may vary. Use swatches as a shopping/planning guide.")
    pdf.drawString(40, height_pt - 110, "Paint matches are approximate. Screen, printer, lighting, wood primer, and sealer can change color appearance.")
    pdf.drawString(40, height_pt - 124, "Check the bottle or swatch in store.")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, height_pt - 156, "Color planning")
    row_top = height_pt - 188
    row_gap = 64
    for row_index, row in enumerate(rows[:10]):
        x = 40 if row_index < 5 else 320
        y = row_top - (row_index % 5) * row_gap
        pdf.setFillColor(colors.HexColor(row["hex"]))
        pdf.rect(x, y - 18, 32, 32, stroke=1, fill=1)
        pdf.setFillColor(colors.black)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(x + 44, y + 2, f"{row['index']}. {row['label']}"[:36])
        pdf.setFont("Helvetica", 8)
        coverage_text = f"{row['coverage']:.0%} of detected colors" if row["coverage"] > 0 else "manual/project color"
        pdf.drawString(x + 44, y - 12, f"{row['hex'].upper()} - {coverage_text}")
        detail_y = y - 26
        text_width = 222 if row_index < 5 else 218
        if row["note"]:
            detail_y = _draw_wrapped_pdf_text(pdf, f"Use: {row['note']}", x + 44, detail_y, text_width, max_lines=2)
        match_text = _paint_match_pdf_text(row)
        if match_text:
            detail_y = _draw_wrapped_pdf_text(pdf, match_text, x + 44, detail_y, text_width, max_lines=2)
        if not row["included"]:
            pdf.drawString(x + 44, detail_y, "Hidden from shopping list")

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, 250, "Shopping list")
    pdf.setFont("Helvetica", 9)
    purchase_items = _group_paint_purchase_items(rows)
    if not purchase_items:
        pdf.drawString(40, 230, "No paint colors selected.")
        return
    y = 230
    for item in purchase_items[:10]:
        y = _draw_wrapped_pdf_text(pdf, f"- {item}", 40, y, 520, line_height=11, max_lines=2) - 7


def _draw_tile_pages(
    pdf: canvas.Canvas,
    project_name: str,
    trace: Image.Image,
    width_in: float,
    height_in: float,
    tile_cols: int,
    tile_rows: int,
    manual_strokes: tuple[ManualTraceStroke, ...] = (),
    manual_stroke_source_size: tuple[float, float] | None = None,
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
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawRightString(width_pt - margin_pt, height_pt - margin_pt - 12, _ellipsize_pdf_text(pdf, project_name, 260))
            pdf.setFont("Helvetica", 9)
            pdf.drawString(margin_pt, height_pt - margin_pt - 27, f"Row {row + 1} / Column {col + 1}")
            pdf.drawString(margin_pt + 118, height_pt - margin_pt - 27, f"Overlap guide: {OVERLAP_IN:.2f} in shared edge")
            pdf.drawImage(
                ImageReader(crop),
                margin_pt,
                height_pt - margin_pt - header_pt - crop_h_in * 72,
                width=crop_w_in * 72,
                height=crop_h_in * 72,
                preserveAspectRatio=False,
                mask="auto",
            )
            _draw_manual_vector_strokes(
                pdf,
                manual_strokes,
                manual_stroke_source_size,
                finished_width_in=width_in,
                finished_height_in=height_in,
                crop_left_in=crop_left_in,
                crop_top_in=crop_top_in,
                tile_w_in=tile_w_in,
                tile_h_in=tile_h_in,
                margin_pt=margin_pt,
                content_top_pt=height_pt - margin_pt - header_pt,
            )
            pdf.setStrokeColor(colors.lightgrey)
            pdf.rect(margin_pt, height_pt - margin_pt - header_pt - tile_h_in * 72, tile_w_in * 72, tile_h_in * 72, stroke=1, fill=0)
            _draw_crop_marks(pdf, margin_pt, height_pt - margin_pt - header_pt, tile_w_in * 72, tile_h_in * 72)
            pdf.setDash(3, 3)
            if col < tile_cols - 1:
                x = margin_pt + (tile_w_in - OVERLAP_IN) * 72
                pdf.line(x, height_pt - margin_pt - header_pt, x, height_pt - margin_pt - header_pt - tile_h_in * 72)
            if row < tile_rows - 1:
                y = height_pt - margin_pt - header_pt - (tile_h_in - OVERLAP_IN) * 72
                pdf.line(margin_pt, y, margin_pt + tile_w_in * 72, y)
            pdf.setDash()
            pdf.setStrokeColor(colors.black)
            pdf.showPage()


def _draw_crop_marks(pdf: canvas.Canvas, x: float, top: float, width: float, height: float) -> None:
    mark = 12
    bottom = top - height
    right = x + width
    pdf.setStrokeColor(colors.black)
    pdf.setLineWidth(0.5)
    for corner_x, horizontal_direction in ((x, 1), (right, -1)):
        pdf.line(corner_x, top, corner_x + horizontal_direction * mark, top)
        pdf.line(corner_x, bottom, corner_x + horizontal_direction * mark, bottom)
    for corner_y, vertical_direction in ((top, -1), (bottom, 1)):
        pdf.line(x, corner_y, x, corner_y + vertical_direction * mark)
        pdf.line(right, corner_y, right, corner_y + vertical_direction * mark)


def _draw_manual_vector_strokes(
    pdf: canvas.Canvas,
    strokes: tuple[ManualTraceStroke, ...],
    source_size: tuple[float, float] | None,
    finished_width_in: float,
    finished_height_in: float,
    crop_left_in: float,
    crop_top_in: float,
    tile_w_in: float,
    tile_h_in: float,
    margin_pt: float,
    content_top_pt: float,
) -> None:
    if not strokes or source_size is None:
        return
    source_w, source_h = source_size
    if source_w <= 0 or source_h <= 0:
        return

    clip = pdf.beginPath()
    clip.rect(margin_pt, content_top_pt - tile_h_in * 72, tile_w_in * 72, tile_h_in * 72)
    pdf.saveState()
    pdf.clipPath(clip, stroke=0, fill=0)
    pdf.setStrokeColor(colors.black)
    pdf.setLineCap(1)
    pdf.setLineJoin(1)

    for stroke in strokes:
        if not stroke.points:
            continue
        pdf.setLineWidth(_manual_stroke_width_pt(stroke.width))
        path = pdf.beginPath()
        first = stroke.points[0]
        first_x, first_y = _manual_point_to_pdf(
            first,
            source_w,
            source_h,
            finished_width_in,
            finished_height_in,
            crop_left_in,
            crop_top_in,
            margin_pt,
            content_top_pt,
        )
        path.moveTo(first_x, first_y)
        if len(stroke.points) == 1:
            path.lineTo(first_x + 0.01, first_y)
        else:
            for point in stroke.points[1:]:
                x, y = _manual_point_to_pdf(
                    point,
                    source_w,
                    source_h,
                    finished_width_in,
                    finished_height_in,
                    crop_left_in,
                    crop_top_in,
                    margin_pt,
                    content_top_pt,
                )
                path.lineTo(x, y)
        pdf.drawPath(path, stroke=1, fill=0)
    pdf.restoreState()


def _manual_point_to_pdf(
    point: ManualTracePoint,
    source_w: float,
    source_h: float,
    finished_width_in: float,
    finished_height_in: float,
    crop_left_in: float,
    crop_top_in: float,
    margin_pt: float,
    content_top_pt: float,
) -> tuple[float, float]:
    x_in = point.x / source_w * finished_width_in
    y_in = point.y / source_h * finished_height_in
    return (
        margin_pt + (x_in - crop_left_in) * 72,
        content_top_pt - (y_in - crop_top_in) * 72,
    )


def _manual_stroke_source_size(source: Image.Image, settings: TemplateSettings) -> tuple[float, float] | None:
    if not settings.manual_strokes:
        return None
    if settings.manual_stroke_source_width_px > 0 and settings.manual_stroke_source_height_px > 0:
        return (settings.manual_stroke_source_width_px, settings.manual_stroke_source_height_px)
    return tuple(float(value) for value in _preview_size(source))


def _preview_size(image: Image.Image) -> tuple[int, int]:
    preview = image.copy()
    preview.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.Resampling.LANCZOS)
    return preview.size


def _paint_guide_entries_from_mapping(value: Any) -> tuple[PaintGuideEntry, ...]:
    if not isinstance(value, list):
        return ()
    entries: list[PaintGuideEntry] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        hex_value = _safe_hex(item.get("hex"))
        if not hex_value:
            continue
        entries.append(PaintGuideEntry(
            hex=hex_value,
            label=_safe_pdf_text(item.get("label"), "", 64),
            note=_safe_pdf_text(item.get("note"), "", 96),
            included=_bounded_bool(item.get("included"), True),
            selected_match_id=_safe_optional_text(item.get("selectedMatchId"), 96),
            manual_override=_safe_pdf_text(item.get("manualOverride"), "", 96),
            coverage=_bounded_float(item.get("coverage"), 0.0, 1.0, 0.0),
        ))
    return tuple(entries)


def _manual_strokes_from_mapping(value: Any) -> tuple[ManualTraceStroke, ...]:
    if not isinstance(value, list):
        return ()
    strokes: list[ManualTraceStroke] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        color = str(item.get("color", "#000000")).strip().lower()
        if color != "#000000":
            continue
        if str(item.get("tool", "draw")) not in {"draw", "smoothDraw"}:
            continue
        stroke_id = _safe_pdf_text(item.get("id"), "", 80)
        width = _finite_float(item.get("width"))
        raw_points = item.get("points")
        if width is None or width <= 0 or not isinstance(raw_points, list):
            continue
        points: list[ManualTracePoint] = []
        for raw_point in raw_points:
            if not isinstance(raw_point, dict):
                continue
            x = _finite_float(raw_point.get("x"))
            y = _finite_float(raw_point.get("y"))
            if x is None or y is None:
                continue
            points.append(ManualTracePoint(x=x, y=y))
        if len(points) < 1:
            continue
        strokes.append(ManualTraceStroke(id=stroke_id or f"stroke-{len(strokes) + 1}", points=tuple(points), width=width))
    return tuple(strokes)


def _paint_guide_rows(
    palette: tuple[PaletteColor, ...],
    paint_guide_entries: tuple[PaintGuideEntry, ...],
    entries_only: bool = False,
) -> list[dict[str, Any]]:
    if entries_only:
        return [
            {
                "index": index,
                "hex": entry.hex,
                "label": _safe_pdf_text(entry.label, f"Color {index}", 64) or f"Color {index}",
                "note": _safe_pdf_text(entry.note, "", 96),
                "included": entry.included,
                "coverage": entry.coverage,
                "selected_match": _resolve_selected_paint(entry.selected_match_id, ()),
                "manual_override": entry.manual_override,
            }
            for index, entry in enumerate(paint_guide_entries, start=1)
        ]
    edits_by_hex = {entry.hex.lower(): entry for entry in paint_guide_entries}
    used_edit_hexes: set[str] = set()
    rows: list[dict[str, Any]] = []
    for index, color in enumerate(palette, start=1):
        hex_value = _hex(color.rgb)
        edit = edits_by_hex.get(hex_value.lower())
        if edit:
            used_edit_hexes.add(edit.hex.lower())
        selected_match_id = edit.selected_match_id if edit else None
        selected_match = _resolve_selected_paint(selected_match_id, color.matches)
        label = _safe_pdf_text(edit.label, f"Color {index}", 64) if edit else f"Color {index}"
        note = _safe_pdf_text(edit.note, "", 96) if edit else ""
        rows.append({
            "index": index,
            "hex": hex_value,
            "label": label or f"Color {index}",
            "note": note,
            "included": True if edit is None else edit.included,
            "coverage": color.coverage,
            "selected_match": selected_match,
            "manual_override": edit.manual_override if edit else "",
        })
    for edit in paint_guide_entries:
        if edit.hex.lower() in used_edit_hexes:
            continue
        rows.append({
            "index": len(rows) + 1,
            "hex": edit.hex,
            "label": _safe_pdf_text(edit.label, f"Color {len(rows) + 1}", 64) or f"Color {len(rows) + 1}",
            "note": _safe_pdf_text(edit.note, "", 96),
            "included": edit.included,
            "coverage": 0,
            "selected_match": _resolve_selected_paint(edit.selected_match_id, ()),
            "manual_override": edit.manual_override,
        })
    return rows


def _resolve_selected_paint(selected_match_id: str | None, matches: tuple[PaintMatch, ...]) -> PaintMatch | None:
    if not selected_match_id:
        return None
    selected = next((match for match in matches if match.id == selected_match_id), None)
    if selected is not None:
        return selected
    for paint in load_paint_catalog():
        if paint.id == selected_match_id:
            return PaintMatch(
                id=paint.id,
                brand=paint.brand,
                line=paint.line,
                color_name=paint.color_name,
                rgb=paint.rgb,
                finish=paint.finish,
                outdoor_recommended=paint.outdoor_recommended,
                retailer=paint.retailer,
                product_url=paint.product_url,
                notes=paint.notes,
                distance=0,
                confidence="close match",
            )
    return None


def _group_paint_purchase_items(rows: list[dict[str, Any]]) -> list[str]:
    groups: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not row["included"]:
            continue
        key = _paint_purchase_key(row)
        if key not in groups:
            groups[key] = {
                "purchase_label": _paint_purchase_label(row),
                "labels": [],
                "swatches": [],
            }
        group = groups[key]
        _append_unique(group["labels"], row["label"])
        group["swatches"].append(row["index"])

    items = []
    for group in groups.values():
        swatches = sorted(set(group["swatches"]))
        items.append(f"{group['purchase_label']} - {_format_pdf_list(group['labels'])}, {_format_pdf_swatches(swatches)}")
    return items


def _paint_purchase_key(row: dict[str, Any]) -> str:
    if _has_paint_family_mismatch(row):
        return f"review:{row['index']}"
    if row["manual_override"]:
        return f"manual:{row['manual_override'].strip().lower()}"
    selected_match = row["selected_match"]
    if selected_match is not None:
        return f"paint:{selected_match.id}"
    return "no-match"


def _paint_purchase_label(row: dict[str, Any]) -> str:
    if _has_paint_family_mismatch(row):
        return "Needs review / choose in store"
    if row["manual_override"]:
        return row["manual_override"]
    selected_match = row["selected_match"]
    if selected_match is None:
        return "No match / choose in store"
    return f"{selected_match.brand} {selected_match.line} {selected_match.color_name}"


def _format_pdf_swatches(numbers: list[int]) -> str:
    if len(numbers) == 1:
        return f"swatch {numbers[0]}"
    return f"swatches {_format_pdf_list([str(number) for number in numbers])}"


def _format_pdf_list(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _append_unique(items: list[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def _paint_match_pdf_text(row: dict[str, Any]) -> str:
    if _has_paint_family_mismatch(row):
        return "Paint: Needs review / choose in store"
    if row["manual_override"]:
        return f"Paint: {row['manual_override']}"
    selected_match = row["selected_match"]
    if selected_match is None:
        return "Paint: Needs review / choose in store"
    return f"Paint: {selected_match.brand} {selected_match.line} {selected_match.color_name}"


def _has_paint_family_mismatch(row: dict[str, Any]) -> bool:
    selected_match = row["selected_match"]
    if selected_match is None:
        return False
    label_text = f"{row['label']} {row['note']}".lower()
    paint_text = f"{selected_match.brand} {selected_match.line} {selected_match.color_name}".lower()
    return (
        bool(re.search(r"\b(hair|blue|navy)\b", label_text) and re.search(r"\b(yellow|orange|brown)\b", paint_text))
        or bool(re.search(r"\b(skin|face)\b", label_text) and re.search(r"\b(black|blue|navy|yellow)\b", paint_text))
        or bool(re.search(r"\b(boots?|shoes?)\b", label_text) and re.search(r"\b(skin|face|portrait|flesh|peach)\b", paint_text))
    )


def _draw_wrapped_pdf_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    line_height: float = 10,
    max_lines: int = 2,
) -> float:
    lines = _wrap_pdf_text(pdf, text, max_width, max_lines)
    for index, line in enumerate(lines):
        pdf.drawString(x, y - index * line_height, line)
    return y - len(lines) * line_height


def _wrap_pdf_text(pdf: canvas.Canvas, text: str, max_width: float, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    while words and len(lines) < max_lines:
        word = words.pop(0)
        candidate = f"{current} {word}".strip()
        if not current or pdf.stringWidth(candidate) <= max_width:
            current = candidate
            continue
        lines.append(_ellipsize_pdf_text(pdf, current, max_width))
        current = word

    if current and len(lines) < max_lines:
        lines.append(_ellipsize_pdf_text(pdf, current, max_width))
    if words and lines:
        lines[-1] = _ellipsize_pdf_text(pdf, f"{lines[-1]}...", max_width)
    return lines


def _ellipsize_pdf_text(pdf: canvas.Canvas, text: str, max_width: float) -> str:
    if pdf.stringWidth(text) <= max_width:
        return text
    trimmed = text
    while len(trimmed) > 4 and pdf.stringWidth(trimmed) > max_width:
        trimmed = f"{trimmed[:-4].rstrip()}..."
    return trimmed


def _shopping_list_pdf_text(row: dict[str, Any]) -> str:
    if row["manual_override"]:
        return f"{row['label']}: {row['manual_override']}"
    selected_match = row["selected_match"]
    if selected_match is None:
        return f"{row['label']} ({row['hex'].upper()})"
    return f"{row['label']}: {selected_match.brand} {selected_match.line} {selected_match.color_name}"


def _manual_stroke_width_pt(width_px: float) -> float:
    if width_px <= 12:
        return 2.5
    if width_px >= 30:
        return 6
    return 4


def _safe_hex(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip().lower()
    if not raw.startswith("#"):
        raw = f"#{raw}"
    if len(raw) != 7:
        return None
    try:
        int(raw[1:], 16)
    except ValueError:
        return None
    return raw


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    parsed = _safe_hex(value)
    if parsed is None:
        raise ValueError(f"Invalid catalog paint hex value: {value}")
    return (int(parsed[1:3], 16), int(parsed[3:5], 16), int(parsed[5:7], 16))


def _rgb_to_lab(rgb: tuple[int, int, int]) -> np.ndarray:
    sample = np.array([[rgb]], dtype=np.uint8)
    lab = cv2.cvtColor(sample, cv2.COLOR_RGB2LAB).astype(float)
    return lab[0, 0]


def _tie_distance(distance: float) -> int:
    return round(distance / 3)


def _match_confidence(distance: float) -> str:
    if distance <= 10:
        return "close match"
    if distance <= 28:
        return "approximate match"
    return "poor match / manual check recommended"


def _safe_pdf_text(value: Any, fallback: str, max_length: int) -> str:
    if not isinstance(value, str):
        return fallback
    text = " ".join(value.strip().split())
    return (text or fallback)[:max_length]


def _safe_optional_text(value: Any, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    text = " ".join(value.strip().split())
    return text[:max_length] if text else None


def _bounded_bool(value: Any, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"false", "0", "no", "off"}:
            return False
        if normalized in {"true", "1", "yes", "on"}:
            return True
    if value is None:
        return fallback
    return bool(value)


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


def _finite_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _safe_project_name(value: Any) -> str:
    if not isinstance(value, str):
        return TemplateSettings.project_name
    name = " ".join(value.strip().split())
    return name[:80] or TemplateSettings.project_name


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def _on_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    white.alpha_composite(rgba)
    return white.convert("RGB")
