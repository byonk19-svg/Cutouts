from __future__ import annotations

import hashlib
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from backend.cutout_studio.pipeline import TemplateSettings, _subject_mask
from backend.cutout_studio.accessory_recovery_spike import recover_accessory_detail


FIXTURE_ROOT = Path(__file__).parents[2] / ".scratch" / "run6-accessory-investigation" / "sources"


def stroke_mask(size: tuple[int, int], points: list[tuple[int, int]], width: int) -> np.ndarray:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).line(points, fill=255, width=width, joint="curve")
    return np.asarray(mask, dtype=np.uint8)


def annotation_masks(size: tuple[int, int], scale: int = 1) -> tuple[np.ndarray, np.ndarray]:
    points = lambda values: [(x * scale, y * scale) for x, y in values]
    include = np.zeros((size[1], size[0]), dtype=np.uint8)
    for line, width in (
        ([(70, 260), (145, 260)], 12),
        ([(155, 235), (228, 195)], 8),
        ([(70, 242), (300, 130)], 8),
    ):
        include = np.maximum(include, stroke_mask(size, points(line), width * scale))
    exclude = stroke_mask(size, points([(266, 300), (300, 355)]), 14 * scale)
    return include, exclude


def region_pixels(mask: np.ndarray, box: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = box
    return int(np.count_nonzero(mask[y1:y2, x1:x2]))


class AccessoryRecoverySpikeTest(unittest.TestCase):
    def _run_fixture(self, filename: str, scale: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        source = np.asarray(Image.open(FIXTURE_ROOT / filename).convert("RGB"))
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        authoritative_mask = np.asarray(_subject_mask(Image.fromarray(source, mode="RGB").convert("RGBA"), settings)) > 0
        include, exclude = annotation_masks((source.shape[1], source.shape[0]), scale)
        proposal = recover_accessory_detail(source, authoritative_mask, include > 0, exclude > 0)
        self.assertIsNotNone(proposal)
        assert proposal is not None
        self.assertEqual(proposal.detail_mask.shape, authoritative_mask.shape)
        return proposal.detail_mask, proposal.region_mask, authoritative_mask

    def test_low_resolution_annotations_recover_one_coherent_accessory_without_artifact(self) -> None:
        detail, region, authoritative = self._run_fixture("compound-defining-accessory-low.png", 1)
        self.assertGreater(region_pixels(detail, (35, 198, 195, 320)), 120)
        self.assertGreater(region_pixels(detail, (145, 180, 255, 255)), 40)
        self.assertGreater(region_pixels(detail, (50, 90, 365, 260)), 160)
        self.assertLess(region_pixels(detail, (330, 440, 370, 480)), 10)
        self.assertLess(region_pixels(detail, (315, 165, 350, 430)), 60)
        self.assertFalse(np.array_equal(region, authoritative))

    def test_high_resolution_annotations_preserve_the_same_accessory_relationships(self) -> None:
        detail, _region, _authoritative = self._run_fixture("compound-defining-accessory-high.png", 2)
        self.assertGreater(region_pixels(detail, (70, 396, 390, 640)), 480)
        self.assertGreater(region_pixels(detail, (290, 360, 510, 510)), 160)
        self.assertGreater(region_pixels(detail, (100, 180, 730, 520)), 640)
        self.assertLess(region_pixels(detail, (660, 880, 740, 960)), 40)

    def test_exclude_strokes_remove_nearby_material_without_changing_authoritative_mask(self) -> None:
        source = np.asarray(Image.open(FIXTURE_ROOT / "compound-defining-accessory-low.png").convert("RGB"))
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        authoritative = np.asarray(_subject_mask(Image.fromarray(source, mode="RGB").convert("RGBA"), settings)) > 0
        include, exclude = annotation_masks((source.shape[1], source.shape[0]))
        before = hashlib.sha256(authoritative.tobytes()).hexdigest()
        proposal = recover_accessory_detail(source, authoritative, include > 0, exclude > 0)
        self.assertIsNotNone(proposal)
        assert proposal is not None
        self.assertEqual(hashlib.sha256(authoritative.tobytes()).hexdigest(), before)
        self.assertLess(region_pixels(proposal.detail_mask, (266, 300, 300, 355)), 60)

    def test_ambiguous_or_empty_annotations_fail_without_a_partial_proposal(self) -> None:
        source = np.asarray(Image.open(FIXTURE_ROOT / "compound-defining-accessory-low.png").convert("RGB"))
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        authoritative = np.asarray(_subject_mask(Image.fromarray(source, mode="RGB").convert("RGBA"), settings)) > 0
        empty = np.zeros(authoritative.shape, dtype=bool)
        self.assertIsNone(recover_accessory_detail(source, authoritative, empty, empty))


if __name__ == "__main__":
    unittest.main()
