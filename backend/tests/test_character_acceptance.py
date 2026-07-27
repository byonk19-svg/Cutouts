import json
import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from backend.cutout_studio.pipeline import TemplateSettings, analyze_template, build_template_pdf
from backend.tests.character_acceptance import (
    build_artifact_set,
    inspect_template_packet_pdf,
    load_character_acceptance_profile,
    validate_character_acceptance,
)


FIXTURES_DIR = Path(__file__).with_name("fixtures")


class CharacterAcceptanceProfileTest(unittest.TestCase):
    def test_loader_rejects_unknown_versions_and_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            valid_profile = self._profile_payload(source_path)

            invalid_version_path = tmp_path / "invalid-version.json"
            invalid_version_path.write_text(
                json.dumps({**valid_profile, "schemaVersion": 99}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Unsupported profile schemaVersion"):
                load_character_acceptance_profile(invalid_version_path)

            unknown_field_path = tmp_path / "unknown-field.json"
            unknown_field_path.write_text(
                json.dumps({**valid_profile, "unexpectedField": True}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Unknown profile field"):
                load_character_acceptance_profile(unknown_field_path)

    def test_loader_rejects_unknown_meaning_bearing_enum_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            valid_profile = self._profile_payload(source_path)

            invalid_kind_path = tmp_path / "invalid-kind.json"
            invalid_kind_payload = json.loads(json.dumps(valid_profile))
            invalid_kind_payload["features"][0]["kind"] = "mysteryRegion"
            invalid_kind_path.write_text(json.dumps(invalid_kind_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Unknown feature kind"):
                load_character_acceptance_profile(invalid_kind_path)

            invalid_artifact_path = tmp_path / "invalid-artifact.json"
            invalid_artifact_payload = json.loads(json.dumps(valid_profile))
            invalid_artifact_payload["assertions"][0]["artifact"] = "oraclePixels"
            invalid_artifact_path.write_text(json.dumps(invalid_artifact_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Unknown assertion artifact"):
                load_character_acceptance_profile(invalid_artifact_path)

            invalid_template_style_path = tmp_path / "invalid-template-style.json"
            invalid_template_style_payload = json.loads(json.dumps(valid_profile))
            invalid_template_style_payload["requestedOutput"]["templateStyle"] = "mystery-style"
            invalid_template_style_path.write_text(json.dumps(invalid_template_style_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Unknown requested output templateStyle"):
                load_character_acceptance_profile(invalid_template_style_path)

    def test_loader_rejects_boolean_numeric_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            valid_profile = self._profile_payload(source_path)

            invalid_schema_path = tmp_path / "invalid-schema-bool.json"
            invalid_schema_payload = json.loads(json.dumps(valid_profile))
            invalid_schema_payload["schemaVersion"] = True
            invalid_schema_path.write_text(json.dumps(invalid_schema_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "profile.schemaVersion must be an integer"):
                load_character_acceptance_profile(invalid_schema_path)

            invalid_dimension_path = tmp_path / "invalid-dimension-bool.json"
            invalid_dimension_payload = json.loads(json.dumps(valid_profile))
            invalid_dimension_payload["source"]["widthPx"] = False
            invalid_dimension_path.write_text(json.dumps(invalid_dimension_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "profile.source.widthPx must be an integer"):
                load_character_acceptance_profile(invalid_dimension_path)

            invalid_budget_path = tmp_path / "invalid-budget-bool.json"
            invalid_budget_payload = json.loads(json.dumps(valid_profile))
            invalid_budget_payload["workflowBudgets"]["maxCleanupActions"] = True
            invalid_budget_path.write_text(json.dumps(invalid_budget_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "profile.workflowBudgets.maxCleanupActions must be an integer"):
                load_character_acceptance_profile(invalid_budget_path)

            invalid_locator_path = tmp_path / "invalid-locator-bool.json"
            invalid_locator_payload = json.loads(json.dumps(valid_profile))
            invalid_locator_payload["features"][0]["locator"]["x"] = True
            invalid_locator_path.write_text(json.dumps(invalid_locator_payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "feature center-line.locator.x must be numeric"):
                load_character_acceptance_profile(invalid_locator_path)

    def test_validator_reports_pass_fail_and_error_statuses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "synthetic-pass-fail",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)
            result = validate_character_acceptance(profile, artifact_set)

            statuses = {entry["id"]: entry["status"] for entry in result["assertions"]}
            self.assertEqual(result["overallStatus"], "errored")
            self.assertEqual(statuses["center-line-present"], "passed")
            self.assertEqual(statuses["upper-right-must-stay-empty"], "failed")
            self.assertEqual(statuses["generated-detail-required"], "errored")

    def test_cli_writes_manifest_and_overlay_and_returns_nonzero_on_required_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=False)
            profile_path = tmp_path / "profile.json"
            artifact_set_path = tmp_path / "artifact-set.json"
            result_path = tmp_path / "result.json"
            overlay_path = tmp_path / "overlay.png"

            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")
            artifact_set_path.write_text(
                json.dumps({
                    "schemaVersion": 1,
                    "artifactSetId": "cli-failure",
                    "sourceImage": str(source_path),
                    "generatedDetailPng": str(detail_path),
                    "acceptedDetailPng": str(detail_path),
                    "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
                }, indent=2),
                encoding="utf-8",
            )

            completed = subprocess.run(
                [
                    "python",
                    "-m",
                    "backend.tests.character_acceptance",
                    str(profile_path),
                    str(artifact_set_path),
                    "--result",
                    str(result_path),
                    "--overlay",
                    str(overlay_path),
                ],
                cwd=Path(__file__).resolve().parents[2],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 1)
            self.assertIn("center-line-present", completed.stdout)
            self.assertTrue(result_path.exists())
            self.assertTrue(overlay_path.exists())
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["overallStatus"], "failed")
            with Image.open(overlay_path) as overlay:
                self.assertEqual(overlay.size, (240, 320))

    def test_validator_returns_structured_error_for_missing_declared_accepted_detail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "missing-accepted-detail",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(tmp_path / "missing-accepted.png"),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            accepted_assertions = [entry for entry in result["assertions"] if entry["featureId"] == "center-line"]
            self.assertTrue(any(entry["status"] == "errored" and "Accepted detail artifact could not be opened" in entry["message"] for entry in accepted_assertions))

    def test_validator_returns_structured_error_for_missing_declared_generated_detail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "missing-generated-detail",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(detail_path),
                "generatedDetailPng": str(tmp_path / "missing-generated.png"),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            generated_assertion = next(entry for entry in result["assertions"] if entry["id"] == "generated-detail-required")
            self.assertEqual(generated_assertion["status"], "errored")
            self.assertIn("Generated detail artifact could not be opened", generated_assertion["message"])

    def test_validator_returns_structured_error_for_missing_declared_svg(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "missing-svg",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(detail_path),
                "svg": str(tmp_path / "missing.svg"),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any(entry["status"] == "errored" and "SVG artifact could not be inspected" in entry["message"] for entry in result["baseline"]))

    def test_validator_returns_structured_error_for_missing_declared_pdf_and_rendered_trace_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "missing-pdf-rendered",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(detail_path),
                "pdf": str(tmp_path / "missing.pdf"),
                "renderedTracePages": [str(tmp_path / "missing-rendered.png")],
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any(entry["status"] == "errored" and "PDF artifact could not be inspected" in entry["message"] for entry in result["baseline"]))

    def test_validator_returns_structured_error_for_malformed_declared_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            malformed_png = tmp_path / "malformed.png"
            malformed_svg = tmp_path / "malformed.svg"
            malformed_pdf = tmp_path / "malformed.pdf"
            malformed_rendered = tmp_path / "malformed-rendered.png"
            malformed_png.write_bytes(b"not-a-png")
            malformed_svg.write_text("<svg><g></svg", encoding="utf-8")
            malformed_pdf.write_bytes(b"%PDF-1.4 broken")
            malformed_rendered.write_bytes(b"not-a-png")
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "malformed-artifacts",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(malformed_png),
                "generatedDetailPng": str(malformed_png),
                "svg": str(malformed_svg),
                "pdf": str(malformed_pdf),
                "renderedTracePages": [str(malformed_rendered)],
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any(entry["status"] == "errored" and "could not be opened" in entry["message"] for entry in result["assertions"]))
            self.assertTrue(any(entry["status"] == "errored" and ("SVG artifact could not be inspected" in entry["message"] or "PDF artifact could not be inspected" in entry["message"]) for entry in result["baseline"]))

    def test_validator_uses_artifact_set_source_identity_not_profile_fixture_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            wrong_source_path = self._write_wrong_source_image(tmp_path / "wrong-source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "wrong-source",
                "sourceImage": str(wrong_source_path),
                "acceptedDetailPng": str(detail_path),
                "generatedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["sourceIdentity"]["status"], "errored")
            self.assertIn("Artifact Set source", result["sourceIdentity"]["message"])
            self.assertEqual(result["overallStatus"], "errored")

    def test_validator_does_not_write_overlay_when_artifact_set_source_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            overlay_path = tmp_path / "overlay.png"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "missing-source-overlay",
                "sourceImage": str(tmp_path / "missing-source.png"),
                "acceptedDetailPng": str(detail_path),
                "generatedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set, overlay_path=overlay_path)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertFalse(overlay_path.exists())
            self.assertNotIn("diagnosticOverlay", result)

    def test_cli_writes_result_without_traceback_when_artifact_set_source_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            artifact_set_path = tmp_path / "artifact-set.json"
            result_path = tmp_path / "result.json"
            overlay_path = tmp_path / "overlay.png"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")
            artifact_set_path.write_text(
                json.dumps({
                    "schemaVersion": 1,
                    "artifactSetId": "cli-missing-source-overlay",
                    "sourceImage": str(tmp_path / "missing-source.png"),
                    "acceptedDetailPng": str(detail_path),
                    "generatedDetailPng": str(detail_path),
                    "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload"]),
                }, indent=2),
                encoding="utf-8",
            )

            completed = subprocess.run(
                [
                    "python",
                    "-m",
                    "backend.tests.character_acceptance",
                    str(profile_path),
                    str(artifact_set_path),
                    "--result",
                    str(result_path),
                    "--overlay",
                    str(overlay_path),
                ],
                cwd=Path(__file__).resolve().parents[2],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertTrue(result_path.exists())
            self.assertFalse(overlay_path.exists())
            self.assertNotIn("Traceback", completed.stderr)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["overallStatus"], "errored")

    def test_workflow_steps_are_derived_from_observed_event_trail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "skipped-steps",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            required_steps = next(entry for entry in result["workflowChecks"] if entry["id"] == "workflow-required-steps")
            self.assertEqual(required_steps["status"], "failed")
            self.assertIn("Colors", required_steps["message"])
            self.assertIn("Export", required_steps["message"])

    def test_artifact_set_rejects_legacy_workflow_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            with self.assertRaisesRegex(ValueError, "Unknown artifactSet field: workflow"):
                build_artifact_set({
                    "schemaVersion": 1,
                    "artifactSetId": "legacy-summary",
                    "sourceImage": str(source_path),
                    "workflow": {
                        "providerRequests": 0,
                        "cleanupActionCount": 0,
                        "completedSteps": ["Upload", "Clean Lines", "Colors", "Export"],
                    },
                    "workflowEvidence": self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"]),
                }, base_path=tmp_path)

    def test_artifact_set_rejects_raw_step_events_without_bound_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            with self.assertRaisesRegex(ValueError, "Missing .*evidence"):
                build_artifact_set({
                    "schemaVersion": 1,
                    "artifactSetId": "raw-steps",
                    "sourceImage": str(source_path),
                    "workflowEvidence": {
                        "events": [
                            {"kind": "step-visible", "step": "Upload"},
                            {"kind": "provider-log", "evidence": {"logPath": str(tmp_path / "missing.json"), "logSha256": "0" * 64}},
                        ],
                    },
                }, base_path=tmp_path)

    def test_validator_errors_on_mismatched_step_state_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")
            workflow_evidence = self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"])
            upload_state_path = Path(str(workflow_evidence["events"][0]["evidence"]["statePath"]))
            upload_state_payload = json.loads(upload_state_path.read_text(encoding="utf-8"))
            upload_state_payload["step"] = "Clean Lines"
            upload_state_path.write_text(json.dumps(upload_state_payload, indent=2), encoding="utf-8")
            workflow_evidence["events"][0]["evidence"]["stateSha256"] = self._file_sha256(upload_state_path)

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "mismatched-step-state",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": workflow_evidence,
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any("State snapshot claimed Clean Lines" in entry["message"] for entry in result["workflowChecks"]))

    def test_validator_errors_on_tampered_step_hash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")
            workflow_evidence = self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"])
            workflow_evidence["events"][0]["evidence"]["screenshotSha256"] = "0" * 64

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "tampered-step-hash",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": workflow_evidence,
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any("SHA-256 mismatch" in entry["message"] for entry in result["workflowChecks"]))

    def test_validator_errors_on_duplicate_step_screenshot_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")
            workflow_evidence = self._workflow_evidence(tmp_path, ["Upload", "Clean Lines", "Colors"])
            workflow_evidence["events"][1]["evidence"]["screenshotPath"] = workflow_evidence["events"][0]["evidence"]["screenshotPath"]
            workflow_evidence["events"][1]["evidence"]["screenshotSha256"] = workflow_evidence["events"][0]["evidence"]["screenshotSha256"]

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                    "artifactSetId": "duplicate-step-screenshot-artifacts",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": workflow_evidence,
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            self.assertEqual(result["overallStatus"], "errored")
            self.assertTrue(any("Duplicate screenshot evidence" in entry["message"] for entry in result["workflowChecks"]))

    def test_validator_rejects_reordered_step_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "reordered-steps",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(tmp_path, ["Clean Lines", "Upload", "Colors"]),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            sequence_check = next(entry for entry in result["workflowChecks"] if entry["id"] == "workflow-step-sequence")
            self.assertEqual(sequence_check["status"], "failed")
            self.assertIn("expected ordered prefix", sequence_check["message"])

    def test_validator_fails_when_provider_request_is_present_in_network_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_path = self._write_source_image(tmp_path / "source.png")
            detail_path = self._write_detail_image(tmp_path / "detail.png", include_center_line=True)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(json.dumps(self._profile_payload(source_path), indent=2), encoding="utf-8")

            profile = load_character_acceptance_profile(profile_path)
            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "provider-request-present",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(detail_path),
                "acceptedDetailPng": str(detail_path),
                "workflowEvidence": self._workflow_evidence(
                    tmp_path,
                    ["Upload", "Clean Lines", "Colors"],
                    provider_request_endpoints=["/api/generate-linework"],
                ),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

            provider_check = next(entry for entry in result["workflowChecks"] if entry["id"] == "workflow-provider-requests")
            self.assertEqual(provider_check["status"], "failed")
            self.assertIn("Observed 1 provider requests", provider_check["message"])

    def test_pdf_inspection_flags_contaminated_trace_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            pdf_path = self._write_contaminated_trace_pdf(tmp_path / "contaminated.pdf")
            rendered_page_path = self._write_rendered_trace_page(tmp_path / "trace-page-01.png", color=True)

            inspection = inspect_template_packet_pdf(pdf_path, rendered_trace_pages=[rendered_page_path])

            self.assertEqual(inspection["traceImageCounts"], [2])
            self.assertFalse(inspection["allTracePagesSingleRaster"])
            self.assertFalse(inspection["allEmbeddedTraceImagesMonochrome"])
            self.assertFalse(inspection["renderedTracePagesMonochrome"])
            self.assertIn("Selection Inspector", inspection["forbiddenMarkers"])

    def _profile_payload(self, source_path: Path) -> dict[str, object]:
        source_bytes = source_path.read_bytes()
        return {
            "schemaVersion": 1,
            "fixtureId": "synthetic-contract",
            "label": "Synthetic Contract Fixture",
            "source": {
                "path": str(source_path),
                "filename": source_path.name,
                "widthPx": 240,
                "heightPx": 320,
                "bytes": len(source_bytes),
                "sha256": "D1413D9E3ABC3A63DC6292A080E760CB4D71F4C506C59D5607550C5880F08B87",
                "committable": True,
            },
            "requestedOutput": {
                "finishedHeightIn": 18,
                "minimumTileCols": 1,
                "minimumTileRows": 1,
                "templateStyle": "clean",
                "colorGuide": "separate-page",
            },
            "features": [
                {
                    "id": "center-line",
                    "label": "Center line",
                    "kind": "featureLine",
                    "locator": {"type": "rect", "x": 0.44, "y": 0.28, "width": 0.12, "height": 0.34},
                },
                {
                    "id": "upper-right-empty",
                    "label": "Upper-right empty region",
                    "kind": "forbiddenRegion",
                    "locator": {"type": "rect", "x": 0.72, "y": 0.10, "width": 0.16, "height": 0.16},
                },
            ],
            "assertions": [
                {
                    "id": "center-line-present",
                    "label": "Center line stays present",
                    "type": "minimumInk",
                    "artifact": "acceptedDetail",
                    "featureId": "center-line",
                    "minimumDarkPixels": 250,
                },
                {
                    "id": "upper-right-must-stay-empty",
                    "label": "Upper-right region stays empty",
                    "type": "maximumInk",
                    "artifact": "acceptedDetail",
                    "featureId": "upper-right-empty",
                    "maximumDarkPixels": 0,
                },
                {
                    "id": "generated-detail-required",
                    "label": "Generated detail is available when requested",
                    "type": "minimumInk",
                    "artifact": "generatedDetail",
                    "featureId": "center-line",
                    "minimumDarkPixels": 1,
                },
            ],
            "workflowBudgets": {
                "maxProviderRequests": 0,
                "maxCleanupActions": 2,
                "requiredCompletedSteps": ["Upload", "Clean Lines", "Colors", "Export"],
            },
            "humanChecklist": [
                "Print at 100% / Actual Size.",
                "Confirm the transferred line remains practical.",
            ],
        }

    def _write_source_image(self, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        source_fixture = FIXTURES_DIR / "synthetic_character" / "synthetic-character-source.png"
        if source_fixture.exists():
            destination.write_bytes(source_fixture.read_bytes())
            return destination

        image = Image.new("RGBA", (240, 320), (255, 255, 255, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((24, 18, 216, 302), radius=44, fill=(226, 180, 92, 255), outline=(24, 24, 24, 255), width=6)
        image.save(destination, format="PNG")
        return destination

    def _write_detail_image(self, destination: Path, *, include_center_line: bool) -> Path:
        image = Image.new("RGBA", (240, 320), (255, 255, 255, 0))
        draw = ImageDraw.Draw(image)
        if include_center_line:
            draw.line((120, 92, 120, 196), fill=(0, 0, 0, 255), width=10)
        draw.rectangle((178, 38, 214, 74), fill=(0, 0, 0, 255))
        image.save(destination, format="PNG")
        return destination

    def _write_wrong_source_image(self, destination: Path) -> Path:
        image = Image.new("RGBA", (240, 320), (255, 255, 255, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((20, 20, 220, 300), radius=40, fill=(90, 150, 220, 255), outline=(12, 12, 12, 255), width=8)
        draw.line((60, 250, 180, 80), fill=(12, 12, 12, 255), width=12)
        image.save(destination, format="PNG")
        return destination

    def _workflow_evidence(
        self,
        tmp_path: Path,
        steps: list[str],
        *,
        svg_path: Path | None = None,
        pdf_path: Path | None = None,
        cleanup_actions: list[str] | None = None,
        provider_request_endpoints: list[str] | None = None,
    ) -> dict[str, object]:
        workflow_dir = tmp_path / "workflow-evidence"
        workflow_dir.mkdir(parents=True, exist_ok=True)
        events: list[dict[str, object]] = []
        for index, step in enumerate(steps, start=1):
            screenshot_path = self._write_step_screenshot(workflow_dir / f"{index:02d}-{self._slug(step)}.png", step, index)
            state_path = workflow_dir / f"{index:02d}-{self._slug(step)}.json"
            state_payload = self._step_state_payload(step, svg_path=svg_path, pdf_path=pdf_path)
            state_path.write_text(json.dumps(state_payload, indent=2), encoding="utf-8")
            events.append({
                "kind": "step-visible",
                "step": step,
                "evidence": {
                    "screenshotPath": str(screenshot_path),
                    "screenshotSha256": self._file_sha256(screenshot_path),
                    "statePath": str(state_path),
                    "stateSha256": self._file_sha256(state_path),
                },
            })
        for index, action in enumerate(cleanup_actions or [], start=1):
            screenshot_path = self._write_step_screenshot(workflow_dir / f"cleanup-{index:02d}.png", f"cleanup-{action}", len(steps) + index)
            state_path = workflow_dir / f"cleanup-{index:02d}.json"
            state_payload = self._step_state_payload("Clean Lines")
            state_payload["action"] = action
            state_path.write_text(json.dumps(state_payload, indent=2), encoding="utf-8")
            events.append({
                "kind": "cleanup-action",
                "action": action,
                "evidence": {
                    "screenshotPath": str(screenshot_path),
                    "screenshotSha256": self._file_sha256(screenshot_path),
                    "statePath": str(state_path),
                    "stateSha256": self._file_sha256(state_path),
                },
            })
        log_path = workflow_dir / "provider-log.json"
        log_payload = {
            "schemaVersion": 1,
            "requests": [
                {"url": f"http://127.0.0.1:5173{endpoint}", "method": "POST"}
                for endpoint in provider_request_endpoints or []
            ],
        }
        log_path.write_text(json.dumps(log_payload, indent=2), encoding="utf-8")
        events.append({
            "kind": "provider-log",
            "evidence": {
                "logPath": str(log_path),
                "logSha256": self._file_sha256(log_path),
            },
        })
        return {"events": events}

    def _step_state_payload(
        self,
        step: str,
        *,
        svg_path: Path | None = None,
        pdf_path: Path | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "schemaVersion": 1,
            "step": step,
            "visibleLabel": {
                "Upload": "Upload step",
                "Clean Lines": "Clean Lines workspace",
                "Colors": "Colors workspace",
                "Export": "Export workspace",
            }[step],
            "primaryAction": {
                "Upload": "Generate Template",
                "Clean Lines": "Looks Good - Continue to Colors",
                "Colors": "Continue to Export",
                "Export": "Download Printable PDF",
            }[step],
        }
        if step == "Clean Lines":
            payload["inputReadiness"] = "Ready line art"
        if step == "Export" and svg_path is not None and pdf_path is not None:
            payload["outputs"] = [
                self._output_descriptor("svg", svg_path),
                self._output_descriptor("pdf", pdf_path),
            ]
        return payload

    def _write_step_screenshot(self, destination: Path, label: str, variant: int) -> Path:
        image = Image.new("RGB", (960, 640), "white")
        draw = ImageDraw.Draw(image)
        accent = ((variant * 53) % 255, (variant * 97) % 255, (variant * 149) % 255)
        draw.rectangle((24, 24, 936, 616), outline=accent, width=10)
        draw.rectangle((60, 80, 900, 150), fill=(245, 245, 245), outline=(40, 40, 40), width=3)
        draw.text((80, 100), label, fill=(0, 0, 0))
        for row in range(0, 10):
            y = 190 + row * 36
            draw.line((80, y, 880, y + (variant % 5) * 4), fill=((accent[0] + row * 7) % 255, 40, (accent[2] + row * 13) % 255), width=3)
        image.save(destination, format="PNG")
        return destination

    def _output_descriptor(self, kind: str, path: Path) -> dict[str, object]:
        payload = path.read_bytes()
        return {
            "kind": kind,
            "path": str(path),
            "sha256": hashlib.sha256(payload).hexdigest().upper(),
            "bytes": len(payload),
        }

    def _file_sha256(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest().upper()

    def _slug(self, value: str) -> str:
        return value.lower().replace(" ", "-")

    def _write_contaminated_trace_pdf(self, destination: Path) -> Path:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas

        destination.parent.mkdir(parents=True, exist_ok=True)
        grayscale = Image.new("RGB", (612, 792), "white")
        grayscale_draw = ImageDraw.Draw(grayscale)
        grayscale_draw.rectangle((120, 120, 492, 672), outline="black", width=8)
        grayscale_draw.line((150, 180, 462, 620), fill="black", width=6)
        color = Image.new("RGB", (120, 120), (255, 0, 0))
        ImageDraw.Draw(color).ellipse((20, 20, 100, 100), fill=(0, 180, 255))

        destination.parent.mkdir(parents=True, exist_ok=True)
        pdf = canvas.Canvas(str(destination), pagesize=letter)
        pdf.drawString(40, 760, "Trace pages: 1 columns x 1 rows (1 pages)")
        pdf.showPage()
        pdf.drawImage(ImageReader(grayscale), 0, 0, width=612, height=792, mask="auto")
        pdf.drawImage(ImageReader(color), 430, 620, width=120, height=120, mask="auto")
        pdf.drawString(40, 760, "Selection Inspector")
        pdf.showPage()
        pdf.save()
        return destination

    def _write_rendered_trace_page(self, destination: Path, *, color: bool) -> Path:
        image = Image.new("RGB", (612, 792), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((120, 120, 492, 672), outline="black", width=8)
        if color:
            draw.rectangle((430, 620, 550, 740), fill=(255, 0, 0))
        image.save(destination, format="PNG")
        return destination


class CharacterAcceptanceFixtureTest(unittest.TestCase):
    def test_max_profile_passes_with_locally_built_artifacts(self) -> None:
        profile = load_character_acceptance_profile(FIXTURES_DIR / "max" / "character-acceptance-profile.v1.json")
        source_bytes = (FIXTURES_DIR / "max" / "Max-from-the-Grinch-movie.webp").read_bytes()
        settings = TemplateSettings(
            finished_height_in=24,
            smoothing=4,
            minimum_tile_cols=2,
            minimum_tile_rows=4,
        )
        analysis = analyze_template(source_bytes, settings)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            svg_path = tmp_path / "max.svg"
            pdf_path = tmp_path / "max.pdf"
            accepted_detail_path = tmp_path / "accepted-detail.png"
            source_path = tmp_path / profile.source.filename
            source_path.write_bytes(source_bytes)
            accepted_detail_path.write_bytes(analysis.detail_line_png)
            pdf_path.write_bytes(build_template_pdf(source_bytes, settings, edited_detail_png=analysis.detail_line_png))
            svg_path.write_text(self._fixture_svg(analysis.outer_cut_path, analysis.detail_line_png, 414, 960, 10.36, 24), encoding="utf-8")

            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "max-local",
                "sourceImage": str(source_path),
                "acceptedDetailPng": str(accepted_detail_path),
                "svg": str(svg_path),
                "pdf": str(pdf_path),
                "workflowEvidence": CharacterAcceptanceProfileTest()._workflow_evidence(
                    tmp_path,
                    ["Upload", "Clean Lines", "Colors", "Export"],
                    svg_path=svg_path,
                    pdf_path=pdf_path,
                ),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

        self.assertEqual(result["overallStatus"], "passed")
        self.assertTrue(all(entry["status"] == "passed" for entry in result["baseline"]))

    def test_synthetic_profile_passes_with_locally_built_artifacts(self) -> None:
        profile = load_character_acceptance_profile(
            FIXTURES_DIR / "synthetic_character" / "character-acceptance-profile.v1.json"
        )
        source_bytes = (FIXTURES_DIR / "synthetic_character" / "synthetic-character-source.png").read_bytes()
        settings = TemplateSettings(finished_height_in=18, detail_extraction_mode="lineArt")
        analysis = analyze_template(source_bytes, settings)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            svg_path = tmp_path / "synthetic.svg"
            pdf_path = tmp_path / "synthetic.pdf"
            generated_detail_path = tmp_path / "generated-detail.png"
            source_path = tmp_path / profile.source.filename
            source_path.write_bytes(source_bytes)
            generated_detail_path.write_bytes(analysis.detail_line_png)
            pdf_path.write_bytes(build_template_pdf(source_bytes, settings, edited_detail_png=analysis.detail_line_png))
            svg_path.write_text(self._fixture_svg(analysis.outer_cut_path, analysis.detail_line_png, analysis.preview_width_px, analysis.preview_height_px, analysis.finished_width_in, 18), encoding="utf-8")

            artifact_set = build_artifact_set({
                "schemaVersion": 1,
                "artifactSetId": "synthetic-local",
                "sourceImage": str(source_path),
                "generatedDetailPng": str(generated_detail_path),
                "acceptedDetailPng": str(generated_detail_path),
                "svg": str(svg_path),
                "pdf": str(pdf_path),
                "workflowEvidence": CharacterAcceptanceProfileTest()._workflow_evidence(
                    tmp_path,
                    ["Upload", "Clean Lines", "Colors", "Export"],
                    svg_path=svg_path,
                    pdf_path=pdf_path,
                ),
            }, base_path=tmp_path)

            result = validate_character_acceptance(profile, artifact_set)

        self.assertEqual(result["overallStatus"], "passed")

    def _fixture_svg(
        self,
        cut_path: str,
        detail_png: bytes,
        preview_width: int,
        preview_height: int,
        finished_width_in: float,
        finished_height_in: float,
    ) -> str:
        import base64

        encoded_detail = base64.b64encode(detail_png).decode("ascii")
        return "\n".join([
            '<svg xmlns="http://www.w3.org/2000/svg"',
            f' width="{finished_width_in:.2f}in" height="{finished_height_in:.2f}in" viewBox="0 0 {preview_width} {preview_height}">',
            f'  <path id="cutline-layer" d="{cut_path}" fill="none" stroke="#000000" stroke-width="3"/>',
            f'  <image id="accepted-detail-layer" href="data:image/png;base64,{encoded_detail}" x="0" y="0" width="{preview_width}" height="{preview_height}" opacity="1" preserveAspectRatio="none"/>',
            "</svg>",
        ])


if __name__ == "__main__":
    unittest.main()
