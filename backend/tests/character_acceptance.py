from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageColor, ImageDraw
from pypdf import PdfReader


VALIDATOR_VERSION = "1"
_REQUESTED_TEMPLATE_STYLES = {"clean", "manual", "marker", "detailed", "cutOnly"}
_REQUESTED_COLOR_GUIDES = {"separate-page"}
_FEATURE_KINDS = {"featureLine", "paintRegion", "forbiddenRegion"}
_ASSERTION_TYPES = {"minimumInk", "maximumInk", "enclosedRegionCount"}
_ASSERTION_ARTIFACTS = {"acceptedDetail", "generatedDetail"}
_WORKFLOW_EVENT_KINDS = {"step-visible", "cleanup-action", "provider-log"}
_WORKFLOW_STEPS = {"Upload", "Clean Lines", "Colors", "Export"}
_CLEANUP_ACTIONS = {"remove-line", "add-missing-line"}
_PROVIDER_REQUEST_ENDPOINTS = {"/api/generate-linework"}
_FORBIDDEN_TRACE_MARKERS = (
    "Selection Inspector",
    "selectedStrokeId",
    "dimUnselected",
    "original-underlay",
    "reference-layer",
    "suggestion-layer",
)
_PROFILE_FIELDS = {
    "schemaVersion",
    "fixtureId",
    "label",
    "source",
    "requestedOutput",
    "features",
    "assertions",
    "workflowBudgets",
    "humanChecklist",
}
_SOURCE_FIELDS = {"path", "filename", "widthPx", "heightPx", "bytes", "sha256", "committable"}
_REQUESTED_OUTPUT_FIELDS = {
    "finishedHeightIn",
    "minimumTileCols",
    "minimumTileRows",
    "templateStyle",
    "colorGuide",
}
_FEATURE_FIELDS = {"id", "label", "kind", "locator"}
_LOCATOR_FIELDS = {"type", "x", "y", "width", "height"}
_ASSERTION_FIELDS = {
    "id",
    "label",
    "type",
    "artifact",
    "featureId",
    "minimumDarkPixels",
    "maximumDarkPixels",
    "minimumCount",
    "maximumCount",
    "minimumAreaPixels",
    "maximumAreaPixels",
}
_WORKFLOW_BUDGET_FIELDS = {"maxProviderRequests", "maxCleanupActions", "requiredCompletedSteps"}
_ARTIFACT_SET_FIELDS = {
    "schemaVersion",
    "artifactSetId",
    "sourceImage",
    "generatedDetailPng",
    "acceptedDetailPng",
    "svg",
    "pdf",
    "renderedTracePages",
    "workflowEvidence",
}
_WORKFLOW_EVIDENCE_FIELDS = {"events"}
_WORKFLOW_EVENT_FIELDS = {
    "step-visible": {"kind", "step", "evidence"},
    "cleanup-action": {"kind", "action", "evidence"},
    "provider-log": {"kind", "evidence"},
}
_WORKFLOW_STEP_EVIDENCE_FIELDS = {"screenshotPath", "screenshotSha256", "statePath", "stateSha256"}
_WORKFLOW_LOG_EVIDENCE_FIELDS = {"logPath", "logSha256"}
_STATE_SNAPSHOT_FIELDS = {
    "schemaVersion",
    "step",
    "visibleLabel",
    "heading",
    "primaryAction",
    "inputReadiness",
    "action",
    "outputs",
}
_STATE_OUTPUT_FIELDS = {"kind", "path", "sha256", "bytes"}
_STEP_MARKERS = {
    "Upload": {"visibleLabel": "Upload step", "primaryAction": "Generate Template"},
    "Clean Lines": {"visibleLabel": "Clean Lines workspace", "primaryAction": "Looks Good - Continue to Colors", "inputReadiness": "Ready line art"},
    "Colors": {"visibleLabel": "Colors workspace", "primaryAction": "Continue to Export"},
    "Export": {"visibleLabel": "Export workspace", "primaryAction": "Download Printable PDF"},
}


@dataclass(frozen=True)
class NormalizedRect:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class ProfileSource:
    path: Path
    filename: str
    width_px: int
    height_px: int
    bytes: int
    sha256: str
    committable: bool


@dataclass(frozen=True)
class RequestedOutput:
    finished_height_in: float
    minimum_tile_cols: int
    minimum_tile_rows: int
    template_style: str
    color_guide: str


@dataclass(frozen=True)
class Feature:
    id: str
    label: str
    kind: str
    locator: NormalizedRect


@dataclass(frozen=True)
class Assertion:
    id: str
    label: str
    type: str
    artifact: str
    feature_id: str
    minimum_dark_pixels: int | None = None
    maximum_dark_pixels: int | None = None
    minimum_count: int | None = None
    maximum_count: int | None = None
    minimum_area_pixels: int | None = None
    maximum_area_pixels: int | None = None


@dataclass(frozen=True)
class WorkflowBudgets:
    max_provider_requests: int
    max_cleanup_actions: int
    required_completed_steps: tuple[str, ...]


@dataclass(frozen=True)
class CharacterAcceptanceProfile:
    path: Path
    schema_version: int
    fixture_id: str
    label: str
    source: ProfileSource
    requested_output: RequestedOutput
    features: dict[str, Feature]
    assertions: tuple[Assertion, ...]
    workflow_budgets: WorkflowBudgets
    human_checklist: tuple[str, ...]


@dataclass(frozen=True)
class WorkflowEvent:
    kind: str
    step: str | None = None
    action: str | None = None
    evidence: "WorkflowArtifactEvidence | None" = None


@dataclass(frozen=True)
class ArtifactWorkflowEvidence:
    events: tuple[WorkflowEvent, ...]


@dataclass(frozen=True)
class WorkflowArtifactEvidence:
    screenshot_path: Path | None = None
    screenshot_sha256: str | None = None
    state_path: Path | None = None
    state_sha256: str | None = None
    log_path: Path | None = None
    log_sha256: str | None = None


@dataclass(frozen=True)
class ArtifactSet:
    base_path: Path
    artifact_set_id: str
    source_image: Path
    generated_detail_png: Path | None
    accepted_detail_png: Path | None
    svg: Path | None
    pdf: Path | None
    rendered_trace_pages: tuple[Path, ...]
    workflow_evidence: ArtifactWorkflowEvidence


