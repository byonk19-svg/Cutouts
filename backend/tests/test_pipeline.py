import io
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader

from backend.cutout_studio.pipeline import (
    TemplateSettings,
    Paint,
    PaintGuideEntry,
    analyze_template,
    build_template_pdf,
    CALIBRATION_SQUARE_PT,
    extract_palette,
    load_paint_catalog,
    match_paints,
    tile_grid,
    _clean_feature_line_tuning,
    _detail_line_mask,
    _fill_small_holes,
    _line_art,
    _remove_small_components,
)


CORALINE_FIXTURE_DIR = Path(__file__).with_name("fixtures") / "coraline"


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


def ten_color_fixture() -> bytes:
    image = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    colors = [
        (230, 34, 34, 255),
        (230, 138, 34, 255),
        (230, 220, 34, 255),
        (88, 190, 52, 255),
        (34, 170, 160, 255),
        (34, 96, 220, 255),
        (110, 70, 210, 255),
        (190, 60, 170, 255),
        (110, 76, 42, 255),
        (24, 24, 28, 255),
    ]
    for index, color in enumerate(colors):
        draw.rectangle((index * 30, 20, index * 30 + 29, 280), fill=color)
    out = io.BytesIO()
    image.save(out, format="PNG")
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


def simple_character_with_lower_texture_fixture() -> tuple[Image.Image, Image.Image]:
    image, mask = simple_character_color_regions_fixture()
    draw = ImageDraw.Draw(image)
    draw.line((55, 229, 67, 231), fill=(8, 8, 8, 255), width=4)
    draw.line((105, 231, 117, 233), fill=(8, 8, 8, 255), width=4)
    draw.line((68, 186, 80, 187), fill=(8, 8, 8, 255), width=4)
    draw.line((104, 189, 116, 191), fill=(8, 8, 8, 255), width=4)
    return image, mask


