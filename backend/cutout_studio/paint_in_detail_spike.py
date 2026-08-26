"""Proposal-only feasibility helper for direct maker-painted Detail Lines."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import cv2


@dataclass(frozen=True)
class PaintInDetailProposal:
    detail_mask: np.ndarray


def build_paint_in_detail_proposal(
    image_rgb: np.ndarray,
    authoritative_mask: np.ndarray,
    painted_mask: np.ndarray,
) -> PaintInDetailProposal | None:
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ValueError("image_rgb must be an HxWx3 array")
    if authoritative_mask.shape != image_rgb.shape[:2] or painted_mask.shape != authoritative_mask.shape:
        raise ValueError("mask shapes must match image_rgb")
    painted = painted_mask.astype(bool)
    if not np.any(painted):
        return None

    painted_u8 = painted.astype(np.uint8) * 255
    contours, _hierarchy = cv2.findContours(painted_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    detail = np.zeros_like(painted_u8)
    cv2.drawContours(detail, contours, -1, 255, 1)

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    source_edges = cv2.Canny(gray, 24, 72)
    detail = np.maximum(detail, np.where(painted, source_edges, 0).astype(np.uint8))

    # Suppress the authoritative Cut Line perimeter, while leaving all other
    # maker-painted detail strictly inside the selected region.
    authoritative_u8 = authoritative_mask.astype(np.uint8) * 255
    authoritative_inner = cv2.erode(
        authoritative_u8,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
    )
    authoritative_boundary = (authoritative_u8 > 0) & (authoritative_inner == 0)
    detail[authoritative_boundary] = 0
    detail[~painted] = 0

    # Remove isolated specks without expanding beyond the maker's painted
    # region. This proposal never becomes accepted project state by itself.
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats((detail > 0).astype(np.uint8), connectivity=8)
    minimum_area = max(4, round(min(image_rgb.shape[:2]) * 0.002))
    keep = np.zeros_like(detail)
    for label in range(1, count):
        if int(stats[label, cv2.CC_STAT_AREA]) >= minimum_area:
            keep[labels == label] = 255
    if not np.any(keep):
        return None
    return PaintInDetailProposal(detail_mask=keep)
