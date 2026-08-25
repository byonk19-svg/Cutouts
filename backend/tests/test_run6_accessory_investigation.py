from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

from PIL import Image

from backend.cutout_studio.pipeline import TemplateSettings, _detail_line_mask, _subject_mask


FIXTURE_ROOT = Path(__file__).parents[2] / ".scratch" / "run6-accessory-investigation"
SOURCE_ROOT = FIXTURE_ROOT / "sources"


def _region_pixels(image: Image.Image, box: tuple[int, int, int, int]) -> int:
    return sum(1 for pixel in image.crop(box).convert("L").get_flattened_data() if pixel > 0)


class Run6AccessoryInvestigationTest(unittest.TestCase):
    def test_low_resolution_fixture_manifest_is_deterministic(self) -> None:
        manifest = json.loads((FIXTURE_ROOT / "generated-files.json").read_text(encoding="utf-8"))
        entry = next(item for item in manifest["fixtures"] if item["id"] == "compound-defining-accessory-low")
        source = SOURCE_ROOT / "compound-defining-accessory-low.png"
        self.assertEqual((entry["widthPx"], entry["heightPx"]), (400, 500))
        self.assertEqual(entry["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())

    def test_high_resolution_fixture_manifest_is_deterministic(self) -> None:
        manifest = json.loads((FIXTURE_ROOT / "generated-files.json").read_text(encoding="utf-8"))
        entry = next(item for item in manifest["fixtures"] if item["id"] == "compound-defining-accessory-high")
        source = SOURCE_ROOT / "compound-defining-accessory-high.png"
        self.assertEqual((entry["widthPx"], entry["heightPx"]), (800, 1000))
        self.assertEqual(entry["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())

    def test_low_resolution_baseline_documents_body_and_connector_loss(self) -> None:
        source = Image.open(SOURCE_ROOT / "compound-defining-accessory-low.png").convert("RGBA")
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        detail = _detail_line_mask(
            source,
            _subject_mask(source, settings),
            cleanup=88,
            print_scale=False,
            template_style="clean",
            detail_extraction_mode="rendered",
        )

        self.assertEqual(_region_pixels(detail, (35, 198, 195, 320)), 0)
        self.assertLess(_region_pixels(detail, (145, 180, 255, 255)), 20)
        self.assertGreater(_region_pixels(detail, (50, 90, 365, 260)), 160)
        self.assertLess(_region_pixels(detail, (330, 440, 370, 480)), 10)

    def test_high_resolution_baseline_exposes_scale_dependence_without_distant_artifact(self) -> None:
        source = Image.open(SOURCE_ROOT / "compound-defining-accessory-high.png").convert("RGBA")
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        detail = _detail_line_mask(
            source,
            _subject_mask(source, settings),
            cleanup=88,
            print_scale=False,
            template_style="clean",
            detail_extraction_mode="rendered",
        )

        self.assertGreater(_region_pixels(detail, (70, 396, 390, 640)), 120)
        self.assertGreater(_region_pixels(detail, (290, 360, 510, 510)), 40)
        self.assertGreater(_region_pixels(detail, (100, 180, 730, 520)), 160)
        self.assertLess(_region_pixels(detail, (660, 880, 740, 960)), 10)


if __name__ == "__main__":
    unittest.main()
