from __future__ import annotations

import base64
import io
import json
import os
import uuid
from dataclasses import dataclass
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError


OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits"
MODEL = "gpt-image-1.5"
PROVIDER = "openai"
QUALITY = "medium"
CONFIRMED_ESTIMATE_USD = 0.10
SUPPRESSION_BAND_PX = 24
MIN_INK_COVERAGE = 0.0005
MAX_INK_COVERAGE = 0.22
MAX_CUTLINE_CENTER_OFFSET_RATIO = 0.20

ValidationIssue = Literal[
    "malformed",
    "wrong-size",
    "blank",
    "dense",
    "noisy",
    "missing-cutline",
    "duplicate-contour",
    "misaligned",
]


class LineworkGenerationError(ValueError):
    pass


@dataclass(frozen=True)
class LineworkProposal:
    preview_png: bytes
    detail_png: bytes
    status: Literal["pending-review", "review-only"]
    validation_issues: tuple[ValidationIssue, ...]
    ink_coverage: float
    suppressed_pixel_count: int
    preview_size: tuple[int, int]
    provider_output_size: tuple[int, int] | None
    provider: str = PROVIDER
    model: str = MODEL
    estimated_cost_usd: float = CONFIRMED_ESTIMATE_USD

    @property
    def can_replace_accepted_detail(self) -> bool:
        # Ticket 01 produces proposals only. Applying a reviewed proposal is
        # intentionally owned by the later review/apply lifecycle.
        return False


def wood_transfer_prompt() -> str:
    return (
        "Create one sparse black-and-white wood-transfer linework proposal from this exact image. "
        "Preserve the complete foreground composition, including recognizable face, hair, clothing, "
        "limbs, hands, footwear, accessories, major foreground props, and major paint boundaries. "
        "Use one clean line per intended interior feature. Keep every retained feature in the same "
        "positions and scale as the source image. Do not omit a large foreground area or turn a major "
        "foreground prop into isolated decorative marks. Remove shading, texture, hatching, "
        "color, lettering, unrelated background decoration, and duplicate contours. Do not add or "
        "invent features. Do not draw an outside silhouette or any print, tiling, or calibration marks."
    )


def provider_output_size_for(source_size: tuple[int, int]) -> tuple[int, int]:
    width, height = source_size
    if width <= 0 or height <= 0:
        raise LineworkGenerationError("Source image dimensions must be positive.")
    return (1536, 1024) if width >= height else (1024, 1536)