def same_luminance_color_regions_fixture() -> tuple[Image.Image, Image.Image]:
    image = Image.new("RGBA", (180, 220), (255, 255, 255, 0))
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((35, 24, 145, 196), radius=28, fill=255)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 24, 145, 196), radius=28, fill=(200, 40, 40, 255))
    draw.rectangle((90, 24, 145, 196), fill=(42, 80, 250, 255))
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

    def test_pdf_contains_polished_cover_paint_guide_and_all_tile_pages(self) -> None:
        settings = TemplateSettings(finished_height_in=30, threshold=40, palette_size=3, project_name="Coraline Packet")
        analysis = analyze_template(transparent_fixture(), settings)

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        reader = PdfReader(io.BytesIO(pdf_bytes))

        self.assertGreater(len(pdf_bytes), 10_000)
        self.assertEqual(len(reader.pages), analysis.tile_count + 2)
        first_text = reader.pages[0].extract_text()
        self.assertIn("Coraline Packet", first_text)
        self.assertIn("Finished size:", first_text)
        self.assertIn("Print at 100% / actual size", first_text)
        self.assertIn("Actual size or 100% scale - never Fit to page", first_text)
        self.assertIn("1-inch calibration square", first_text)
        self.assertIn("Supplies checklist", first_text)
        self.assertIn("plywood or foam board", first_text)
        self.assertIn("Print all pages at 100%.", first_text)
        self.assertIn("Page map", first_text)
        self.assertIn("Row 1 / Column 1", first_text)
        self.assertIn("Linework legend", first_text)
        self.assertIn("Outer cutline", first_text)
        self.assertIn("Detail/paint transfer line", first_text)
        self.assertIn("Original image/underlay is not printed on tiled template pages", first_text)
        paint_text = reader.pages[1].extract_text()
        self.assertIn("Paint Guide", paint_text)
        self.assertIn("Screen colors and printed colors may vary", paint_text)
        self.assertIn("Shopping list", paint_text)
        tile_text = reader.pages[2].extract_text()
        self.assertIn("Page 1 of", tile_text)
        self.assertIn("Coraline Packet", tile_text)
        self.assertIn("Row 1 / Column 1", tile_text)
        self.assertIn("Overlap guide: 0.25 in", tile_text)
        self.assertNotIn("1 in", tile_text)

    def test_pdf_cover_page_can_be_disabled(self) -> None:
        settings = TemplateSettings(finished_height_in=30, threshold=40, palette_size=3, include_instruction_cover_page=False)
        analysis = analyze_template(transparent_fixture(), settings)

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        reader = PdfReader(io.BytesIO(pdf_bytes))

        self.assertEqual(len(reader.pages), analysis.tile_count + 1)
        first_text = reader.pages[0].extract_text()
        self.assertIn("Paint Guide", first_text)
        self.assertNotIn("Supplies checklist", first_text)

    def test_paint_guide_page_can_be_disabled(self) -> None:
        settings = TemplateSettings(finished_height_in=30, threshold=40, palette_size=3, include_paint_guide_page=False)
        analysis = analyze_template(transparent_fixture(), settings)

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join(page.extract_text() for page in reader.pages)

        self.assertEqual(len(reader.pages), analysis.tile_count + 1)
        self.assertNotIn("Paint Guide", text)
        self.assertIn("Supplies checklist", reader.pages[0].extract_text())
        self.assertIn("Page 1 of", reader.pages[1].extract_text())

    def test_paint_guide_page_includes_labels_notes_and_shopping_list(self) -> None:
        coat_note = "main coat and bright yellow areas for the hood and sleeves"
        settings = TemplateSettings(
            finished_height_in=18,
            threshold=40,
            palette_size=3,
            project_name="Coraline Paint",
            paint_guide_entries=(
                PaintGuideEntry("#cc2424", "Hair", "blue-black hair", True, "apple-barrel-matte-bright-red"),
                PaintGuideEntry("#fce454", "Coat", coat_note, True, "apple-barrel-matte-bright-yellow"),
            ),
        )

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        text = PdfReader(io.BytesIO(pdf_bytes)).pages[1].extract_text()

        self.assertIn("Paint Guide", text)
        self.assertIn("Coraline Paint", text)
        self.assertIn("Hair", text)
        self.assertIn("blue-black hair", text)
        self.assertIn("Coat", text)
        self.assertIn("main coat and bright yellow areas", text)
        self.assertIn("hood and sleeves", text)
        self.assertIn("Apple Barrel", text)
        self.assertIn("Bright Red", text)
        self.assertIn("Bright Yellow", text)
        self.assertIn("Paint matches are approximate.", text)
        self.assertIn("Shopping list", text)

    def test_paint_guide_page_includes_manual_override(self) -> None:
        settings = TemplateSettings(
            finished_height_in=18,
            threshold=40,
            palette_size=3,
            paint_guide_entries=(
                PaintGuideEntry("#fce454", "Coat", "yellow raincoat", True, None, "Custom yellow mix"),
            ),
        )

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        text = PdfReader(io.BytesIO(pdf_bytes)).pages[1].extract_text()

        self.assertIn("Custom yellow mix", text)
        self.assertIn("Coat: Custom yellow mix", text)

    def test_hidden_paint_color_is_omitted_from_shopping_list(self) -> None:
        settings = TemplateSettings(
            finished_height_in=18,
            threshold=40,
            palette_size=2,
            paint_guide_entries=(
                PaintGuideEntry("#cc2424", "Hidden Hair", "skip this", False),
                PaintGuideEntry("#fce454", "Visible Coat", "buy this", True),
            ),
        )

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        text = PdfReader(io.BytesIO(pdf_bytes)).pages[1].extract_text()
        shopping_list_text = text.split("Shopping list", 1)[1]

        self.assertIn("Hidden Hair", text)
        self.assertIn("Hidden from shopping list", text)
        self.assertNotIn("Hidden Hair", shopping_list_text)
        self.assertIn("Visible Coat", shopping_list_text)

    def test_paint_guide_page_can_show_ten_palette_colors(self) -> None:
        settings = TemplateSettings(finished_height_in=18, threshold=40, palette_size=10)
        analysis = analyze_template(ten_color_fixture(), settings)

        pdf_bytes = build_template_pdf(ten_color_fixture(), settings)
        text = PdfReader(io.BytesIO(pdf_bytes)).pages[1].extract_text()

        self.assertEqual(len(analysis.palette), 10)
        self.assertIn("10. Color 10", text)

    def test_pdf_export_excludes_editor_transient_state_text(self) -> None:
        settings = TemplateSettings(finished_height_in=18, threshold=40, palette_size=3, project_name="Clean Packet")

        pdf_bytes = build_template_pdf(transparent_fixture(), settings)
        text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf_bytes)).pages)

        self.assertNotIn("Selection Inspector", text)
        self.assertNotIn("selectedStrokeId", text)
        self.assertNotIn("dimUnselected", text)
        self.assertNotIn("Original underlay", text)

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

    def test_calibration_square_is_one_printed_inch(self) -> None:
        self.assertEqual(CALIBRATION_SQUARE_PT, 72)

    def test_paint_matches_are_ranked_and_limited(self) -> None:
        paints = load_paint_catalog()

        matches = match_paints((246, 246, 238), paints, limit=3)

        self.assertEqual(len(matches), 3)
        self.assertLessEqual(matches[0].distance, matches[1].distance)
        self.assertLessEqual(matches[1].distance, matches[2].distance)
        self.assertTrue(matches[0].id)
        self.assertTrue(matches[0].brand)
        self.assertTrue(matches[0].color_name)
        self.assertIn(matches[0].confidence, {"close match", "approximate match", "poor match / manual check recommended"})

    def test_lab_paint_matching_ranks_closer_color_above_farther_color(self) -> None:
        paints = [
            self._paint("near-red", (238, 2, 4), outdoor=False),
            self._paint("far-blue", (20, 40, 210), outdoor=True),
            self._paint("far-green", (30, 160, 70), outdoor=False),
        ]

        matches = match_paints((240, 0, 0), paints, limit=3)

        self.assertEqual(matches[0].id, "near-red")
        self.assertEqual([match.id for match in matches], ["near-red", "far-green", "far-blue"])

    def test_outdoor_recommended_breaks_near_ties(self) -> None:
        paints = [
            self._paint("indoor-neutral", (100, 100, 100), outdoor=False),
            self._paint("outdoor-neutral", (100, 100, 100), outdoor=True),
            self._paint("far-neutral", (160, 160, 160), outdoor=True),
        ]

        matches = match_paints((100, 100, 100), paints, limit=3)

        self.assertEqual(matches[0].id, "outdoor-neutral")
        self.assertEqual(matches[1].id, "indoor-neutral")

    def test_palette_extraction_respects_requested_color_limit(self) -> None:
        image = Image.open(io.BytesIO(transparent_fixture())).convert("RGBA")
        mask = image.getchannel("A")

        palette = extract_palette(image, mask, 2)

        self.assertLessEqual(len(palette), 2)
        self.assertGreater(len(palette[0].matches), 0)

    def test_marker_template_style_is_accepted_from_settings(self) -> None:
        settings = TemplateSettings.from_mapping({"templateStyle": "marker"})

        self.assertEqual(settings.template_style, "marker")

    def test_packet_export_settings_accept_project_name_and_cover_toggle(self) -> None:
        settings = TemplateSettings.from_mapping({
            "templateStyle": "manual",
            "projectName": "  Coraline Packet  ",
            "includeInstructionCoverPage": False,
            "includePaintGuidePage": False,
            "paintGuideEntries": [
                {
                    "hex": "fce454",
                    "label": "Coat",
                    "note": "yellow raincoat",
                    "included": False,
                    "selectedMatchId": "apple-barrel-matte-bright-yellow",
                    "manualOverride": "custom mix"
                }
            ],
        })

        self.assertEqual(settings.project_name, "Coraline Packet")
        self.assertFalse(settings.include_instruction_cover_page)
        self.assertFalse(settings.include_paint_guide_page)
        self.assertEqual(settings.paint_guide_entries[0].hex, "#fce454")
        self.assertEqual(settings.paint_guide_entries[0].label, "Coat")
        self.assertFalse(settings.paint_guide_entries[0].included)
        self.assertEqual(settings.paint_guide_entries[0].selected_match_id, "apple-barrel-matte-bright-yellow")
        self.assertEqual(settings.paint_guide_entries[0].manual_override, "custom mix")

    def test_manual_trace_mode_returns_cutline_with_blank_detail_layer(self) -> None:
        settings = TemplateSettings.from_mapping({"templateStyle": "manual", "detailLines": False})

        analysis = analyze_template(transparent_fixture(), settings)
        outer = Image.open(io.BytesIO(analysis.outer_line_png)).convert("RGBA")
        detail = Image.open(io.BytesIO(analysis.detail_line_png)).convert("RGBA")

        self.assertEqual(settings.template_style, "manual")
        self.assertGreater(self._count_mask_pixels(outer.getchannel("A")), 0)
        self.assertEqual(self._count_mask_pixels(detail.getchannel("A")), 0)

    def test_detail_cleanup_reduces_noisy_interior_lines(self) -> None:
        image, mask = noisy_detail_fixture()

        noisy = _detail_line_mask(image, mask, cleanup=0, print_scale=False)
        cleaned = _detail_line_mask(image, mask, cleanup=100, print_scale=False)

        noisy_gray_pixels = self._count_mask_pixels(noisy)
        cleaned_gray_pixels = self._count_mask_pixels(cleaned)
        self.assertLess(cleaned_gray_pixels, noisy_gray_pixels // 2)

    def test_component_cleanup_preserves_thin_diagonal_detail_strokes(self) -> None:
        mask = Image.new("L", (16, 16), 0)
        draw = ImageDraw.Draw(mask)
        for index in range(3, 9):
            draw.point((index, index), fill=255)

        cleaned = _remove_small_components(mask, min_area=5)

        self.assertGreaterEqual(self._count_mask_pixels(cleaned), 6)

    def test_hole_cleanup_does_not_fill_diagonal_escape_to_background(self) -> None:
        mask = Image.new("L", (9, 9), 255)
        pixels = mask.load()
        for point in ((0, 0), (1, 1), (2, 2), (3, 3)):
            pixels[point] = 0

        filled = _fill_small_holes(mask, max_area=8)

        self.assertEqual(filled.getpixel((3, 3)), 0)

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

    def test_clean_template_style_keeps_major_character_feature_lines(self) -> None:
        image, mask = simple_character_color_regions_fixture()

        clean = _detail_line_mask(image, mask, cleanup=88, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (66, 42, 116, 84)), 180)
        self.assertGreater(self._count_region_pixels(clean, (50, 18, 130, 95)), 120)
        self.assertGreater(self._count_region_pixels(clean, (52, 90, 132, 178)), 120)
        self.assertLess(self._count_region_pixels(clean, (46, 96, 58, 168)), 30)
        self.assertLess(self._count_region_pixels(clean, (60, 176, 120, 226)), 30)

    def test_clean_template_style_keeps_same_luminance_color_boundaries(self) -> None:
        image, mask = same_luminance_color_regions_fixture()

        clean = _detail_line_mask(image, mask, cleanup=88, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (84, 34, 96, 186)), 100)

    def test_clean_template_style_drops_lower_body_texture_fragments(self) -> None:
        image, mask = simple_character_with_lower_texture_fixture()

        clean = _detail_line_mask(image, mask, cleanup=88, print_scale=False, template_style="clean")

        self.assertGreater(self._count_region_pixels(clean, (66, 42, 116, 84)), 180)
        self.assertGreater(self._count_region_pixels(clean, (50, 18, 130, 95)), 120)
        self.assertGreater(self._count_region_pixels(clean, (52, 90, 132, 178)), 120)
        self.assertLess(self._count_region_pixels(clean, (48, 224, 90, 244)), 25)
        self.assertLess(self._count_region_pixels(clean, (98, 224, 132, 244)), 25)

    def test_marker_template_style_keeps_major_features_and_drops_lower_texture(self) -> None:
        image, mask = simple_character_with_lower_texture_fixture()

        marker = _detail_line_mask(image, mask, cleanup=88, print_scale=False, template_style="marker")

        self.assertGreater(self._count_region_pixels(marker, (66, 42, 116, 84)), 120)
        self.assertGreater(self._count_region_pixels(marker, (50, 18, 130, 95)), 80)
        self.assertGreater(self._count_region_pixels(marker, (52, 90, 132, 178)), 80)
        self.assertLess(self._count_region_pixels(marker, (48, 224, 90, 244)), 12)
        self.assertLess(self._count_region_pixels(marker, (98, 224, 132, 244)), 12)

    def test_clean_template_max_cleanup_gets_extra_feature_line_suppression(self) -> None:
        normal_blur, normal_threshold, normal_min_area = _clean_feature_line_tuning(92, print_scale=False)
        max_blur, max_threshold, max_min_area = _clean_feature_line_tuning(100, print_scale=False)

        self.assertGreater(max_blur, normal_blur)
        self.assertGreater(max_threshold, normal_threshold)
        self.assertGreater(max_min_area, normal_min_area)

    def test_coraline_golden_outputs_remain_clean_template_baseline(self) -> None:
        composed = Image.open(CORALINE_FIXTURE_DIR / "coraline-best-clean-outline.png").convert("RGBA")
        outer = Image.open(CORALINE_FIXTURE_DIR / "coraline-cut-only-outline.png").convert("RGBA")
        detail = Image.open(CORALINE_FIXTURE_DIR / "coraline-detail-layer.png").convert("RGBA")

        self.assertEqual(composed.size, (359, 900))
        self.assertEqual(outer.size, composed.size)
        self.assertEqual(detail.size, composed.size)
        self.assertTrue(self._is_black_and_white_image(composed))
        self.assertTrue(self._is_transparent_black_layer(outer))
        self.assertTrue(self._is_transparent_black_layer(detail))
        self.assertGreater(self._count_mask_pixels(detail.getchannel("A")), 4_500)
        self.assertLess(self._count_mask_pixels(detail.getchannel("A")), 6_500)

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

    def _is_black_and_white_image(self, image: Image.Image) -> bool:
        return set(image.convert("RGB").get_flattened_data()) <= {(0, 0, 0), (255, 255, 255)}

    def _paint(self, paint_id: str, rgb: tuple[int, int, int], outdoor: bool) -> Paint:
        return Paint(
            id=paint_id,
            brand="Test",
            line="Acrylic",
            color_name=paint_id,
            rgb=rgb,
            finish="matte",
            outdoor_recommended=outdoor,
            retailer="",
            product_url="",
            notes="",
        )


if __name__ == "__main__":
    unittest.main()
