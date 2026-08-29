from __future__ import annotations

import unittest

import numpy as np
from PIL import Image

from backend.cutout_studio.normalized_stage_diagnostics import (
    DEFAULT_ROI,
    _crop_roi,
    _linework_view,
    _normalize,
)


class NormalizedStageDiagnosticsTest(unittest.TestCase):
    def test_binary_linework_view_inverts_internal_mask_convention(self) -> None:
        mask = Image.fromarray(np.array([[0, 255], [255, 0]], dtype=np.uint8), mode="L")
        self.assertEqual(list(_linework_view(mask, True).get_flattened_data()), [255, 0, 0, 255])

    def test_binary_normalization_uses_nearest_neighbor(self) -> None:
        mask = Image.fromarray(np.array([[0, 255], [255, 0]], dtype=np.uint8), mode="L")
        normalized = _normalize(mask, (4, 4), True)
        self.assertEqual(set(normalized.get_flattened_data()), {0, 255})

    def test_roi_is_deterministic_and_non_empty(self) -> None:
        image = Image.new("L", (100, 200), 255)
        roi = _crop_roi(image, DEFAULT_ROI)
        self.assertEqual(roi.size, (46, 60))


if __name__ == "__main__":
    unittest.main()