def normalize_generated_proposal(
    generated_image: bytes,
    *,
    expected_generated_size: tuple[int, int],
    preview_size: tuple[int, int],
    protected_cutline_png: bytes,
) -> LineworkProposal:
    if preview_size[0] <= 0 or preview_size[1] <= 0:
        raise LineworkGenerationError("Preview dimensions must be positive.")

    issues: list[ValidationIssue] = []
    provider_output_size: tuple[int, int] | None = None
    try:
        generated = _open_composited_rgb(generated_image)
        provider_output_size = generated.size
        if generated.size != expected_generated_size:
            issues.append("wrong-size")
    except (OSError, UnidentifiedImageError, ValueError):
        issues.append("malformed")
        generated = Image.new("RGB", preview_size, "white")

    preview = generated.resize(preview_size, Image.Resampling.LANCZOS)
    gray = cv2.cvtColor(np.asarray(preview, dtype=np.uint8), cv2.COLOR_RGB2GRAY)
    raw_ink = (gray < 180).astype(np.uint8)
    raw_coverage = float(np.count_nonzero(raw_ink)) / float(raw_ink.size)

    component_count, component_labels, component_stats, _ = cv2.connectedComponentsWithStats(raw_ink, connectivity=8)
    small_component_pixels = 0
    for index in range(1, component_count):
        area = int(component_stats[index, cv2.CC_STAT_AREA])
        if area < 8:
            small_component_pixels += area
    if component_count - 1 > max(100, raw_ink.size // 100) or small_component_pixels > raw_ink.size * 0.01:
        issues.append("noisy")

    # Remove isolated provider specks before coverage and contour checks, but
    # preserve the noisy diagnostic calculated from the unmodified response.
    ink = cv2.medianBlur(raw_ink * 255, 3)
    component_count, component_labels, component_stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    for index in range(1, component_count):
        if component_stats[index, cv2.CC_STAT_AREA] < 8:
            ink[component_labels == index] = 0

    exterior_component = _largest_cutline_component(protected_cutline_png, preview_size)
    if exterior_component is None:
        issues.append("missing-cutline")
        distance_from_exterior = None
    else:
        distance_from_exterior = cv2.distanceTransform(255 - exterior_component, cv2.DIST_L2, 5)

    suppressed_pixel_count = 0
    if distance_from_exterior is not None:
        suppression_band = distance_from_exterior <= SUPPRESSION_BAND_PX
        suppressed_pixel_count = int(np.count_nonzero((ink > 0) & suppression_band))
        ink[suppression_band] = 0

        # A second contour just beyond the approved suppression band remains a
        # duplicate risk. Compare its occupied annulus against the silhouette
        # length so isolated nearby details do not trigger this gate.
        duplicate_annulus = (distance_from_exterior > SUPPRESSION_BAND_PX) & (
            distance_from_exterior <= SUPPRESSION_BAND_PX + 8
        )
        residual_near_exterior = int(np.count_nonzero((ink > 0) & duplicate_annulus))
        exterior_pixels = max(1, int(np.count_nonzero(exterior_component)))
        if residual_near_exterior / exterior_pixels >= 0.20:
            issues.append("duplicate-contour")

        ink_points = cv2.findNonZero(ink)
        exterior_points = cv2.findNonZero(exterior_component)
        if ink_points is not None and exterior_points is not None:
            ink_x, ink_y, ink_width, ink_height = cv2.boundingRect(ink_points)
            cut_x, cut_y, cut_width, cut_height = cv2.boundingRect(exterior_points)
            ink_center_x = ink_x + ink_width / 2
            ink_center_y = ink_y + ink_height / 2
            cut_center_x = cut_x + cut_width / 2
            cut_center_y = cut_y + cut_height / 2
            if (
                abs(ink_center_x - cut_center_x) / max(1, cut_width) > MAX_CUTLINE_CENTER_OFFSET_RATIO
                or abs(ink_center_y - cut_center_y) / max(1, cut_height) > MAX_CUTLINE_CENTER_OFFSET_RATIO
            ):
                issues.append("misaligned")

    coverage = float(np.count_nonzero(ink)) / float(ink.size)
    if coverage < MIN_INK_COVERAGE:
        issues.append("blank")
    if raw_coverage > 0.65 or coverage > MAX_INK_COVERAGE:
        issues.append("dense")

    ordered_issues = tuple(dict.fromkeys(issues))
    rgba = np.zeros((preview_size[1], preview_size[0], 4), dtype=np.uint8)
    rgba[:, :, 3] = ink
    detail_png = _png_bytes(Image.fromarray(rgba, mode="RGBA"))
    normalized_preview = np.full((preview_size[1], preview_size[0], 3), 255, dtype=np.uint8)
    normalized_preview[ink > 0] = 0
    return LineworkProposal(
        preview_png=_png_bytes(Image.fromarray(normalized_preview, mode="RGB")),
        detail_png=detail_png,
        status="review-only" if ordered_issues else "pending-review",
        validation_issues=ordered_issues,
        ink_coverage=coverage,
        suppressed_pixel_count=suppressed_pixel_count,
        preview_size=preview_size,
        provider_output_size=provider_output_size,
    )


def generate_linework_proposal(
    source_image: bytes,
    protected_cutline_png: bytes,
    *,
    preview_size: tuple[int, int],
    upload_confirmed: bool,
    confirmed_estimate_usd: float,
) -> LineworkProposal:
    if not upload_confirmed or confirmed_estimate_usd != CONFIRMED_ESTIMATE_USD:
        raise LineworkGenerationError(
            f"Confirm the source-image upload and exact ${CONFIRMED_ESTIMATE_USD:.2f} estimate before generating."
        )

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise LineworkGenerationError("AI linework is not configured. Your accepted Detail Lines are unchanged.")

    try:
        reference = _open_composited_rgb(source_image)
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise LineworkGenerationError("The source image could not be prepared for AI linework.") from exc
    reference_png = _png_bytes(reference)
    provider_size = provider_output_size_for(reference.size)
    body, content_type = _multipart_body(
        {
            "model": MODEL,
            "prompt": wood_transfer_prompt(),
            "quality": QUALITY,
            "size": f"{provider_size[0]}x{provider_size[1]}",
            "background": "opaque",
            "output_format": "png",
            "image": ("source.png", reference_png, "image/png"),
        }
    )
    request = Request(
        OPENAI_IMAGE_EDIT_URL,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": content_type},
        method="POST",
    )
    try:
        # Deliberately one transport call: ticket 01 permits no automatic retry.
        with urlopen(request, timeout=120) as response:  # nosec B310 - fixed provider URL
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise LineworkGenerationError("AI linework could not complete. Your accepted Detail Lines are unchanged.") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise LineworkGenerationError("AI linework could not complete. Your accepted Detail Lines are unchanged.") from exc

    generated = b""
    try:
        generated = base64.b64decode(payload["data"][0]["b64_json"], validate=True)
    except (KeyError, IndexError, TypeError, ValueError):
        # A malformed provider payload is retained as a deterministic
        # review-only result instead of triggering a second request.
        pass
    return normalize_generated_proposal(
        generated,
        expected_generated_size=provider_size,
        preview_size=preview_size,
        protected_cutline_png=protected_cutline_png,
    )


def _largest_cutline_component(cutline_png: bytes, preview_size: tuple[int, int]) -> np.ndarray | None:
    try:
        cutline = _open_composited_rgb(cutline_png).resize(preview_size, Image.Resampling.NEAREST)
    except (OSError, UnidentifiedImageError, ValueError):
        return None
    gray = cv2.cvtColor(np.asarray(cutline, dtype=np.uint8), cv2.COLOR_RGB2GRAY)
    mask = (gray < 200).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return None
    largest = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
    component = np.zeros(mask.shape, dtype=np.uint8)
    component[labels == largest] = 255
    return component


def _open_composited_rgb(payload: bytes) -> Image.Image:
    with Image.open(io.BytesIO(payload)) as image:
        rgba = image.convert("RGBA")
        white = Image.new("RGBA", rgba.size, "white")
        white.alpha_composite(rgba)
        return white.convert("RGB")


def _png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _multipart_body(fields: dict[str, str | tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = f"----cutout-studio-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        if isinstance(value, tuple):
            filename, data, mime_type = value
            chunks.append(
                (
                    f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                    f"Content-Type: {mime_type}\r\n\r\n"
                ).encode("utf-8")
            )
            chunks.append(data)
        else:
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}'.encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"