def load_character_acceptance_profile(profile_path: Path | str) -> CharacterAcceptanceProfile:
    path = Path(profile_path).resolve()
    payload = json.loads(path.read_text(encoding="utf-8"))
    _require_fields(payload, _PROFILE_FIELDS, "profile")
    schema_version = _expect_int(payload.get("schemaVersion"), "profile.schemaVersion")
    if schema_version != 1:
        raise ValueError(f"Unsupported profile schemaVersion: {schema_version}")

    source_payload = _expect_mapping(payload.get("source"), "profile.source")
    _require_fields(source_payload, _SOURCE_FIELDS, "profile.source")
    source_path = _resolve_path(path.parent, _expect_str(source_payload.get("path"), "profile.source.path"))
    source = ProfileSource(
        path=source_path,
        filename=_expect_str(source_payload.get("filename"), "profile.source.filename"),
        width_px=_expect_int(source_payload.get("widthPx"), "profile.source.widthPx"),
        height_px=_expect_int(source_payload.get("heightPx"), "profile.source.heightPx"),
        bytes=_expect_int(source_payload.get("bytes"), "profile.source.bytes"),
        sha256=_expect_str(source_payload.get("sha256"), "profile.source.sha256").upper(),
        committable=_expect_bool(source_payload.get("committable"), "profile.source.committable"),
    )

    requested_output_payload = _expect_mapping(payload.get("requestedOutput"), "profile.requestedOutput")
    _require_fields(requested_output_payload, _REQUESTED_OUTPUT_FIELDS, "profile.requestedOutput")
    requested_output = RequestedOutput(
        finished_height_in=_expect_float(
            requested_output_payload.get("finishedHeightIn"),
            "profile.requestedOutput.finishedHeightIn",
        ),
        minimum_tile_cols=_expect_int(
            requested_output_payload.get("minimumTileCols"),
            "profile.requestedOutput.minimumTileCols",
        ),
        minimum_tile_rows=_expect_int(
            requested_output_payload.get("minimumTileRows"),
            "profile.requestedOutput.minimumTileRows",
        ),
        template_style=_expect_str(
            requested_output_payload.get("templateStyle"),
            "profile.requestedOutput.templateStyle",
        ),
        color_guide=_expect_str(
            requested_output_payload.get("colorGuide"),
            "profile.requestedOutput.colorGuide",
        ),
    )
    if requested_output.template_style not in _REQUESTED_TEMPLATE_STYLES:
        raise ValueError(f"Unknown requested output templateStyle: {requested_output.template_style}")
    if requested_output.color_guide not in _REQUESTED_COLOR_GUIDES:
        raise ValueError(f"Unknown requested output colorGuide: {requested_output.color_guide}")

    feature_payloads = _expect_list(payload.get("features"), "profile.features")
    features: dict[str, Feature] = {}
    for feature_payload in feature_payloads:
        mapping = _expect_mapping(feature_payload, "profile.features[]")
        _require_fields(mapping, _FEATURE_FIELDS, "profile.features[]")
        locator_payload = _expect_mapping(mapping.get("locator"), f"feature {mapping.get('id')}.locator")
        _require_fields(locator_payload, _LOCATOR_FIELDS, f"feature {mapping.get('id')}.locator")
        if _expect_str(locator_payload.get("type"), f"feature {mapping.get('id')}.locator.type") != "rect":
            raise ValueError("Unsupported locator type")
        locator = NormalizedRect(
            x=_expect_normalized(locator_payload.get("x"), f"feature {mapping.get('id')}.locator.x"),
            y=_expect_normalized(locator_payload.get("y"), f"feature {mapping.get('id')}.locator.y"),
            width=_expect_normalized(locator_payload.get("width"), f"feature {mapping.get('id')}.locator.width"),
            height=_expect_normalized(locator_payload.get("height"), f"feature {mapping.get('id')}.locator.height"),
        )
        if locator.x + locator.width > 1 or locator.y + locator.height > 1:
            raise ValueError(f"Feature {mapping.get('id')} locator exceeds normalized bounds")
        feature = Feature(
            id=_expect_str(mapping.get("id"), "profile.features[].id"),
            label=_expect_str(mapping.get("label"), "profile.features[].label"),
            kind=_expect_str(mapping.get("kind"), "profile.features[].kind"),
            locator=locator,
        )
        if feature.kind not in _FEATURE_KINDS:
            raise ValueError(f"Unknown feature kind: {feature.kind}")
        if feature.id in features:
            raise ValueError(f"Duplicate feature id: {feature.id}")
        features[feature.id] = feature

    assertion_payloads = _expect_list(payload.get("assertions"), "profile.assertions")
    assertions: list[Assertion] = []
    for assertion_payload in assertion_payloads:
        mapping = _expect_mapping(assertion_payload, "profile.assertions[]")
        _require_fields(mapping, _ASSERTION_FIELDS, "profile.assertions[]", allow_missing=True)
        assertion_type = _expect_str(mapping.get("type"), "profile.assertions[].type")
        if assertion_type not in _ASSERTION_TYPES:
            raise ValueError(f"Unknown assertion type: {assertion_type}")
        feature_id = _expect_str(mapping.get("featureId"), "profile.assertions[].featureId")
        if feature_id not in features:
            raise ValueError(f"Unknown feature id in assertion: {feature_id}")
        assertion = Assertion(
            id=_expect_str(mapping.get("id"), "profile.assertions[].id"),
            label=_expect_str(mapping.get("label"), "profile.assertions[].label"),
            type=assertion_type,
            artifact=_expect_str(mapping.get("artifact"), "profile.assertions[].artifact"),
            feature_id=feature_id,
            minimum_dark_pixels=_optional_int(mapping.get("minimumDarkPixels"), "profile.assertions[].minimumDarkPixels"),
            maximum_dark_pixels=_optional_int(mapping.get("maximumDarkPixels"), "profile.assertions[].maximumDarkPixels"),
            minimum_count=_optional_int(mapping.get("minimumCount"), "profile.assertions[].minimumCount"),
            maximum_count=_optional_int(mapping.get("maximumCount"), "profile.assertions[].maximumCount"),
            minimum_area_pixels=_optional_int(mapping.get("minimumAreaPixels"), "profile.assertions[].minimumAreaPixels"),
            maximum_area_pixels=_optional_int(mapping.get("maximumAreaPixels"), "profile.assertions[].maximumAreaPixels"),
        )
        if assertion.artifact not in _ASSERTION_ARTIFACTS:
            raise ValueError(f"Unknown assertion artifact: {assertion.artifact}")
        _validate_assertion_contract(assertion)
        assertions.append(assertion)

    workflow_payload = _expect_mapping(payload.get("workflowBudgets"), "profile.workflowBudgets")
    _require_fields(workflow_payload, _WORKFLOW_BUDGET_FIELDS, "profile.workflowBudgets")
    workflow_budgets = WorkflowBudgets(
        max_provider_requests=_expect_int(
            workflow_payload.get("maxProviderRequests"),
            "profile.workflowBudgets.maxProviderRequests",
        ),
        max_cleanup_actions=_expect_int(
            workflow_payload.get("maxCleanupActions"),
            "profile.workflowBudgets.maxCleanupActions",
        ),
        required_completed_steps=tuple(
            _expect_str(step, "profile.workflowBudgets.requiredCompletedSteps[]")
            for step in _expect_list(
                workflow_payload.get("requiredCompletedSteps"),
                "profile.workflowBudgets.requiredCompletedSteps",
            )
        ),
    )

    human_checklist = tuple(
        _expect_str(item, "profile.humanChecklist[]")
        for item in _expect_list(payload.get("humanChecklist"), "profile.humanChecklist")
    )

    return CharacterAcceptanceProfile(
        path=path,
        schema_version=schema_version,
        fixture_id=_expect_str(payload.get("fixtureId"), "profile.fixtureId"),
        label=_expect_str(payload.get("label"), "profile.label"),
        source=source,
        requested_output=requested_output,
        features=features,
        assertions=tuple(assertions),
        workflow_budgets=workflow_budgets,
        human_checklist=human_checklist,
    )


def build_artifact_set(payload: dict[str, Any], base_path: Path | str) -> ArtifactSet:
    mapping = _expect_mapping(payload, "artifactSet")
    _require_fields(mapping, _ARTIFACT_SET_FIELDS, "artifactSet", allow_missing=True)
    schema_version = _expect_int(mapping.get("schemaVersion"), "artifactSet.schemaVersion")
    if schema_version != 1:
        raise ValueError(f"Unsupported artifact set schemaVersion: {schema_version}")
    root = Path(base_path).resolve()
    workflow_evidence = _parse_workflow_evidence(mapping.get("workflowEvidence"), "artifactSet.workflowEvidence")
    return ArtifactSet(
        base_path=root,
        artifact_set_id=_expect_str(mapping.get("artifactSetId"), "artifactSet.artifactSetId"),
        source_image=_resolve_path(root, _expect_str(mapping.get("sourceImage"), "artifactSet.sourceImage")),
        generated_detail_png=_optional_path(root, mapping.get("generatedDetailPng"), "artifactSet.generatedDetailPng"),
        accepted_detail_png=_optional_path(root, mapping.get("acceptedDetailPng"), "artifactSet.acceptedDetailPng"),
        svg=_optional_path(root, mapping.get("svg"), "artifactSet.svg"),
        pdf=_optional_path(root, mapping.get("pdf"), "artifactSet.pdf"),
        rendered_trace_pages=tuple(
            _resolve_path(root, _expect_str(path, "artifactSet.renderedTracePages[]"))
            for path in _expect_optional_list(mapping.get("renderedTracePages"), "artifactSet.renderedTracePages")
        ),
        workflow_evidence=workflow_evidence,
    )


