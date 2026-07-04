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


LETTER_WIDTH_IN = 8.5
LETTER_HEIGHT_IN = 11.0
PDF_MARGIN_IN = 0.35
TILE_HEADER_IN = 0.42
OVERLAP_IN = 0.25
PREVIEW_MAX_PX = 960
PRINT_DPI = 144


@dataclass(frozen=True)
class TemplateSettings:
    finished_height_in: float = 36.0
    threshold: int = 42
    smoothing: int = 2
    speck_area: int = 60
    hole_area: int = 220
    detail_lines: bool = True
    palette_size: int = 6

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "TemplateSettings":
        return cls(
            finished_height_in=_bounded_float(data.get("finishedHeightIn"), 6.0, 96.0, cls.finished_height_in),
            threshold=_bounded_int(data.get("threshold"), 0, 180, cls.threshold),
            smoothing=_bounded_int(data.get("smoothing"), 0, 8, cls.smoothing),
            speck_area=_bounded_int(data.get("speckArea"), 0, 2000, cls.speck_area),
            hole_area=_bounded_int(data.get("holeArea"), 0, 5000, cls.hole_area),
            detail_lines=bool(data.get("detailLines", cls.detail_lines)),
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
    preview = _make_preview(cropped_source, cropped_mask, settings)
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
        palette=palette,
    )


def build_template_pdf(image_bytes: bytes, settings: TemplateSettings) -> bytes:
    source = _load_image(image_bytes)
    mask = _subject_mask(source, settings)
    bounds = _mask_bounds(mask)
    cropped_source = source.crop(bounds)
    cropped_mask = mask.crop(bounds)
    finished_width = settings.finished_height_in * (cropped_source.width / cropped_source.height)
    tile_cols, tile_rows = tile_grid(finished_width, settings.finished_height_in)
    trace = _make_trace_image(cropped_source, cropped_mask, settings, finished_width, settings.finished_height_in)
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


def _make_preview(image: Image.Image, mask: Image.Image, settings: TemplateSettings) -> bytes:
    line = _line_art(image, mask, settings.detail_lines, line_width=3)
    line.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX))
    out = io.BytesIO()
    line.save(out, format="PNG")
    return out.getvalue()


def _make_trace_image(
    image: Image.Image,
    mask: Image.Image,
    settings: TemplateSettings,
    width_in: float,
    height_in: float,
) -> Image.Image:
    target_px = (max(1, round(width_in * PRINT_DPI)), max(1, round(height_in * PRINT_DPI)))
    scaled_image = image.resize(target_px, Image.Resampling.LANCZOS)
    scaled_mask = mask.resize(target_px, Image.Resampling.LANCZOS)
    if settings.smoothing > 0:
        scaled_mask = scaled_mask.filter(ImageFilter.GaussianBlur(radius=max(1, settings.smoothing * 2)))
    scaled_mask = scaled_mask.point(lambda px: 255 if px >= 128 else 0)
    return _line_art(scaled_image, scaled_mask, settings.detail_lines, line_width=9)


def _line_art(image: Image.Image, mask: Image.Image, detail_lines: bool, line_width: int) -> Image.Image:
    mask_l = mask.convert("L")
    eroded = mask_l.filter(ImageFilter.MinFilter(3))
    boundary = Image.fromarray(np.maximum(0, np.asarray(mask_l, dtype=np.int16) - np.asarray(eroded, dtype=np.int16)).astype(np.uint8), mode="L")
    line = Image.new("RGB", image.size, "white")
    draw = ImageDraw.Draw(line)

    if detail_lines:
        gray = image.convert("L").filter(ImageFilter.FIND_EDGES)
        detail = Image.fromarray(((np.asarray(gray) > 38) & (np.asarray(mask_l) > 0)).astype(np.uint8) * 255, mode="L")
        detail = detail.filter(ImageFilter.MaxFilter(max(3, line_width // 2 * 2 + 1)))
        line.paste((180, 180, 180), mask=detail)

    draw.bitmap((0, 0), boundary.filter(ImageFilter.MaxFilter(line_width)), fill=(0, 0, 0))
    return line


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
