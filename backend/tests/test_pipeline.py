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
    _detail_line_mask,
    _line_art,
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


def noisy_detail_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 220), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=255)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=(222, 196, 62, 255))
    for x in range(40, 140, 7):
        for y in range(30, 190, 11):
            color = (138, 122, 54, 255) if (x + y) % 3 else (244, 232, 125, 255)
            draw.point((x, y), fill=color)
    return image, mask


def broad_color_detail_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 220), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=255)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=(214, 64, 50, 255))
    draw.ellipse((62, 62, 96, 96), fill=(252, 227, 82, 255))
    draw.ellipse((102, 62, 136, 96), fill=(37, 92, 162, 255))
    draw.rectangle((76, 132, 112, 190), fill=(55, 128, 70, 255))
    return image, mask


def smooth_gradient_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 220), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=255)
    pixels = image.load()
    for y in range(24, 197):
        for x in range(35, 146):
            if mask.getpixel((x, y)) == 0:
                continue
            shade = 120 + round((x - 35) / 110 * 80)
            pixels[x, y] = (shade, shade, shade, 255)
    return image, mask


def dark_feature_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 220), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=255)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 24, 145, 196), radius=32, fill=(230, 205, 145, 255))
    draw.ellipse((62, 70, 76, 88), outline=(10, 10, 10, 255), width=3)
    draw.ellipse((104, 70, 118, 88), fill=(10, 10, 10, 255))
    draw.arc((76, 104, 114, 132), start=15, end=165, fill=(10, 10, 10, 255), width=3)
    draw.line((86, 92, 90, 102), fill=(10, 10, 10, 255), width=2)
    return image, mask


def dark_fill_with_features_fixture() -> tuple[Image.Image, Image.Image]:
    image, mask = dark_feature_fixture()
    draw = ImageDraw.Draw(image)
    draw.rectangle((52, 138, 128, 188), fill=(8, 8, 8, 255))
    return image, mask


def elongated_dark_feature_fixture() -> tuple[Image.Image, Image.Image]:
    image, mask = dark_feature_fixture()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 150, 118, 164), radius=5, fill=(8, 8, 8, 255))
    return image, mask


def lower_body_compact_dark_feature_fixture() -> tuple[Image.Image, Image.Image]:
    image, mask = dark_feature_fixture()
    draw = ImageDraw.Draw(image)
    draw.ellipse((78, 150, 94, 168), fill=(8, 8, 8, 255))
    return image, mask