def validate_character_acceptance(
    profile: CharacterAcceptanceProfile,
    artifact_set: ArtifactSet,
    overlay_path: Path | str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "profileVersion": profile.schema_version,
        "validatorVersion": VALIDATOR_VERSION,
        "fixtureId": profile.fixture_id,
        "artifactSetId": artifact_set.artifact_set_id,
        "sourceIdentity": _validate_source_identity(profile, artifact_set.source_image),
        "baseline": [],
        "workflowChecks": [],
        "assertions": [],
        "humanAcceptance": {
            "status": "pending",
            "checklist": list(profile.human_checklist),
        },
        "diagnostics": [],
    }
    observations: dict[str, Any] = {}
    source_identity = result["sourceIdentity"]
    source_image = _safe_load_source_image(artifact_set.source_image, source_identity)
    analysis = _build_reference_analysis(profile)
    outer_line_image = (
        Image.open(io.BytesIO(analysis.outer_line_png)).convert("RGBA")
        if analysis is not None
        else None
    )

    accepted_detail, accepted_detail_error = _safe_load_optional_image(artifact_set.accepted_detail_png, "Accepted detail")
    generated_detail, generated_detail_error = _safe_load_optional_image(artifact_set.generated_detail_png, "Generated detail")
    svg_inspection, svg_error = _safe_inspect_svg(artifact_set.svg)
    pdf_inspection, pdf_error = _safe_inspect_pdf(artifact_set.pdf, artifact_set.rendered_trace_pages)
    observations["artifacts"] = {
        "sourceImage": str(artifact_set.source_image),
        "generatedDetailPng": str(artifact_set.generated_detail_png) if artifact_set.generated_detail_png else None,
        "acceptedDetailPng": str(artifact_set.accepted_detail_png) if artifact_set.accepted_detail_png else None,
        "svg": str(artifact_set.svg) if artifact_set.svg else None,
        "pdf": str(artifact_set.pdf) if artifact_set.pdf else None,
    }
    observations["artifactErrors"] = {
        "acceptedDetailPng": accepted_detail_error,
        "generatedDetailPng": generated_detail_error,
        "svg": svg_error,
        "pdf": pdf_error,
    }
    observations["svgInspection"] = svg_inspection
    observations["pdfInspection"] = pdf_inspection
    observations["analysis"] = (
        {
            "subjectBoundsPx": list(analysis.subject_bounds_px),
            "previewWidthPx": analysis.preview_width_px,
            "previewHeightPx": analysis.preview_height_px,
            "finishedWidthIn": analysis.finished_width_in,
            "finishedHeightIn": analysis.finished_height_in,
            "tileCols": analysis.tile_cols,
            "tileRows": analysis.tile_rows,
        }
        if analysis is not None
        else None
    )
    result["observations"] = observations

    workflow_validation = _validate_and_derive_workflow_evidence(artifact_set)
    workflow_summary = workflow_validation["summary"]
    observations["workflowEvidence"] = {
        "events": [_workflow_event_observation(event) for event in artifact_set.workflow_evidence.events],
        "derivedSummary": workflow_summary,
    }
    result["workflowChecks"] = workflow_validation["checks"] + _validate_workflow_budgets(profile, workflow_summary)
    result["baseline"] = _validate_baseline(svg_inspection, pdf_inspection, svg_error=svg_error, pdf_error=pdf_error)

    failing_regions: list[tuple[Feature, str]] = []
    for assertion in profile.assertions:
        feature = profile.features[assertion.feature_id]
        target_image = _artifact_image_for_assertion(
            assertion,
            accepted_detail=accepted_detail,
            accepted_detail_error=accepted_detail_error,
            generated_detail=generated_detail,
            generated_detail_error=generated_detail_error,
            svg_inspection=svg_inspection,
        )
        if isinstance(target_image, dict):
            entry = _assertion_entry(assertion, "errored", target_image["message"], feature)
            result["assertions"].append(entry)
            result["diagnostics"].append(entry)
            failing_regions.append((feature, entry["status"]))
            continue

        if source_image is None:
            status, message = ("errored", "Artifact Set source image could not be opened for assertion mapping.")
        else:
            status, message = _evaluate_assertion(
                assertion,
                feature,
                source_image_size=source_image.size,
                subject_bounds=analysis.subject_bounds_px if analysis is not None else None,
                target_image=target_image,
                outer_line_image=outer_line_image,
            )
        entry = _assertion_entry(assertion, status, message, feature)
        result["assertions"].append(entry)
        if status != "passed":
            result["diagnostics"].append(entry)
            failing_regions.append((feature, status))

    if overlay_path is not None and failing_regions and source_image is not None:
        _write_overlay(source_image, failing_regions, Path(overlay_path))
        result["diagnosticOverlay"] = str(Path(overlay_path))

    result["overallStatus"] = _overall_status(result)
    return result


def inspect_trace_linework_svg(svg_path: Path | str) -> dict[str, Any]:
    path = Path(svg_path)
    svg = path.read_text(encoding="utf-8")
    accepted_layer_match = re.search(
        r'<image[^>]*id="accepted-detail-layer"[^>]*href="([^"]+)"',
        svg,
    )
    return {
        "path": str(path),
        "cutlineLayerCount": len(re.findall(r'id="cutline-layer"', svg)),
        "acceptedDetailLayerCount": len(re.findall(r'id="accepted-detail-layer"', svg)),
        "hasViewBox": bool(re.search(r'viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"', svg)),
        "hasOriginalUnderlay": "original-underlay" in svg or 'id="reference-layer"' in svg,
        "hasTransientEditorState": any(
            token in svg
            for token in ("selectedStrokeId", "dimUnselected", "Selection Inspector")
        ),
        "acceptedDetailDataUrl": accepted_layer_match.group(1) if accepted_layer_match else None,
    }


def inspect_template_packet_pdf(
    pdf_path: Path | str,
    rendered_trace_pages: list[Path | str] | tuple[Path | str, ...] | None = None,
) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    cover_text = reader.pages[0].extract_text() or ""
    grid_match = re.search(r"Trace pages: (\d+) columns x (\d+) rows", cover_text)
    if grid_match is None:
        raise ValueError("The packet cover does not declare its tile grid.")
    tile_cols, tile_rows = (int(value) for value in grid_match.groups())
    trace_page_count = tile_cols * tile_rows
    if len(reader.pages) < trace_page_count + 1:
        raise ValueError("The packet does not include all declared trace pages.")
    trace_pages = reader.pages[-trace_page_count:]
    trace_page_images = [[image.image.convert("RGB") for image in page.images] for page in trace_pages]
    trace_image_counts = [len(images) for images in trace_page_images]
    primary_trace_images = [_largest_image(images) for images in trace_page_images]

    from backend.cutout_studio.pipeline import OVERLAP_IN, PRINT_DPI

    overlap_px = round(OVERLAP_IN * PRINT_DPI)
    horizontal_matches = []
    for row in range(tile_rows):
        for col in range(tile_cols - 1):
            left = primary_trace_images[row * tile_cols + col]
            right = primary_trace_images[row * tile_cols + col + 1]
            if left is None or right is None:
                horizontal_matches.append(False)
                continue
            common_height = min(left.height, right.height)
            horizontal_matches.append(
                left.crop((left.width - overlap_px, 0, left.width, common_height)).tobytes()
                == right.crop((0, 0, overlap_px, common_height)).tobytes()
            )
    vertical_matches = []
    for row in range(tile_rows - 1):
        for col in range(tile_cols):
            upper = primary_trace_images[row * tile_cols + col]
            lower = primary_trace_images[(row + 1) * tile_cols + col]
            if upper is None or lower is None:
                vertical_matches.append(False)
                continue
            common_width = min(upper.width, lower.width)
            vertical_matches.append(
                upper.crop((0, upper.height - overlap_px, common_width, upper.height)).tobytes()
                == lower.crop((0, 0, common_width, overlap_px)).tobytes()
            )

    cover_stream = reader.pages[0].get_contents()
    cover_data = cover_stream.get_data().decode("latin-1", errors="ignore") if cover_stream is not None else ""
    media_boxes = [[float(value) for value in page.mediabox] for page in reader.pages]
    all_embedded_trace_images_monochrome = all(
        all(all(red == green == blue for red, green, blue in image.get_flattened_data()) for image in images)
        for images in trace_page_images
    )
    rendered_paths = [Path(path) for path in rendered_trace_pages or []]
    rendered_trace_pages_monochrome = all(_image_is_monochrome(Image.open(path).convert("RGB")) for path in rendered_paths)
    forbidden_markers = _pdf_forbidden_markers(reader)
    return {
        "path": str(pdf_path),
        "pageCount": len(reader.pages),
        "tracePageCount": trace_page_count,
        "tileGrid": {"columns": tile_cols, "rows": tile_rows},
        "traceImageCounts": trace_image_counts,
        "allTracePagesSingleRaster": all(count == 1 for count in trace_image_counts),
        "allTracePagesLetter": all(box == [0.0, 0.0, 612.0, 792.0] for box in media_boxes[-trace_page_count:]),
        "allEmbeddedTraceImagesMonochrome": all_embedded_trace_images_monochrome,
        "traceBlackAndWhite": all_embedded_trace_images_monochrome,
        "calibrationSquarePoints": 72 if "n 40 25.2 72 72 re S" in cover_data else None,
        "allOverlapsMatch": all(horizontal_matches) and all(vertical_matches),
        "renderedTracePageCountMatches": not rendered_paths or len(rendered_paths) == trace_page_count,
        "renderedTracePagesMonochrome": rendered_trace_pages_monochrome,
        "forbiddenMarkers": forbidden_markers,
    }


