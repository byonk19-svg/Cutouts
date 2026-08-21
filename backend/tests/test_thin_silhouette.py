from __future__ import annotations

import unittest

import cv2
import numpy as np

from backend.cutout_studio.thin_silhouette import (
    PROPOSAL_INITIAL_WIDTH_IN,
    PROPOSAL_MAX_WIDTH_IN,
    PROPOSAL_MIN_WIDTH_IN,
    measure_thin_silhouette,
    propose_reinforced_silhouette,
)


def _blank(width: int = 240, height: int = 400) -> np.ndarray:
    return np.zeros((height, width), dtype=np.uint8)


def _straight_limb() -> np.ndarray:
    mask = _blank()
    cv2.line(mask, (120, 40), (120, 360), 1, 3)
    return mask


def _bent_limb() -> np.ndarray:
    mask = _blank()
    cv2.polylines(mask, [np.array([(55, 70), (120, 180), (190, 80)], np.int32)], False, 1, 3)
    return mask


def _t_junction() -> np.ndarray:
    mask = _blank()
    cv2.line(mask, (120, 50), (120, 360), 1, 3)
    cv2.line(mask, (45, 175), (195, 175), 1, 3)
    return mask


def _crossing() -> np.ndarray:
    mask = _blank()
    cv2.line(mask, (45, 50), (195, 350), 1, 3)
    cv2.line(mask, (195, 50), (45, 350), 1, 3)
    return mask


def _thin_limb_broad_body() -> np.ndarray:
    mask = _blank()
    cv2.ellipse(mask, (120, 120), (55, 70), 0, 0, 360, 1, cv2.FILLED)
    cv2.line(mask, (120, 185), (120, 360), 1, 3)
    return mask


def _head_narrow_neck() -> np.ndarray:
    mask = _blank()
    cv2.circle(mask, (120, 85), 48, 1, cv2.FILLED)
    cv2.line(mask, (120, 133), (120, 205), 1, 3)
    cv2.rectangle(mask, (70, 205), (170, 360), 1, cv2.FILLED)
    return mask


def _nearby_limbs(gap_px: int) -> np.ndarray:
    mask = _blank()
    center = 120
    left = center - gap_px // 2
    right = center + gap_px // 2
    cv2.line(mask, (left, 80), (left, 350), 1, 3)
    cv2.line(mask, (right, 80), (right, 350), 1, 3)
    cv2.line(mask, (left, 80), (right, 80), 1, 3)
    return mask


def _loop_attached_stroke() -> np.ndarray:
    mask = _blank()
    cv2.circle(mask, (120, 95), 46, 1, cv2.FILLED)
    cv2.line(mask, (120, 141), (120, 360), 1, 3)
    return mask


def _ordinary_filled() -> np.ndarray:
    mask = _blank()
    cv2.ellipse(mask, (120, 200), (75, 155), 0, 0, 360, 1, cv2.FILLED)
    return mask


def _run8_like() -> np.ndarray:
    mask = _blank()
    cv2.ellipse(mask, (120, 75), (47, 55), 0, 20, 340, 1, 1)
    cv2.line(mask, (120, 134), (120, 270), 1, 1)
    cv2.line(mask, (55, 180), (185, 180), 1, 1)
    cv2.line(mask, (120, 270), (65, 370), 1, 1)
    cv2.line(mask, (120, 270), (190, 360), 1, 1)
    cv2.circle(mask, (108, 75), 2, 1, cv2.FILLED)
    cv2.circle(mask, (133, 75), 2, 1, cv2.FILLED)
    return mask


