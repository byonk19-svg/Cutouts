from __future__ import annotations

from dataclasses import dataclass
import math

import cv2
import numpy as np
from PIL import Image


# These values govern when Cutout Studio offers a review workflow. They are not
# woodworking safety recommendations.
DETECTION_REFERENCE_WIDTH_IN = 0.25
DETECTION_MIN_THIN_FRACTION = 0.35
DETECTION_MIN_RUN_IN = 2.0
PROPOSAL_MIN_WIDTH_IN = 0.25
PROPOSAL_INITIAL_WIDTH_IN = 0.50
PROPOSAL_MAX_WIDTH_IN = 0.75


@dataclass(frozen=True)
class ThinSilhouetteDiagnostic:
    detected: bool
    minimum_width_in: float
    p10_width_in: float
    thin_fraction: float
    longest_thin_run_in: float
    component_count: int

    def to_json(self) -> dict[str, object]:
        return {
            "detected": self.detected,
            "minimumWidthIn": round(self.minimum_width_in, 3),
            "p10WidthIn": round(self.p10_width_in, 3),
            "thinFraction": round(self.thin_fraction, 3),
            "longestThinRunIn": round(self.longest_thin_run_in, 3),
            "componentCount": self.component_count,
        }


@dataclass(frozen=True)
class ThinSilhouetteTopologyChange:
    components_before: int
    components_after: int
    holes_before: int
    holes_after: int
    components_joined: bool
    enclosed_regions_changed: bool
    gap_merge_warning: bool

    def to_json(self) -> dict[str, object]:
        return {
            "componentsBefore": self.components_before,
            "componentsAfter": self.components_after,
            "holesBefore": self.holes_before,
            "holesAfter": self.holes_after,
            "componentsJoined": self.components_joined,
            "enclosedRegionsChanged": self.enclosed_regions_changed,
            "gapMergeWarning": self.gap_merge_warning,
        }


@dataclass(frozen=True)
class ThinSilhouetteProposal:
    mask: np.ndarray
    outer_cut_path: str
    preview_width_px: int
    preview_height_px: int
    minimum_width_in: float
    diagnostic: ThinSilhouetteDiagnostic
    topology: ThinSilhouetteTopologyChange
    excluded_small_component_count: int


def measure_thin_silhouette(mask: Image.Image | np.ndarray, finished_height_in: float) -> ThinSilhouetteDiagnostic:
    binary = _binary_mask(mask)
    _validate_finished_height(finished_height_in)
    structural, _excluded = _structural_silhouette(binary)
    return _measure_structural_silhouette(structural, finished_height_in)


def propose_reinforced_silhouette(
    mask: Image.Image | np.ndarray,
    finished_height_in: float,
    minimum_width_in: float,
) -> ThinSilhouetteProposal:
    binary = _binary_mask(mask)
    _validate_finished_height(finished_height_in)
    if not math.isfinite(minimum_width_in) or not PROPOSAL_MIN_WIDTH_IN <= minimum_width_in <= PROPOSAL_MAX_WIDTH_IN:
        raise ValueError("Minimum finished width must be between 0.25 and 0.75 inches.")

    structural, excluded = _structural_silhouette(binary)
    before = _topology(structural)
    before_skeleton = _morphological_skeleton(structural)
    initial_diagnostic = _measure_structural_silhouette(structural, finished_height_in)

    if initial_diagnostic.detected:
        result = _reinforce_narrow_sections(structural, finished_height_in, minimum_width_in)
    else:
        result = binary.copy()

    after = _topology(result)
    if after[0] != 1:
        raise ValueError("A coherent single reinforced Cut Line could not be produced.")
    contour = _largest_external_contour(result)
    if contour is None or cv2.contourArea(contour) <= 0:
        raise ValueError("A valid reinforced outer Cut Line could not be produced.")

    result_diagnostic = _measure_structural_silhouette(result, finished_height_in)
    after_skeleton = _morphological_skeleton(result)
    before_length = max(1, int(np.count_nonzero(before_skeleton)))
    after_length_ratio = int(np.count_nonzero(after_skeleton)) / before_length
    added_fraction = np.count_nonzero((result > 0) & (structural == 0)) / max(1, np.count_nonzero(structural))
    components_joined = after[0] < before[0]
    enclosed_regions_changed = after[1] != before[1]
    gap_merge_warning = components_joined or enclosed_regions_changed or (after_length_ratio < 0.75 and added_fraction > 0.20)

    return ThinSilhouetteProposal(
        mask=result,
        outer_cut_path=_contour_to_svg_path(contour),
        preview_width_px=result.shape[1],
        preview_height_px=result.shape[0],
        minimum_width_in=minimum_width_in,
        diagnostic=result_diagnostic,
        topology=ThinSilhouetteTopologyChange(
            components_before=before[0],
            components_after=after[0],
            holes_before=before[1],
            holes_after=after[1],
            components_joined=components_joined,
            enclosed_regions_changed=enclosed_regions_changed,
            gap_merge_warning=gap_merge_warning,
        ),
        excluded_small_component_count=excluded,
    )