def _validate_source_identity(profile: CharacterAcceptanceProfile, artifact_source_path: Path) -> dict[str, Any]:
    try:
        source_bytes = artifact_source_path.read_bytes()
    except FileNotFoundError:
        return {"status": "errored", "message": f"Missing Artifact Set source image: {artifact_source_path}"}
    if len(source_bytes) != profile.source.bytes:
        return {
            "status": "errored",
            "message": (
                "Artifact Set source byte-size mismatch: "
                f"expected {profile.source.bytes}, observed {len(source_bytes)} at {artifact_source_path}"
            ),
        }
    try:
        with Image.open(io.BytesIO(source_bytes)) as image:
            if image.size != (profile.source.width_px, profile.source.height_px):
                return {
                    "status": "errored",
                    "message": (
                        "Artifact Set source dimension mismatch: "
                        f"expected {profile.source.width_px}x{profile.source.height_px}, "
                        f"observed {image.width}x{image.height} at {artifact_source_path}"
                    ),
                }
    except Exception as exc:
        return {
            "status": "errored",
            "message": f"Artifact Set source image could not be opened at {artifact_source_path}: {exc}",
        }
    sha256 = hashlib.sha256(source_bytes).hexdigest().upper()
    if sha256 != profile.source.sha256:
        return {
            "status": "errored",
            "message": (
                "Artifact Set source SHA-256 mismatch: "
                f"expected {profile.source.sha256}, observed {sha256} at {artifact_source_path}"
            ),
        }
    return {"status": "passed", "message": f"Artifact Set source identity verified for {artifact_source_path}."}


def _validate_workflow_budgets(
    profile: CharacterAcceptanceProfile,
    workflow: dict[str, Any],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    entries.append({
        "id": "workflow-provider-requests",
        "label": "Provider requests stay within budget",
        "status": "passed" if workflow["providerRequests"] <= profile.workflow_budgets.max_provider_requests else "failed",
        "message": (
            f"Observed {workflow['providerRequests']} provider requests; "
            f"budget allows {profile.workflow_budgets.max_provider_requests}."
        ),
    })
    entries.append({
        "id": "workflow-cleanup-actions",
        "label": "Cleanup actions stay within budget",
        "status": "passed" if workflow["cleanupActionCount"] <= profile.workflow_budgets.max_cleanup_actions else "failed",
        "message": (
            f"Observed {workflow['cleanupActionCount']} cleanup actions; "
            f"budget allows {profile.workflow_budgets.max_cleanup_actions}."
        ),
    })
    missing_steps = [
        step
        for step in profile.workflow_budgets.required_completed_steps
        if step not in workflow["completedSteps"]
    ]
    entries.append({
        "id": "workflow-required-steps",
        "label": "Required workflow steps completed",
        "status": "passed" if not missing_steps else "failed",
        "message": "All required steps completed." if not missing_steps else f"Missing steps: {', '.join(missing_steps)}",
    })
    return entries


def _validate_baseline(
    svg_inspection: dict[str, Any] | None,
    pdf_inspection: dict[str, Any] | None,
    *,
    svg_error: str | None = None,
    pdf_error: str | None = None,
) -> list[dict[str, Any]]:
    baseline: list[dict[str, Any]] = []
    if svg_error is not None:
        baseline.append({
            "id": "baseline-svg-inspection",
            "label": "SVG artifact inspection completed",
            "status": "errored",
            "message": svg_error,
        })
    if svg_inspection is not None:
        baseline.extend([
            {
                "id": "baseline-single-cutline",
                "label": "Exactly one authoritative Cut Line exists",
                "status": "passed" if svg_inspection["cutlineLayerCount"] == 1 else "failed",
                "message": f"Observed {svg_inspection['cutlineLayerCount']} cutline layers.",
            },
            {
                "id": "baseline-accepted-detail-layer",
                "label": "Accepted detail layer is present in SVG export",
                "status": "passed" if svg_inspection["acceptedDetailLayerCount"] == 1 else "failed",
                "message": f"Observed {svg_inspection['acceptedDetailLayerCount']} accepted detail layers.",
            },
            {
                "id": "baseline-no-underlay-or-transient-svg-state",
                "label": "SVG excludes original underlays and transient editor state",
                "status": "passed" if not svg_inspection["hasOriginalUnderlay"] and not svg_inspection["hasTransientEditorState"] else "failed",
                "message": (
                    f"Original underlay present: {svg_inspection['hasOriginalUnderlay']}; "
                    f"transient editor state present: {svg_inspection['hasTransientEditorState']}."
                ),
            },
        ])
    if pdf_error is not None:
        baseline.append({
            "id": "baseline-pdf-inspection",
            "label": "PDF artifact inspection completed",
            "status": "errored",
            "message": pdf_error,
        })
    if pdf_inspection is not None:
        baseline.extend([
            {
                "id": "baseline-trace-pages-letter",
                "label": "Trace pages stay on US-letter media",
                "status": "passed" if pdf_inspection["allTracePagesLetter"] else "failed",
                "message": "All trace pages use US-letter media." if pdf_inspection["allTracePagesLetter"] else "Trace pages changed media size.",
            },
            {
                "id": "baseline-single-trace-raster-per-page",
                "label": "Each trace page contains exactly one expected trace raster",
                "status": "passed" if pdf_inspection["allTracePagesSingleRaster"] else "failed",
                "message": (
                    "Every trace page contained exactly one raster."
                    if pdf_inspection["allTracePagesSingleRaster"]
                    else f"Trace page image counts were {pdf_inspection['traceImageCounts']}."
                ),
            },
            {
                "id": "baseline-trace-pages-monochrome",
                "label": "Trace pages remain black-and-white",
                "status": "passed" if pdf_inspection["allEmbeddedTraceImagesMonochrome"] else "failed",
                "message": (
                    "All embedded trace rasters remained monochrome."
                    if pdf_inspection["allEmbeddedTraceImagesMonochrome"]
                    else "At least one embedded trace raster included non-monochrome pixels."
                ),
            },
            {
                "id": "baseline-trace-overlaps-match",
                "label": "Adjacent trace-page overlaps stay continuous",
                "status": "passed" if pdf_inspection["allOverlapsMatch"] else "failed",
                "message": "All overlap strips match." if pdf_inspection["allOverlapsMatch"] else "At least one overlap strip does not match.",
            },
            {
                "id": "baseline-rendered-trace-pages-monochrome",
                "label": "Rendered trace pages remain monochrome",
                "status": "passed" if pdf_inspection["renderedTracePagesMonochrome"] else "failed",
                "message": (
                    "Rendered trace pages remained monochrome."
                    if pdf_inspection["renderedTracePagesMonochrome"]
                    else "Rendered trace page evidence included non-monochrome pixels."
                ),
            },
            {
                "id": "baseline-rendered-trace-page-count",
                "label": "Rendered trace page evidence matches the tile count",
                "status": "passed" if pdf_inspection["renderedTracePageCountMatches"] else "failed",
                "message": (
                    "Rendered trace page count matched the tile count."
                    if pdf_inspection["renderedTracePageCountMatches"]
                    else "Rendered trace page evidence count did not match the tile count."
                ),
            },
            {
                "id": "baseline-no-forbidden-trace-markers",
                "label": "Trace output excludes source and transient editor markers",
                "status": "passed" if not pdf_inspection["forbiddenMarkers"] else "failed",
                "message": (
                    "No forbidden trace markers were found."
                    if not pdf_inspection["forbiddenMarkers"]
                    else f"Forbidden markers found: {', '.join(pdf_inspection['forbiddenMarkers'])}."
                ),
            },
        ])
    return baseline


def _artifact_image_for_assertion(
    assertion: Assertion,
    *,
    accepted_detail: Image.Image | None,
    accepted_detail_error: str | None,
    generated_detail: Image.Image | None,
    generated_detail_error: str | None,
    svg_inspection: dict[str, Any] | None,
) -> Image.Image | dict[str, str]:
    if assertion.artifact == "acceptedDetail":
        if accepted_detail_error is not None:
            return {"message": accepted_detail_error}
        if accepted_detail is not None:
            return accepted_detail
        if svg_inspection and svg_inspection.get("acceptedDetailDataUrl"):
            return _decode_data_url_image(svg_inspection["acceptedDetailDataUrl"])
        return {"message": "Accepted detail artifact is missing."}
    if assertion.artifact == "generatedDetail":
        if generated_detail_error is not None:
            return {"message": generated_detail_error}
        if generated_detail is None:
            return {"message": "Generated detail artifact is missing."}
        return generated_detail
    return {"message": f"Unsupported assertion artifact target: {assertion.artifact}"}


def _evaluate_assertion(
    assertion: Assertion,
    feature: Feature,
    *,
    source_image_size: tuple[int, int],
    subject_bounds: tuple[int, int, int, int] | None,
    target_image: Image.Image,
    outer_line_image: Image.Image | None,
) -> tuple[str, str]:
    x1, y1, x2, y2 = _feature_box(feature.locator, source_image_size, subject_bounds, target_image.size)
    region = target_image.crop((x1, y1, x2, y2))
    ink_mask = _ink_mask(region)
    dark_pixels = int(np.count_nonzero(ink_mask))

    if assertion.type == "minimumInk":
        assert assertion.minimum_dark_pixels is not None
        if dark_pixels >= assertion.minimum_dark_pixels:
            return "passed", f"Observed {dark_pixels} dark pixels; minimum is {assertion.minimum_dark_pixels}."
        return "failed", f"Observed {dark_pixels} dark pixels; minimum is {assertion.minimum_dark_pixels}."

    if assertion.type == "maximumInk":
        assert assertion.maximum_dark_pixels is not None
        if dark_pixels <= assertion.maximum_dark_pixels:
            return "passed", f"Observed {dark_pixels} dark pixels; maximum is {assertion.maximum_dark_pixels}."
        return "failed", f"Observed {dark_pixels} dark pixels; maximum is {assertion.maximum_dark_pixels}."

    assert assertion.minimum_count is not None and assertion.maximum_count is not None
    full_mask = _ink_mask(target_image)
    if outer_line_image is not None:
        outer_mask = _ink_mask(outer_line_image.resize(target_image.size, Image.Resampling.NEAREST))
        full_mask = np.maximum(full_mask.astype(np.uint8), outer_mask.astype(np.uint8)).astype(bool)
    open_space = (~full_mask).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(open_space, connectivity=4)
    enclosed_count = 0
    min_area = assertion.minimum_area_pixels or 1
    max_area = assertion.maximum_area_pixels or (target_image.width * target_image.height)
    for label in range(1, count):
        left = stats[label, cv2.CC_STAT_LEFT]
        top = stats[label, cv2.CC_STAT_TOP]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]
        area = stats[label, cv2.CC_STAT_AREA]
        centroid_x, centroid_y = centroids[label]
        if not (x1 <= centroid_x <= x2 and y1 <= centroid_y <= y2):
            continue
        touches_border = (
            left == 0
            or top == 0
            or left + width >= target_image.width
            or top + height >= target_image.height
        )
        if touches_border:
            continue
        if min_area <= area <= max_area:
            enclosed_count += 1
    if assertion.minimum_count <= enclosed_count <= assertion.maximum_count:
        return (
            "passed",
            f"Observed {enclosed_count} enclosed regions within {min_area}-{max_area} pixels.",
        )
    return (
        "failed",
        f"Observed {enclosed_count} enclosed regions; expected between {assertion.minimum_count} and {assertion.maximum_count}.",
    )