def simple_character_color_regions_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 260), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((50, 18, 130, 92), fill=255)
    mask_draw.rounded_rectangle((46, 88, 134, 178), radius=14, fill=255)
    mask_draw.rectangle((66, 176, 84, 226), fill=255)
    mask_draw.rectangle((96, 176, 114, 226), fill=255)
    mask_draw.rounded_rectangle((44, 218, 86, 246), radius=10, fill=255)
    mask_draw.rounded_rectangle((94, 218, 136, 246), radius=10, fill=255)
    draw = ImageDraw.Draw(image)
    draw.ellipse((50, 18, 130, 92), fill=(228, 190, 148, 255))
    draw.pieslice((38, 8, 142, 110), start=190, end=350, fill=(12, 20, 58, 255))
    draw.rounded_rectangle((46, 88, 134, 178), radius=14, fill=(225, 195, 38, 255))
    draw.line((58, 88, 126, 178), fill=(116, 32, 78, 255), width=10)
    draw.rectangle((60, 176, 120, 204), fill=(125, 32, 48, 255))
    draw.rectangle((66, 204, 84, 226), fill=(40, 48, 62, 255))
    draw.rectangle((96, 204, 114, 226), fill=(40, 48, 62, 255))
    draw.rounded_rectangle((44, 218, 86, 246), radius=10, fill=(190, 158, 42, 255))
    draw.rounded_rectangle((94, 218, 136, 246), radius=10, fill=(190, 158, 42, 255))
    draw.ellipse((70, 48, 82, 62), fill=(20, 20, 20, 255))
    draw.ellipse((100, 48, 112, 62), fill=(20, 20, 20, 255))
    draw.arc((76, 64, 110, 82), start=10, end=160, fill=(80, 12, 42, 255), width=3)
    return image, mask


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
        self.assertGreater(len(analysis.outer_line_png), 1000)
        self.assertGreater(len(analysis.detail_line_png), 100)
        self.assertGreater(len(analysis.paint_guide_png), 1000)
        self.assertGreater(analysis.preview_width_px, 0)
        self.assertGreater(analysis.preview_height_px, 0)
        self.assertGreaterEqual(len(analysis.palette), 1)

    def test_analyze_returns_separate_trace_layers_and_color_guide(self) -> None:
        settings = TemplateSettings(finished_height_in=24, threshold=40, palette_size=4)

        analysis = analyze_template(transparent_fixture(), settings)

        outer = Image.open(io.BytesIO(analysis.outer_line_png)).convert("RGBA")
        detail = Image.open(io.BytesIO(analysis.detail_line_png)).convert("RGBA")
        paint_guide = Image.open(io.BytesIO(analysis.paint_guide_png)).convert("RGB")

        self.assertTrue(self._has_transparent_background(outer))
        self.assertTrue(self._has_transparent_background(detail))
        self.assertTrue(self._is_transparent_black_layer(outer))
        self.assertTrue(self._is_transparent_black_layer(detail))
        self.assertGreater(len(set(paint_guide.get_flattened_data())), 2)

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

    def test_detail_cleanup_reduces_noisy_interior_lines(self) -> None:
        image, mask = noisy_detail_fixture()

        noisy = _detail_line_mask(image, mask, cleanup=0, print_scale=False)
        cleaned = _detail_line_mask(image, mask, cleanup=100, print_scale=False)

        noisy_gray_pixels = self._count_mask_pixels(noisy)
        cleaned_gray_pixels = self._count_mask_pixels(cleaned)
        self.assertLess(cleaned_gray_pixels, noisy_gray_pixels // 2)

    def test_high_detail_cleanup_keeps_broad_color_boundaries(self) -> None:
        image, mask = broad_color_detail_fixture()

        cleaned = _detail_line_mask(image, mask, cleanup=55, print_scale=False)

        gray_pixels = self._count_mask_pixels(cleaned)
        subject_pixels = sum(1 for pixel in list(mask.get_flattened_data()) if pixel > 0)
        self.assertGreater(gray_pixels, 500)
        self.assertLess(gray_pixels, subject_pixels * 0.2)

    def test_detail_lines_do_not_trace_smooth_shading_as_many_contours(self) -> None:
        image, mask = smooth_gradient_fixture()

        cleaned = _detail_line_mask(image, mask, cleanup=55, print_scale=False)

        gray_pixels = self._count_mask_pixels(cleaned)
        subject_pixels = sum(1 for pixel in list(mask.get_flattened_data()) if pixel > 0)
        self.assertLess(gray_pixels, subject_pixels * 0.08)

    def test_clean_template_style_suppresses_more_texture_than_detailed_style(self) -> None:
        image, mask = noisy_detail_fixture()

        detailed = _detail_line_mask(image, mask, cleanup=35, print_scale=False, template_style="detailed")
        clean = _detail_line_mask(image, mask, cleanup=35, print_scale=False, template_style="clean")

        self.assertLess(self._count_mask_pixels(clean), self._count_mask_pixels(detailed) * 0.5)

    def test_clean_template_style_traces_dark_character_boundaries_without_filling(self) -> None:
        image, mask = dark_feature_fixture()

        clean = _detail_line_mask(image, mask, cleanup=92, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (58, 66, 122, 136)), 120)
        self.assertLess(self._count_region_pixels(clean, (107, 73, 115, 85)), 15)

    def test_clean_template_style_does_not_fill_large_dark_regions(self) -> None:
        image, mask = dark_fill_with_features_fixture()

        clean = _detail_line_mask(image, mask, cleanup=92, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (58, 66, 122, 136)), 120)
        self.assertLess(self._count_region_pixels(clean, (62, 148, 118, 178)), 80)

    def test_clean_template_style_does_not_fill_wide_dark_marks(self) -> None:
        image, mask = elongated_dark_feature_fixture()

        clean = _detail_line_mask(image, mask, cleanup=92, print_scale=False, template_style="clean")

        self.assertLess(self._count_region_pixels(clean, (70, 155, 105, 160)), 25)

    def test_clean_template_style_suppresses_lower_body_dark_marks(self) -> None:
        image, mask = lower_body_compact_dark_feature_fixture()

        clean = _detail_line_mask(image, mask, cleanup=92, print_scale=False, template_style="clean")

        self.assertLess(self._count_region_pixels(clean, (82, 154, 90, 164)), 10)

    def test_clean_template_style_keeps_major_character_paint_boundaries(self) -> None:
        image, mask = simple_character_color_regions_fixture()

        clean = _detail_line_mask(image, mask, cleanup=82, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (50, 18, 130, 95)), 120)
        self.assertGreater(self._count_region_pixels(clean, (52, 90, 132, 178)), 120)
        self.assertGreater(self._count_region_pixels(clean, (60, 176, 120, 226)), 80)
        self.assertLess(self._count_region_pixels(clean, (46, 96, 58, 168)), 30)

    def test_printable_line_art_is_black_and_white_only(self) -> None:
        image, mask = broad_color_detail_fixture()

        line_art = _line_art(image, mask, True, line_width=3, detail_cleanup=55, print_scale=False)

        colors = {pixel for pixel in line_art.get_flattened_data()}
        self.assertLessEqual(colors, {(0, 0, 0), (255, 255, 255)})

    def test_pdf_accepts_edited_detail_layer(self) -> None:
        settings = TemplateSettings(finished_height_in=18, threshold=40, palette_size=3)
        edited = Image.new("RGBA", (120, 160), (255, 255, 255, 0))
        draw = ImageDraw.Draw(edited)
        draw.line((20, 80, 100, 80), fill=(0, 0, 0, 255), width=8)
        out = io.BytesIO()
        edited.save(out, format="PNG")

        pdf_bytes = build_template_pdf(transparent_fixture(), settings, edited_detail_png=out.getvalue())
        reader = PdfReader(io.BytesIO(pdf_bytes))

        self.assertGreater(len(pdf_bytes), 10_000)
        self.assertGreaterEqual(len(reader.pages), 3)

    def _count_mask_pixels(self, image: Image.Image) -> int:
        return sum(1 for pixel in list(image.convert("L").get_flattened_data()) if pixel > 0)

    def _count_region_pixels(self, image: Image.Image, box: tuple[int, int, int, int]) -> int:
        return self._count_mask_pixels(image.crop(box))

    def _has_transparent_background(self, image: Image.Image) -> bool:
        return any(pixel[3] == 0 for pixel in image.get_flattened_data())

    def _is_transparent_black_layer(self, image: Image.Image) -> bool:
        for red, green, blue, alpha in image.get_flattened_data():
            if alpha == 0:
                continue
            if (red, green, blue) != (0, 0, 0):
                return False
        return True


if __name__ == "__main__":
    unittest.main()
