"""Fixture-first feasibility spike for maker-guided accessory detail recovery.

This module is intentionally not imported by the production pipeline. It owns
only proposal geometry and never mutates an authoritative Cut Line.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import cv2


@dataclass(frozen=True)
class AccessoryDetailProposal:
    region_mask: np.ndarray
    detail_mask: np.ndarray


def recover_accessory_detail(
    image_rgb: np.ndarray,
    authoritative_mask: np.ndarray,
    include_strokes: np.ndarray,
    exclude_strokes: np.ndarray,
) -> AccessoryDetailProposal | None:
    """Recover one annotated local accessory as proposal-only detail geometry."""
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ValueError("image_rgb must be an HxWx3 array")
    if authoritative_mask.shape != image_rgb.shape[:2]:
        raise ValueError("authoritative_mask shape must match image_rgb")
    if include_strokes.shape != authoritative_mask.shape or exclude_strokes.shape != authoritative_mask.shape:
        raise ValueError("annotation masks must match authoritative_mask")
    include = include_strokes.astype(bool)
    exclude = exclude_strokes.astype(bool)
    if not np.any(include) or np.any(include & exclude):
        return None

    points = cv2.findNonZero(include.astype(np.uint8))
    if points is None:
        return None
    left, top, width, height = cv2.boundingRect(points)
    padding = max(12, round(min(image_rgb.shape[:2]) * 0.08))
    x0 = max(0, left - padding)
    y0 = max(0, top - padding)
    x1 = min(image_rgb.shape[1], left + width + padding)
    y1 = min(image_rgb.shape[0], top + height + padding)
    crop = image_rgb[y0:y1, x0:x1].copy()
    crop_include = include[y0:y1, x0:x1]
    crop_exclude = exclude[y0:y1, x0:x1]
    exclusion_radius = max(3, round(min(image_rgb.shape[:2]) * 0.04))
    exclude_zone = cv2.dilate(
        crop_exclude.astype(np.uint8),
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (exclusion_radius * 2 + 1, exclusion_radius * 2 + 1),
        ),
    ) > 0

    # Unmarked pixels inside the bounded crop are evidence-bearing and must
    # remain probable background rather than definite background. Only the
    # crop edge is treated as confidently known background.
    grabcut_mask = np.full(crop_include.shape, cv2.GC_PR_BGD, dtype=np.uint8)
    grabcut_mask[[0, -1], :] = cv2.GC_BGD
    grabcut_mask[:, [0, -1]] = cv2.GC_BGD
    foreground_support_radius = max(3, round(min(image_rgb.shape[:2]) * 0.015))
    foreground_support = cv2.dilate(
        crop_include.astype(np.uint8),
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (foreground_support_radius * 2 + 1, foreground_support_radius * 2 + 1),
        ),
    ) > 0
    grabcut_mask[foreground_support] = cv2.GC_PR_FGD
    grabcut_mask[crop_include] = cv2.GC_FGD
    grabcut_mask[exclude_zone] = cv2.GC_BGD
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            crop,
            grabcut_mask,
            None,
            background_model,
            foreground_model,
            10,
            cv2.GC_INIT_WITH_MASK,
        )
    except cv2.error:
        return None

    foreground = (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD)
    foreground[exclude_zone] = False
    _count, labels, stats, _centroids = cv2.connectedComponentsWithStats(foreground.astype(np.uint8), connectivity=8)
    selected = np.zeros_like(foreground)
    include_labels = set(np.unique(labels[crop_include]).tolist()) - {0}
    if not include_labels:
        return None
    for label in include_labels:
        selected[labels == label] = True
    if not np.any(selected):
        return None

    # Close only tiny gaps inside the maker-selected local region. This is a
    # proposal operation; it never touches the authoritative Cut Line mask.
    selected_u8 = cv2.morphologyEx(
        selected.astype(np.uint8) * 255,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    )
    selected = selected_u8 > 0
    selected[exclude_zone] = False
    if not np.any(selected):
        return None

    contours, _hierarchy = cv2.findContours(selected_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    detail = np.zeros_like(selected_u8)
    cv2.drawContours(detail, contours, -1, 255, 1)
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    source_edges = cv2.Canny(gray, 24, 72)
    detail = np.maximum(detail, np.where(selected, source_edges, 0).astype(np.uint8))
    detail[exclude_zone] = 0
    authoritative_crop = authoritative_mask[y0:y1, x0:x1].astype(np.uint8) * 255
    authoritative_inner = cv2.erode(
        authoritative_crop,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
    )
    authoritative_boundary = authoritative_crop > 0
    authoritative_boundary &= authoritative_inner == 0
    detail[authoritative_boundary] = 0
    if not np.any(detail):
        return None

    region_mask = np.zeros(authoritative_mask.shape, dtype=bool)
    detail_mask = np.zeros(authoritative_mask.shape, dtype=np.uint8)
    region_mask[y0:y1, x0:x1] = selected
    detail_mask[y0:y1, x0:x1] = detail
    return AccessoryDetailProposal(region_mask=region_mask, detail_mask=detail_mask)