def _binary_mask(mask: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(mask, Image.Image):
        array = np.asarray(mask.convert("L"))
    else:
        array = np.asarray(mask)
    if array.ndim != 2 or array.size == 0:
        raise ValueError("Thin-silhouette geometry requires a non-empty two-dimensional mask.")
    binary = (array > 0).astype(np.uint8)
    if not np.any(binary):
        raise ValueError("Thin-silhouette geometry requires visible subject pixels.")
    return binary


def _validate_finished_height(finished_height_in: float) -> None:
    if not math.isfinite(finished_height_in) or finished_height_in <= 0:
        raise ValueError("Finished Height must be a positive finite number.")


def _structural_silhouette(mask: np.ndarray, minimum_relative_area: float = 0.25) -> tuple[np.ndarray, int]:
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        raise ValueError("No subject geometry was detected.")
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest = int(areas.max())
    selected = [index + 1 for index, area in enumerate(areas) if int(area) >= largest * minimum_relative_area]
    structural = np.zeros(mask.shape, dtype=np.uint8)
    for label in selected:
        structural[labels == label] = 1
    return structural, count - 1 - len(selected)


def _measure_structural_silhouette(mask: np.ndarray, finished_height_in: float) -> ThinSilhouetteDiagnostic:
    pixels_per_finished_inch = mask.shape[0] / finished_height_in
    skeleton = _morphological_skeleton(mask)
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    radii = distance[skeleton]
    if radii.size == 0:
        raise ValueError("A measurable structural silhouette could not be produced.")
    widths_in = np.maximum(1.0, radii * 2.0 - 1.0) / pixels_per_finished_inch
    thin = skeleton & ((np.maximum(1.0, distance * 2.0 - 1.0) / pixels_per_finished_inch) <= DETECTION_REFERENCE_WIDTH_IN)
    thin_count = int(np.count_nonzero(thin))
    skeleton_count = int(np.count_nonzero(skeleton))
    longest_thin_run_in = _largest_component_area(thin) / pixels_per_finished_inch
    component_count = _topology(mask)[0]
    thin_fraction = thin_count / max(1, skeleton_count)
    return ThinSilhouetteDiagnostic(
        detected=thin_fraction >= DETECTION_MIN_THIN_FRACTION and longest_thin_run_in >= DETECTION_MIN_RUN_IN,
        minimum_width_in=float(np.min(widths_in)),
        p10_width_in=float(np.percentile(widths_in, 10)),
        thin_fraction=thin_fraction,
        longest_thin_run_in=longest_thin_run_in,
        component_count=component_count,
    )


def _reinforce_narrow_sections(mask: np.ndarray, finished_height_in: float, minimum_width_in: float) -> np.ndarray:
    pixels_per_finished_inch = mask.shape[0] / finished_height_in
    target_radius_px = minimum_width_in * pixels_per_finished_inch / 2.0
    skeleton = _morphological_skeleton(mask)
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    seeds = (skeleton & (distance < target_radius_px)).astype(np.uint8)
    radius = max(1, int(round(target_radius_px)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    reinforced = cv2.dilate(seeds, kernel)
    return np.maximum(mask, reinforced).astype(np.uint8)


def _morphological_skeleton(mask: np.ndarray) -> np.ndarray:
    image = mask.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            p2 = np.roll(image, -1, axis=0)
            p3 = np.roll(p2, -1, axis=1)
            p4 = np.roll(image, -1, axis=1)
            p5 = np.roll(np.roll(image, 1, axis=0), -1, axis=1)
            p6 = np.roll(image, 1, axis=0)
            p7 = np.roll(p6, 1, axis=1)
            p8 = np.roll(image, 1, axis=1)
            p9 = np.roll(np.roll(image, -1, axis=0), 1, axis=1)
            neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            transitions = (
                ((p2 == 0) & (p3 == 1)).astype(np.uint8)
                + ((p3 == 0) & (p4 == 1)).astype(np.uint8)
                + ((p4 == 0) & (p5 == 1)).astype(np.uint8)
                + ((p5 == 0) & (p6 == 1)).astype(np.uint8)
                + ((p6 == 0) & (p7 == 1)).astype(np.uint8)
                + ((p7 == 0) & (p8 == 1)).astype(np.uint8)
                + ((p8 == 0) & (p9 == 1)).astype(np.uint8)
                + ((p9 == 0) & (p2 == 1)).astype(np.uint8)
            )
            if step == 0:
                triplet_a = p2 * p4 * p6
                triplet_b = p4 * p6 * p8
            else:
                triplet_a = p2 * p4 * p8
                triplet_b = p2 * p6 * p8
            remove = (
                (image == 1)
                & (neighbors >= 2)
                & (neighbors <= 6)
                & (transitions == 1)
                & (triplet_a == 0)
                & (triplet_b == 0)
            )
            remove[[0, -1], :] = False
            remove[:, [0, -1]] = False
            if np.any(remove):
                image[remove] = 0
                changed = True
        if not changed:
            return image > 0


def _topology(mask: np.ndarray) -> tuple[int, int]:
    component_count, _labels = cv2.connectedComponents(mask.astype(np.uint8), connectivity=8)
    _contours, hierarchy = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    holes = 0 if hierarchy is None else sum(1 for entry in hierarchy[0] if entry[3] >= 0)
    return max(0, component_count - 1), holes


def _largest_component_area(mask: np.ndarray) -> int:
    count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return 0
    return int(stats[1:, cv2.CC_STAT_AREA].max())


def _largest_external_contour(mask: np.ndarray) -> np.ndarray | None:
    contours, _hierarchy = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(contours, key=cv2.contourArea) if contours else None


def _contour_to_svg_path(contour: np.ndarray, simplify_px: float = 1.2) -> str:
    approximation = cv2.approxPolyDP(contour, max(0.6, simplify_px), True).reshape(-1, 2)
    if len(approximation) < 3:
        raise ValueError("A valid reinforced outer Cut Line requires at least three points.")
    commands = [f"M {approximation[0][0]:.3f} {approximation[0][1]:.3f}"]
    commands.extend(f"L {x:.3f} {y:.3f}" for x, y in approximation[1:])
    commands.append("Z")
    return " ".join(commands)
