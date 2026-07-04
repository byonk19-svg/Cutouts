import io
import unittest

from PIL import Image, ImageDraw
from pypdf import PdfReader

from backend.cutout_studio.pipeline import (
    TemplateSettings,
    analyze_template,
    build_template_pdf,
    extract_palette,
    load_paint_catalog,
    match_paints,
    tile_grid,
)


def transparent_fixture() -> bytes:
    image = Image.new("RGBA", (240, 320), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((42, 30, 198, 286), fill=(206, 42, 42, 255))
    draw.ellipse((88, 74, 128, 118), fill=(255, 232, 82, 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def white_background_fixture() -> bytes:
    image = Image.new("RGB", (260, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((46, 40, 214, 180), fill=(45, 116, 70))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=95)
    return out.getvalue()


class PrintPipelineTest(unittest.TestCase):
    def test_analyze_transparent_image_returns_preview_and_tile_summary(self) -> None:
        settings = TemplateSettings(finished_height_in=24, threshold=40, palette_size=4)

        analysis = analyze_template(transparent_fixture(), settings)

        self.assertEqual(analysis.source_width_px, 240)
        self.assertEqual(analysis.source_height_px, 320)
        self.assertGreater(analysis.finished_width_in, 10)
        self.assertEqual(analysis.finished_height_in, 24)
        self.assertEqual(analysis.tile_count, analysis.tile_cols * analysis.tile_rows)
        self.assertGreater(len(analysis.preview_png), 1000)
        self.assertGreaterEqual(len(analysis.palette), 1)

    def test_white_background_image_uses_threshold_to_find_subject(self) -> None:
        settings = TemplateSettings(finished_height_in=18, threshold=35, detail_lines=False)

        analysis = analyze_template(white_background_fixture(), settings)

        left, top, right, bottom = analysis.subject_bounds_px
        self.assertLess(left, 60)
        self.assertLess(top, 55)
        self.assertGreater(right, 200)
        self.assertGreater(bottom, 165)

    def test_pdf_contains_overview_color_guide_and_all_tile_pages(self) -> None:
        settings = TemplateSettings(finished_height_in=30, threshold=40, palette_size=3)
        analysis = analyze_template(transparent_fixture(), settings)

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        reader = PdfReader(io.BytesIO(pdf_bytes))

        self.assertGreater(len(pdf_bytes), 10_000)
        self.assertEqual(len(reader.pages), analysis.tile_count + 2)
        first_text = reader.pages[0].extract_text()
        self.assertIn("Cutout Studio Template Pack", first_text)
        tile_text = reader.pages[2].extract_text()
        self.assertIn("Page 1 of", tile_text)

    def test_empty_white_image_fails_deterministically(self) -> None:
        image = Image.new("RGB", (120, 120), "white")
        out = io.BytesIO()
        image.save(out, format="PNG")

        with self.assertRaisesRegex(ValueError, "No subject"):
            analyze_template(out.getvalue(), TemplateSettings(threshold=40))

    def test_tile_grid_preserves_at_least_one_page(self) -> None:
        self.assertEqual(tile_grid(2, 2), (1, 1))
        cols, rows = tile_grid(24, 36)
        self.assertGreater(cols, 1)
        self.assertGreater(rows, 1)

    def test_paint_matches_are_ranked_and_limited(self) -> None:
        paints = load_paint_catalog()

        matches = match_paints((246, 246, 238), paints, limit=3)

        self.assertEqual(len(matches), 3)
        self.assertLessEqual(matches[0].distance, matches[1].distance)
        self.assertLessEqual(matches[1].distance, matches[2].distance)
        self.assertTrue(matches[0].brand)
        self.assertTrue(matches[0].name)

    def test_palette_extraction_respects_requested_color_limit(self) -> None:
        image = Image.open(io.BytesIO(transparent_fixture())).convert("RGBA")
        mask = image.getchannel("A")

        palette = extract_palette(image, mask, 2)

        self.assertLessEqual(len(palette), 2)
        self.assertGreater(len(palette[0].matches), 0)


if __name__ == "__main__":
    unittest.main()
