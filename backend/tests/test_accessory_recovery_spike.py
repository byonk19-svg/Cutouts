from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from backend.cutout_studio.pipeline import TemplateSettings, _subject_mask
from backend.cutout_studio.accessory_recovery_spike import recover_accessory_detail


FIXTURE_ROOT = Path(__file__).parents[2] / ".scratch" / "run6-accessory-investigation" / "sources"
FIXTURE_MANIFEST = FIXTURE_ROOT.parent / "generated-files.json"


def stroke_mask(size: tuple[int, int], points: list[tuple[int, int]], width: int) -> np.ndarray:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).line(points, fill=255, width=width, joint="curve")
    return np.asarray(mask, dtype=np.uint8)


def annotation_masks(size: tuple[int, int], scale: int = 1) -> tuple[np.ndarray, np.ndarray]:
    points = lambda values: [(x * scale, y * scale) for x, y in values]
    include = np.zeros((size[1], size[0]), dtype=np.uint8)
    for line, width in (
        ([(92, 260), (112, 260)], 6),
        ([(178, 220), (196, 210)], 5),
        ([(155, 194), (180, 184)], 4),
    ):
        include = np.maximum(include, stroke_mask(size, points(line), width * scale))
    exclude = stroke_mask(size, points([(266, 300), (280, 320)]), 10 * scale)
    return include, exclude


def region_pixels(mask: np.ndarray, box: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = box
    return int(np.count_nonzero(mask[y1:y2, x1:x2]))


class AccessoryRecoverySpikeTest(unittest.TestCase):
    def test_ground_truth_masks_are_hash_pinned(self) -> None:
        manifest = json.loads(FIXTURE_MANIFEST.read_text(encoding="utf-8"))
        for fixture in manifest["fixtures"]:
            mask = FIXTURE_ROOT / fixture["accessoryMask"]["path"].split("/")[-1]
            self.assertEqual(fixture["accessoryMask"]["sha256"], hashlib.sha256(mask.read_bytes()).hexdigest())

    def _run_fixture(self, filename: str, scale: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        source = np.asarray(Image.open(FIXTURE_ROOT / filename).convert("RGB"))
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        authoritative_mask = np.asarray(_subject_mask(Image.fromarray(source, mode="RGB").convert("RGBA"), settings)) > 0
        include, exclude = annotation_masks((source.shape[1], source.shape[0]), scale)
        proposal = recover_accessory_detail(source, authoritative_mask, include > 0, exclude > 0)
        self.assertIsNotNone(proposal)
        assert proposal is not None
        self.assertEqual(proposal.detail_mask.shape, authoritative_mask.shape)
        ground_truth = np.asarray(Image.open(FIXTURE_ROOT / filename.replace(".png", "-accessory-mask.png"))) > 0
        return proposal.detail_mask, proposal.region_mask, authoritative_mask, ground_truth, include > 0

    def _metrics(self, region: np.ndarray, ground_truth: np.ndarray, include: np.ndarray) -> dict[str, float]:
        intersection = np.count_nonzero(region & ground_truth)
        union = np.count_nonzero(region | ground_truth)
        local = cv2.dilate(ground_truth.astype(np.uint8), np.ones((11, 11), dtype=np.uint8), iterations=1) > 0
        leakage = np.count_nonzero(region & local & ~ground_truth) / max(1, np.count_nonzero(region & local))
        seed_zone = cv2.dilate(include.astype(np.uint8), np.ones((41, 41), dtype=np.uint8), iterations=1) > 0
        expanded = np.count_nonzero(region & ground_truth & ~seed_zone) / max(1, np.count_nonzero(ground_truth))
        return {
            "recall": intersection / max(1, np.count_nonzero(ground_truth)),
            "iou": intersection / max(1, union),
            "leakage": leakage,
            "coverage": np.count_nonzero(include & ground_truth) / max(1, np.count_nonzero(ground_truth)),
            "expanded": expanded,
        }

    def test_low_resolution_annotations_recover_one_coherent_accessory_without_artifact(self) -> None:
        detail, region, authoritative, ground_truth, include = self._run_fixture("compound-defining-accessory-low.png", 1)
        metrics = self._metrics(region, ground_truth, include)
        self.assertGreater(metrics["recall"], 0.42)
        self.assertGreater(metrics["iou"], 0.30)
        self.assertLess(metrics["leakage"], 0.25)
        self.assertLess(metrics["coverage"], 0.35)
        self.assertGreater(metrics["expanded"], 0.15)
        self.assertLess(region_pixels(detail, (330, 440, 370, 480)), 10)
        self.assertFalse(np.array_equal(region, authoritative))

    def test_high_resolution_annotations_preserve_the_same_accessory_relationships(self) -> None:
        _detail, region, _authoritative, ground_truth, include = self._run_fixture("compound-defining-accessory-high.png", 2)
        metrics = self._metrics(region, ground_truth, include)
        self.assertGreater(metrics["recall"], 0.42)
        self.assertGreater(metrics["iou"], 0.30)
        self.assertLess(metrics["leakage"], 0.25)
        self.assertLess(metrics["coverage"], 0.35)
        self.assertGreater(metrics["expanded"], 0.15)

    def test_low_and_high_resolution_metrics_are_similar(self) -> None:
        _detail, low_region, _authoritative, low_ground_truth, low_include = self._run_fixture("compound-defining-accessory-low.png", 1)
        _detail, high_region, _authoritative, high_ground_truth, high_include = self._run_fixture("compound-defining-accessory-high.png", 2)
        low = self._metrics(low_region, low_ground_truth, low_include)
        high = self._metrics(high_region, high_ground_truth, high_include)
        self.assertLess(abs(low["recall"] - high["recall"]), 0.15)
        self.assertLess(abs(low["iou"] - high["iou"]), 0.20)
        self.assertLess(abs(low["coverage"] - high["coverage"]), 0.05)

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