def _assertion_entry(assertion: Assertion, status: str, message: str, feature: Feature) -> dict[str, Any]:
    return {
        "id": assertion.id,
        "label": assertion.label,
        "status": status,
        "message": message,
        "featureId": feature.id,
        "featureLabel": feature.label,
        "region": {
            "x": feature.locator.x,
            "y": feature.locator.y,
            "width": feature.locator.width,
            "height": feature.locator.height,
        },
    }


def _feature_box(
    locator: NormalizedRect,
    source_size: tuple[int, int],
    subject_bounds: tuple[int, int, int, int] | None,
    target_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    source_w, source_h = source_size
    target_w, target_h = target_size
    source_x1 = locator.x * source_w
    source_y1 = locator.y * source_h
    source_x2 = (locator.x + locator.width) * source_w
    source_y2 = (locator.y + locator.height) * source_h
    if subject_bounds is None:
        left, top, right, bottom = (0, 0, source_w, source_h)
    else:
        left, top, right, bottom = subject_bounds
    bounds_w = max(1, right - left)
    bounds_h = max(1, bottom - top)
    x1 = max(0, min(target_w - 1, round((source_x1 - left) / bounds_w * target_w)))
    y1 = max(0, min(target_h - 1, round((source_y1 - top) / bounds_h * target_h)))
    x2 = max(x1 + 1, min(target_w, round((source_x2 - left) / bounds_w * target_w)))
    y2 = max(y1 + 1, min(target_h, round((source_y2 - top) / bounds_h * target_h)))
    if source_w <= 0 or source_h <= 0 or target_w <= 0 or target_h <= 0:
        raise ValueError("Invalid source or target size while mapping feature locator.")
    return x1, y1, x2, y2


def _ink_mask(image: Image.Image) -> np.ndarray:
    rgba = image.convert("RGBA")
    arr = np.asarray(rgba)
    alpha = arr[:, :, 3] > 0
    rgb = arr[:, :, :3]
    luma = rgb.mean(axis=2)
    return alpha & (luma < 240)


def _load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def _load_optional_image(path: Path | None) -> Image.Image | None:
    if path is None:
        return None
    return _load_image(path)


def _safe_load_source_image(path: Path, source_identity: dict[str, Any]) -> Image.Image | None:
    if source_identity["status"] != "passed":
        return None
    try:
        return _load_image(path)
    except Exception:
        return None


def _safe_load_optional_image(path: Path | None, label: str) -> tuple[Image.Image | None, str | None]:
    if path is None:
        return None, None
    try:
        return _load_image(path), None
    except Exception as exc:
        return None, f"{label} artifact could not be opened at {path}: {exc}"


def _safe_inspect_svg(path: Path | None) -> tuple[dict[str, Any] | None, str | None]:
    if path is None:
        return None, None
    try:
        return inspect_trace_linework_svg(path), None
    except Exception as exc:
        return None, f"SVG artifact could not be inspected at {path}: {exc}"


def _safe_inspect_pdf(
    path: Path | None,
    rendered_trace_pages: tuple[Path, ...],
) -> tuple[dict[str, Any] | None, str | None]:
    if path is None:
        return None, None
    try:
        return inspect_template_packet_pdf(path, rendered_trace_pages=rendered_trace_pages), None
    except Exception as exc:
        return None, f"PDF artifact could not be inspected at {path}: {exc}"


def _decode_data_url_image(data_url: str) -> Image.Image:
    match = re.match(r"data:image/[^;]+;base64,(.+)", data_url)
    if match is None:
        raise ValueError("Accepted detail layer did not contain a PNG data URL.")
    return Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGBA")


def _build_reference_analysis(profile: CharacterAcceptanceProfile) -> Any | None:
    source_identity = _validate_source_identity(profile, profile.source.path)
    if source_identity["status"] != "passed":
        return None
    from backend.cutout_studio.pipeline import TemplateSettings, analyze_template

    settings = TemplateSettings(
        finished_height_in=profile.requested_output.finished_height_in,
        minimum_tile_cols=profile.requested_output.minimum_tile_cols,
        minimum_tile_rows=profile.requested_output.minimum_tile_rows,
        template_style=profile.requested_output.template_style,
        smoothing=4,
    )
    return analyze_template(profile.source.path.read_bytes(), settings)


def _write_overlay(source_image: Image.Image, failing_regions: list[tuple[Feature, str]], overlay_path: Path) -> None:
    overlay_path.parent.mkdir(parents=True, exist_ok=True)
    overlay = source_image.convert("RGBA")
    draw = ImageDraw.Draw(overlay, "RGBA")
    for index, (feature, status) in enumerate(failing_regions, start=1):
        x1 = round(feature.locator.x * overlay.width)
        y1 = round(feature.locator.y * overlay.height)
        x2 = round((feature.locator.x + feature.locator.width) * overlay.width)
        y2 = round((feature.locator.y + feature.locator.height) * overlay.height)
        outline = (255, 0, 0, 255) if status == "failed" else (255, 165, 0, 255)
        fill = (255, 0, 0, 48) if status == "failed" else (255, 165, 0, 48)
        draw.rectangle((x1, y1, x2, y2), outline=outline, fill=fill, width=4)
        draw.text((x1 + 6, max(0, y1 - 18)), f"{index}. {feature.label}", fill=outline)
    overlay.save(overlay_path, format="PNG")


def _overall_status(result: dict[str, Any]) -> str:
    statuses = [result["sourceIdentity"]["status"]]
    for group in ("baseline", "workflowChecks", "assertions"):
        statuses.extend(entry["status"] for entry in result[group])
    if "errored" in statuses:
        return "errored"
    if "failed" in statuses:
        return "failed"
    return "passed"


def _validate_assertion_contract(assertion: Assertion) -> None:
    if assertion.type == "minimumInk" and assertion.minimum_dark_pixels is None:
        raise ValueError(f"Assertion {assertion.id} requires minimumDarkPixels")
    if assertion.type == "maximumInk" and assertion.maximum_dark_pixels is None:
        raise ValueError(f"Assertion {assertion.id} requires maximumDarkPixels")
    if assertion.type == "enclosedRegionCount" and (
        assertion.minimum_count is None or assertion.maximum_count is None
    ):
        raise ValueError(f"Assertion {assertion.id} requires minimumCount and maximumCount")


def _require_fields(
    payload: dict[str, Any],
    allowed_fields: set[str],
    label: str,
    *,
    allow_missing: bool = False,
) -> None:
    unknown = sorted(set(payload.keys()) - allowed_fields)
    if unknown:
        raise ValueError(f"Unknown {label} field: {unknown[0]}")
    if not allow_missing:
        missing = sorted(allowed_fields - set(payload.keys()))
        if missing:
            raise ValueError(f"Missing {label} field: {missing[0]}")


def _expect_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _expect_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def _expect_optional_list(value: Any, label: str) -> list[Any]:
    if value is None:
        return []
    return _expect_list(value, label)


def _expect_str(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _expect_bool(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{label} must be a boolean")
    return value


def _expect_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    return value


def _optional_int(value: Any, label: str) -> int | None:
    if value is None:
        return None
    return _expect_int(value, label)


def _expect_float(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be numeric")
    return float(value)


def _expect_normalized(value: Any, label: str) -> float:
    normalized = _expect_float(value, label)
    if normalized < 0 or normalized > 1:
        raise ValueError(f"{label} must be within 0..1")
    return normalized


def _resolve_path(base_path: Path, raw_path: str) -> Path:
    path = Path(raw_path)
    return path if path.is_absolute() else (base_path / path).resolve()


def _optional_path(base_path: Path, value: Any, label: str) -> Path | None:
    if value is None:
        return None
    return _resolve_path(base_path, _expect_str(value, label))


def _parse_workflow_evidence(value: Any, label: str) -> ArtifactWorkflowEvidence:
    mapping = _expect_mapping(value, label)
    _require_fields(mapping, _WORKFLOW_EVIDENCE_FIELDS, label)
    events: list[WorkflowEvent] = []
    for raw_event in _expect_list(mapping.get("events"), f"{label}.events"):
        event_mapping = _expect_mapping(raw_event, f"{label}.events[]")
        kind = _expect_str(event_mapping.get("kind"), f"{label}.events[].kind")
        if kind not in _WORKFLOW_EVENT_KINDS:
            raise ValueError(f"Unknown workflow event kind: {kind}")
        _require_fields(event_mapping, _WORKFLOW_EVENT_FIELDS[kind], f"{label}.events[{kind}]")
        if kind == "step-visible":
            step = _expect_str(event_mapping.get("step"), f"{label}.events[].step")
            if step not in _WORKFLOW_STEPS:
                raise ValueError(f"Unknown workflow step: {step}")
            evidence = _parse_workflow_artifact_evidence(
                event_mapping.get("evidence"),
                f"{label}.events[{kind}].evidence",
            )
            events.append(WorkflowEvent(kind=kind, step=step, evidence=evidence))
        elif kind == "cleanup-action":
            action = _expect_str(event_mapping.get("action"), f"{label}.events[].action")
            if action not in _CLEANUP_ACTIONS:
                raise ValueError(f"Unknown cleanup action: {action}")
            evidence = _parse_workflow_artifact_evidence(
                event_mapping.get("evidence"),
                f"{label}.events[{kind}].evidence",
            )
            events.append(WorkflowEvent(kind=kind, action=action, evidence=evidence))
        else:
            evidence = _parse_workflow_log_evidence(
                event_mapping.get("evidence"),
                f"{label}.events[{kind}].evidence",
            )
            events.append(WorkflowEvent(kind=kind, evidence=evidence))
    return ArtifactWorkflowEvidence(events=tuple(events))


def _parse_workflow_artifact_evidence(value: Any, label: str) -> WorkflowArtifactEvidence:
    mapping = _expect_mapping(value, label)
    _require_fields(mapping, _WORKFLOW_STEP_EVIDENCE_FIELDS, label)
    return WorkflowArtifactEvidence(
        screenshot_path=Path(_expect_str(mapping.get("screenshotPath"), f"{label}.screenshotPath")),
        screenshot_sha256=_expect_str(mapping.get("screenshotSha256"), f"{label}.screenshotSha256").upper(),
        state_path=Path(_expect_str(mapping.get("statePath"), f"{label}.statePath")),
        state_sha256=_expect_str(mapping.get("stateSha256"), f"{label}.stateSha256").upper(),
    )


def _parse_workflow_log_evidence(value: Any, label: str) -> WorkflowArtifactEvidence:
    mapping = _expect_mapping(value, label)
    _require_fields(mapping, _WORKFLOW_LOG_EVIDENCE_FIELDS, label)
    return WorkflowArtifactEvidence(
        log_path=Path(_expect_str(mapping.get("logPath"), f"{label}.logPath")),
        log_sha256=_expect_str(mapping.get("logSha256"), f"{label}.logSha256").upper(),
    )


def _validate_and_derive_workflow_evidence(artifact_set: ArtifactSet) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    summary = {
        "completedSteps": [],
        "cleanupActionCount": 0,
        "providerRequests": 0,
    }
    step_events = [event for event in artifact_set.workflow_evidence.events if event.kind == "step-visible"]
    cleanup_events = [event for event in artifact_set.workflow_evidence.events if event.kind == "cleanup-action"]
    provider_log_events = [event for event in artifact_set.workflow_evidence.events if event.kind == "provider-log"]

    if not step_events:
        checks.append(_workflow_check("workflow-step-evidence", "Step evidence exists", "errored", "No step-visible workflow evidence events were recorded."))
        return {"checks": checks, "summary": summary}

    if len(provider_log_events) != 1:
        checks.append(_workflow_check(
            "workflow-provider-log",
            "Exactly one provider log is bound to the workflow evidence",
            "errored",
            f"Observed {len(provider_log_events)} provider-log events.",
        ))
    else:
        try:
            log_validation = _validate_provider_log_event(provider_log_events[0], artifact_set.base_path)
        except ValueError as exc:
            checks.append(_workflow_check(
                "workflow-provider-log",
                "Provider requests are derived from a bound network log",
                "errored",
                str(exc),
            ))
        else:
            checks.append(log_validation["check"])
            summary["providerRequests"] = log_validation["providerRequestCount"]

    seen_step_hashes: set[str] = set()
    seen_state_hashes: set[str] = set()
    completed_steps: list[str] = []
    export_event_state: dict[str, Any] | None = None
    workflow_errors = False
    for event in step_events:
        try:
            validation = _validate_step_event(event, artifact_set.base_path)
        except ValueError as exc:
            checks.append(_workflow_check(
                "workflow-step-evidence",
                "Step evidence is bound to valid artifacts",
                "errored",
                str(exc),
            ))
            workflow_errors = True
            continue
        checks.append(validation["check"])
        if validation["check"]["status"] == "passed":
            screenshot_hash = validation["screenshotSha256"]
            state_hash = validation["stateSha256"]
            if screenshot_hash in seen_step_hashes:
                checks.append(_workflow_check(
                    "workflow-unique-step-screenshots",
                    "Each step uses unique screenshot evidence",
                    "errored",
                    f"Duplicate screenshot evidence detected for step {event.step}.",
                ))
                workflow_errors = True
            else:
                seen_step_hashes.add(screenshot_hash)
            if state_hash in seen_state_hashes:
                checks.append(_workflow_check(
                    "workflow-unique-step-state",
                    "Each step uses unique state evidence",
                    "errored",
                    f"Duplicate state evidence detected for step {event.step}.",
                ))
                workflow_errors = True
            else:
                seen_state_hashes.add(state_hash)
            if event.step is not None:
                completed_steps.append(event.step)
            if event.step == "Export":
                export_event_state = validation["statePayload"]
        else:
            workflow_errors = True

    for event in cleanup_events:
        try:
            validation = _validate_cleanup_event(event, artifact_set.base_path)
        except ValueError as exc:
            checks.append(_workflow_check(
                "workflow-cleanup-evidence",
                "Cleanup actions are bound to valid artifacts",
                "errored",
                str(exc),
            ))
            workflow_errors = True
            continue
        checks.append(validation["check"])
        if validation["check"]["status"] == "passed":
            summary["cleanupActionCount"] += 1
        else:
            workflow_errors = True

    sequence_check = _validate_step_sequence(completed_steps)
    checks.append(sequence_check)
    workflow_errors = workflow_errors or sequence_check["status"] != "passed"
    summary["completedSteps"] = completed_steps

    export_check = _validate_export_step_outputs(artifact_set, export_event_state, "Export" in completed_steps)
    if export_check is not None:
        checks.append(export_check)
        workflow_errors = workflow_errors or export_check["status"] != "passed"

    return {"checks": checks, "summary": summary}


def _workflow_event_observation(event: WorkflowEvent) -> dict[str, Any]:
    payload: dict[str, Any] = {"kind": event.kind}
    if event.step is not None:
        payload["step"] = event.step
    if event.action is not None:
        payload["action"] = event.action
    if event.evidence is not None:
        evidence: dict[str, Any] = {}
        if event.evidence.screenshot_path is not None:
            evidence["screenshotPath"] = str(event.evidence.screenshot_path)
            evidence["screenshotSha256"] = event.evidence.screenshot_sha256
        if event.evidence.state_path is not None:
            evidence["statePath"] = str(event.evidence.state_path)
            evidence["stateSha256"] = event.evidence.state_sha256
        if event.evidence.log_path is not None:
            evidence["logPath"] = str(event.evidence.log_path)
            evidence["logSha256"] = event.evidence.log_sha256
        payload["evidence"] = evidence
    return payload


def _derive_workflow_summary(workflow_evidence: ArtifactWorkflowEvidence) -> dict[str, Any]:
    completed_steps: list[str] = []
    cleanup_action_count = 0
    provider_request_count = 0
    for event in workflow_evidence.events:
        if event.kind == "step-visible" and event.step and event.step not in completed_steps:
            completed_steps.append(event.step)
        elif event.kind == "cleanup-action":
            cleanup_action_count += 1
        elif event.kind == "provider-log":
            provider_request_count += 0
    return {
        "completedSteps": completed_steps,
        "cleanupActionCount": cleanup_action_count,
        "providerRequests": provider_request_count,
    }


def _workflow_check(check_id: str, label: str, status: str, message: str) -> dict[str, Any]:
    return {"id": check_id, "label": label, "status": status, "message": message}


def _validate_step_event(event: WorkflowEvent, base_path: Path) -> dict[str, Any]:
    assert event.evidence is not None and event.step is not None
    screenshot_path = _resolve_evidence_path(base_path, event.evidence.screenshot_path, "workflow step screenshot")
    state_path = _resolve_evidence_path(base_path, event.evidence.state_path, "workflow step state")
    screenshot_sha256 = _verify_sha256_file(screenshot_path, event.evidence.screenshot_sha256, "workflow step screenshot")
    state_sha256 = _verify_sha256_file(state_path, event.evidence.state_sha256, "workflow step state")
    screenshot_check = _validate_screenshot_image(screenshot_path)
    if screenshot_check["status"] != "passed":
        return {"check": screenshot_check, "screenshotSha256": screenshot_sha256, "stateSha256": state_sha256, "statePayload": None}
    state_payload = _load_state_snapshot(state_path)
    marker_check = _validate_step_state_payload(event.step, state_payload)
    return {
        "check": marker_check,
        "screenshotSha256": screenshot_sha256,
        "stateSha256": state_sha256,
        "statePayload": state_payload,
    }


def _validate_cleanup_event(event: WorkflowEvent, base_path: Path) -> dict[str, Any]:
    assert event.evidence is not None and event.action is not None
    screenshot_path = _resolve_evidence_path(base_path, event.evidence.screenshot_path, "cleanup action screenshot")
    state_path = _resolve_evidence_path(base_path, event.evidence.state_path, "cleanup action state")
    _verify_sha256_file(screenshot_path, event.evidence.screenshot_sha256, "cleanup action screenshot")
    _verify_sha256_file(state_path, event.evidence.state_sha256, "cleanup action state")
    screenshot_check = _validate_screenshot_image(screenshot_path)
    if screenshot_check["status"] != "passed":
        return {"check": screenshot_check}
    state_payload = _load_state_snapshot(state_path)
    if state_payload.get("step") != "Clean Lines" or state_payload.get("action") != event.action:
        return {"check": _workflow_check(
            "workflow-cleanup-evidence",
            "Cleanup actions are bound to Clean Lines evidence",
            "errored",
            f"Cleanup action evidence did not match action {event.action}.",
        )}
    return {"check": _workflow_check(
        "workflow-cleanup-evidence",
        "Cleanup actions are bound to Clean Lines evidence",
        "passed",
        f"Cleanup action {event.action} verified.",
    )}


def _validate_provider_log_event(event: WorkflowEvent, base_path: Path) -> dict[str, Any]:
    assert event.evidence is not None
    log_path = _resolve_evidence_path(base_path, event.evidence.log_path, "provider request log")
    _verify_sha256_file(log_path, event.evidence.log_sha256, "provider request log")
    payload = json.loads(log_path.read_text(encoding="utf-8"))
    _require_fields(_expect_mapping(payload, "provider request log"), {"schemaVersion", "requests"}, "provider request log")
    if _expect_int(payload.get("schemaVersion"), "provider request log.schemaVersion") != 1:
        raise ValueError("Unsupported provider request log schemaVersion")
    provider_request_count = 0
    for request in _expect_list(payload.get("requests"), "provider request log.requests"):
        mapping = _expect_mapping(request, "provider request log.requests[]")
        _require_fields(mapping, {"url", "method"}, "provider request log.requests[]")
        url = _expect_str(mapping.get("url"), "provider request log.requests[].url")
        method = _expect_str(mapping.get("method"), "provider request log.requests[].method")
        if method == "POST" and any(url.endswith(endpoint) for endpoint in _PROVIDER_REQUEST_ENDPOINTS):
            provider_request_count += 1
    return {
        "check": _workflow_check(
            "workflow-provider-log",
            "Provider requests are derived from a bound network log",
            "passed",
            f"Derived {provider_request_count} provider requests from {log_path}.",
        ),
        "providerRequestCount": provider_request_count,
    }


def _validate_step_sequence(completed_steps: list[str]) -> dict[str, Any]:
    if not completed_steps:
        return _workflow_check("workflow-step-sequence", "Step evidence is ordered", "errored", "No completed steps were derived from workflow evidence.")
    if len(completed_steps) != len(set(completed_steps)):
        return _workflow_check("workflow-step-sequence", "Step evidence is ordered", "errored", f"Duplicate workflow steps were recorded: {completed_steps}.")
    expected_prefix = ["Upload", "Clean Lines", "Colors", "Export"][: len(completed_steps)]
    if completed_steps != expected_prefix:
        return _workflow_check("workflow-step-sequence", "Step evidence is ordered", "failed", f"Observed workflow steps {completed_steps}, expected ordered prefix {expected_prefix}.")
    return _workflow_check("workflow-step-sequence", "Step evidence is ordered", "passed", f"Observed ordered workflow steps {completed_steps}.")


def _validate_export_step_outputs(
    artifact_set: ArtifactSet,
    export_state: dict[str, Any] | None,
    export_seen: bool,
) -> dict[str, Any] | None:
    if not export_seen:
        return None
    if export_state is None:
        return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", "Export workflow evidence did not include a validated state snapshot.")
    if artifact_set.svg is None or artifact_set.pdf is None:
        return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", "Export was claimed without SVG/PDF artifacts.")
    outputs = export_state.get("outputs")
    if not isinstance(outputs, list):
        return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", "Export state snapshot did not include outputs.")
    observed_by_kind: dict[str, dict[str, Any]] = {}
    for raw_output in outputs:
        mapping = _expect_mapping(raw_output, "workflow export output")
        _require_fields(mapping, _STATE_OUTPUT_FIELDS, "workflow export output")
        kind = _expect_str(mapping.get("kind"), "workflow export output.kind")
        observed_by_kind[kind] = mapping
    for kind, expected_path in (("svg", artifact_set.svg), ("pdf", artifact_set.pdf)):
        output = observed_by_kind.get(kind)
        if output is None:
            return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", f"Export state snapshot omitted {kind} output evidence.")
        resolved = _resolve_path(artifact_set.base_path, _expect_str(output.get("path"), f"workflow export output.{kind}.path"))
        if resolved.resolve() != expected_path.resolve():
            return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", f"Export state snapshot referenced {resolved} for {kind}, expected {expected_path}.")
        actual_bytes = expected_path.read_bytes()
        actual_sha256 = hashlib.sha256(actual_bytes).hexdigest().upper()
        if actual_sha256 != _expect_str(output.get("sha256"), f"workflow export output.{kind}.sha256").upper():
            return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", f"Export state snapshot hash mismatch for {kind}.")
        if len(actual_bytes) != _expect_int(output.get("bytes"), f"workflow export output.{kind}.bytes"):
            return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "errored", f"Export state snapshot byte-size mismatch for {kind}.")
    return _workflow_check("workflow-export-outputs", "Export step is bound to durable output artifacts", "passed", "Export step output hashes matched the SVG and PDF artifacts.")


def _resolve_evidence_path(base_path: Path, path: Path | None, label: str) -> Path:
    if path is None:
        raise ValueError(f"Missing {label} path")
    return _resolve_path(base_path, str(path))


def _verify_sha256_file(path: Path, expected_sha256: str | None, label: str) -> str:
    if expected_sha256 is None:
        raise ValueError(f"Missing expected SHA-256 for {label}")
    actual_sha256 = hashlib.sha256(path.read_bytes()).hexdigest().upper()
    if actual_sha256 != expected_sha256.upper():
        raise ValueError(f"{label} SHA-256 mismatch: expected {expected_sha256.upper()}, observed {actual_sha256}")
    return actual_sha256


def _validate_screenshot_image(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        entropy = rgb.convert("L").entropy()
        if rgb.width < 200 or rgb.height < 120:
            return _workflow_check("workflow-step-screenshot", "Step screenshots are valid nontrivial images", "errored", f"Screenshot {path} was too small at {rgb.width}x{rgb.height}.")
        if entropy < 0.5:
            return _workflow_check("workflow-step-screenshot", "Step screenshots are valid nontrivial images", "errored", f"Screenshot {path} had insufficient entropy ({entropy:.3f}).")
    return _workflow_check("workflow-step-screenshot", "Step screenshots are valid nontrivial images", "passed", f"Screenshot {path} opened successfully with nontrivial entropy.")


def _load_state_snapshot(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    mapping = _expect_mapping(payload, "workflow state snapshot")
    _require_fields(mapping, _STATE_SNAPSHOT_FIELDS, "workflow state snapshot", allow_missing=True)
    if _expect_int(mapping.get("schemaVersion"), "workflow state snapshot.schemaVersion") != 1:
        raise ValueError("Unsupported workflow state snapshot schemaVersion")
    return mapping


def _validate_step_state_payload(step: str, state_payload: dict[str, Any]) -> dict[str, Any]:
    if _expect_str(state_payload.get("step"), "workflow state snapshot.step") != step:
        return _workflow_check("workflow-step-state", "Step state snapshots match the claimed step", "errored", f"State snapshot claimed {state_payload.get('step')} while workflow event claimed {step}.")
    marker = _STEP_MARKERS[step]
    for key, expected in marker.items():
        observed = state_payload.get(key)
        if observed != expected:
            return _workflow_check("workflow-step-state", "Step state snapshots match the claimed step", "errored", f"State snapshot field {key} for {step} was {observed!r}, expected {expected!r}.")
    return _workflow_check("workflow-step-state", "Step state snapshots match the claimed step", "passed", f"State snapshot verified for {step}.")

def _largest_image(images: list[Image.Image]) -> Image.Image | None:
    if not images:
        return None
    return max(images, key=lambda image: image.width * image.height)


def _image_is_monochrome(image: Image.Image) -> bool:
    return all(red == green == blue for red, green, blue in image.get_flattened_data())


def _pdf_forbidden_markers(reader: PdfReader) -> list[str]:
    haystacks: list[str] = []
    metadata = reader.metadata or {}
    haystacks.extend(str(value) for value in metadata.values() if value is not None)
    for page in reader.pages:
        haystacks.append(page.extract_text() or "")
        contents = page.get_contents()
        if contents is not None:
            haystacks.append(contents.get_data().decode("latin-1", errors="ignore"))
    combined = "\n".join(haystacks)
    return [marker for marker in _FORBIDDEN_TRACE_MARKERS if marker in combined]


def _print_terminal_report(result: dict[str, Any]) -> None:
    print(f"[{result['overallStatus'].upper()}] fixture={result['fixtureId']} artifactSet={result['artifactSetId']}")
    print(f"source_identity: {result['sourceIdentity']['status']} - {result['sourceIdentity']['message']}")
    for group_name in ("baseline", "workflowChecks", "assertions"):
        for entry in result[group_name]:
            print(f"{group_name}:{entry['id']}: {entry['status']} - {entry['message']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile")
    parser.add_argument("artifact_set")
    parser.add_argument("--result", dest="result_path")
    parser.add_argument("--overlay", dest="overlay_path")
    args = parser.parse_args(argv)

    profile = load_character_acceptance_profile(args.profile)
    artifact_set_payload = json.loads(Path(args.artifact_set).read_text(encoding="utf-8"))
    artifact_set = build_artifact_set(artifact_set_payload, base_path=Path(args.artifact_set).resolve().parent)
    result = validate_character_acceptance(profile, artifact_set, overlay_path=args.overlay_path)
    _print_terminal_report(result)
    if args.result_path:
        result_path = Path(args.result_path)
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    if result["overallStatus"] == "passed":
        return 0
    if result["overallStatus"] == "failed":
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