class ThinSilhouetteGeometryTests(unittest.TestCase):
    def test_width_range_is_explicit_but_not_a_safety_claim(self) -> None:
        self.assertEqual(PROPOSAL_MIN_WIDTH_IN, 0.25)
        self.assertEqual(PROPOSAL_INITIAL_WIDTH_IN, 0.50)
        self.assertEqual(PROPOSAL_MAX_WIDTH_IN, 0.75)

    def test_detector_flags_long_physical_thin_sections(self) -> None:
        diagnostic = measure_thin_silhouette(_run8_like(), finished_height_in=36.0)

        self.assertTrue(diagnostic.detected)
        self.assertGreater(diagnostic.thin_fraction, 0.35)
        self.assertGreater(diagnostic.longest_thin_run_in, 2.0)
        self.assertLess(diagnostic.p10_width_in, 0.25)

    def test_detector_leaves_ordinary_filled_silhouette_alone(self) -> None:
        diagnostic = measure_thin_silhouette(_ordinary_filled(), finished_height_in=20.0)

        self.assertFalse(diagnostic.detected)
        self.assertEqual(diagnostic.thin_fraction, 0.0)

    def test_geometry_matrix_produces_one_external_cutline(self) -> None:
        fixtures = {
            "straight": _straight_limb(),
            "bent": _bent_limb(),
            "t-junction": _t_junction(),
            "crossing": _crossing(),
            "thin-limb-broad-body": _thin_limb_broad_body(),
            "head-narrow-neck": _head_narrow_neck(),
            "nearby-limbs": _nearby_limbs(55),
            "small-gap": _nearby_limbs(8),
            "loop-attached-stroke": _loop_attached_stroke(),
            "ordinary-filled": _ordinary_filled(),
        }

        for name, mask in fixtures.items():
            with self.subTest(name=name):
                proposal = propose_reinforced_silhouette(mask, 20.0, 0.50)
                self.assertTrue(proposal.outer_cut_path.startswith("M "))
                self.assertTrue(proposal.outer_cut_path.endswith("Z"))
                self.assertEqual(proposal.topology.components_after, 1)
                self.assertEqual(proposal.preview_width_px, mask.shape[1])
                self.assertEqual(proposal.preview_height_px, mask.shape[0])

    def test_run8_like_proposal_joins_structural_parts_but_excludes_face_marks(self) -> None:
        proposal = propose_reinforced_silhouette(_run8_like(), 36.0, 0.50)

        self.assertTrue(proposal.topology.components_joined)
        self.assertGreaterEqual(proposal.excluded_small_component_count, 2)
        self.assertGreater(proposal.diagnostic.p10_width_in, 0.35)
        self.assertLess(proposal.diagnostic.p10_width_in, 0.65)

    def test_small_gap_merge_is_reported_for_review(self) -> None:
        proposal = propose_reinforced_silhouette(_nearby_limbs(8), 20.0, 0.50)

        self.assertTrue(proposal.topology.gap_merge_warning)

    def test_ordinary_filled_silhouette_is_byte_equivalent(self) -> None:
        original = _ordinary_filled()
        proposal = propose_reinforced_silhouette(original, 20.0, 0.50)

        np.testing.assert_array_equal(proposal.mask, original)

    def test_requested_width_is_resolution_independent(self) -> None:
        original = _run8_like()
        doubled = cv2.resize(original, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)

        base = propose_reinforced_silhouette(original, 36.0, 0.50).mask
        high = propose_reinforced_silhouette(doubled, 36.0, 0.50).mask
        downsampled = cv2.resize(high, (base.shape[1], base.shape[0]), interpolation=cv2.INTER_AREA) >= 0.5
        intersection = np.count_nonzero((base > 0) & (downsampled > 0))
        union = np.count_nonzero((base > 0) | (downsampled > 0))

        self.assertGreaterEqual(intersection / union, 0.98)

    def test_width_outside_review_range_is_rejected(self) -> None:
        for width in (0.249, 0.751, float("nan")):
            with self.subTest(width=width):
                with self.assertRaisesRegex(ValueError, "between 0.25 and 0.75"):
                    propose_reinforced_silhouette(_straight_limb(), 20.0, width)


if __name__ == "__main__":
    unittest.main()
