"""Tests for validate_export.py — one case per rule, plus the samples as positive controls.

Run:  python -m unittest tools/test_validate_export.py      (from the repository root)
Standard library only.
"""

from __future__ import annotations

import csv
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_export import parse_ts, validate  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(HERE, "..", "docs", "consent-tagging", "examples")
LIST = os.path.join(EXAMPLES, "consented_list.sample.csv")
EXPORT = os.path.join(EXAMPLES, "asset_export.sample.csv")
CORRECTION = os.path.join(EXAMPLES, "asset_export.correction.sample.csv")
NOW = parse_ts("2026-11-05T12:00:00Z")

P1, C1 = "3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1", "9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101"
P2, C2 = "7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2", "1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202"
P3, C3 = "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03", "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f70303"   # consent expired 2026-11-03
P4, C4 = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04", "6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7080404"   # minor


def sample_rows() -> tuple[list[str], list[dict[str, str]]]:
    with open(EXPORT, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        return list(reader.fieldnames or []), list(reader)


def write_export(header: list[str], rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=header, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
        fh.write(buf.getvalue())
    return path


def codes(list_path: str, export_path: str) -> set[str]:
    r = validate(list_path, export_path, NOW)
    return {f.code for f in r.errors}


class Samples(unittest.TestCase):
    def test_sample_export_is_valid_and_holds_the_bystander_asset(self) -> None:
        r = validate(LIST, EXPORT, NOW)
        self.assertEqual(r.errors, [])
        self.assertEqual(r.held_assets, ["IMG-0002.png"])
        self.assertIn("W02", {w.code for w in r.warnings})
        self.assertEqual((r.rows, r.assets), (11, 8))

    def test_correction_sample_is_valid_and_holds_nothing(self) -> None:
        r = validate(LIST, CORRECTION, NOW)
        self.assertEqual(r.errors, [])
        self.assertEqual(r.held_assets, [])


class Rules(unittest.TestCase):
    def setUp(self) -> None:
        self.header, self.rows = sample_rows()

    def mutate(self, index: int, **changes: str) -> set[str]:
        rows = [dict(r) for r in self.rows]
        rows[index].update(changes)
        return codes(LIST, write_export(self.header, rows))

    def with_rows(self, rows: list[dict[str, str]], header: list[str] | None = None) -> set[str]:
        return codes(LIST, write_export(header or self.header, rows))

    def test_e01_missing_and_unknown_columns(self) -> None:
        header = [h for h in self.header if h != "consent_id"]
        rows = [{k: v for k, v in r.items() if k != "consent_id"} for r in self.rows]
        self.assertIn("E01", self.with_rows(rows, header))
        header = self.header + ["notes"]
        rows = [dict(r, notes="x") for r in self.rows]
        self.assertIn("E01", self.with_rows(rows, header))

    def test_e02_bad_uuid(self) -> None:
        self.assertIn("E02", self.mutate(0, person_id=P1.upper()))

    def test_e03_project_mismatch(self) -> None:
        self.assertIn("E03", self.mutate(0, project_id="00000000-0000-4000-8000-000000000000"))

    def test_e04_unknown_person(self) -> None:
        self.assertIn("E04", self.mutate(0, person_id="11111111-1111-4111-8111-111111111111"))

    def test_e05_consent_of_another_person(self) -> None:
        self.assertIn("E05", self.mutate(0, consent_id=C2))

    def test_e06_minor(self) -> None:
        self.assertIn("E06", self.mutate(0, person_id=P4, consent_id=C4))

    def test_e07_consent_expired_before_capture(self) -> None:
        self.assertIn("E07", self.mutate(0, person_id=P3, consent_id=C3))

    def test_e08_captured_after_list_valid_until(self) -> None:
        rows = [dict(r) for r in self.rows[:2]]
        for r in rows:
            r["captured_at"] = "2026-11-09T00:00:00Z"
        later = parse_ts("2026-11-10T00:00:00Z")
        r = validate(LIST, write_export(self.header, rows), later)
        self.assertIn("E08", {f.code for f in r.errors})

    def test_e09_row_shape(self) -> None:
        self.assertIn("E09", self.mutate(0, consent_id=""))
        self.assertIn("E09", self.mutate(3, bystander_count="0"))
        self.assertIn("E09", self.mutate(5, person_id=P1))
        self.assertIn("E09", self.mutate(0, row_type="someone"))

    def test_e10_same_person_twice_on_an_asset(self) -> None:
        self.assertIn("E10", self.mutate(1, person_id=P1, consent_id=C1))

    def test_e11_asset_composition(self) -> None:
        extra = dict(self.rows[5], row_type="deleted")             # no_person + deleted on IMG-0004.png
        self.assertIn("E11", self.with_rows(self.rows + [extra]))
        extra = dict(self.rows[3])                                   # second bystander row on IMG-0002
        self.assertIn("E11", self.with_rows(self.rows + [extra]))
        lone = [r for r in self.rows if not (r["asset_id"] == "IMG-0002.png" and r["row_type"] == "person")]
        self.assertIn("E11", self.with_rows(lone))                   # bystander with no person row

    def test_e12_asset_type(self) -> None:
        self.assertIn("E12", self.mutate(5, asset_type="lidar"))

    def test_e13_timestamps(self) -> None:
        self.assertIn("E13", self.mutate(5, captured_at="2026-11-04 06:30:00"))
        self.assertIn("E13", self.mutate(5, captured_at="2027-01-01T00:00:00Z"))

    def test_e14_file_constants(self) -> None:
        self.assertIn("E14", self.mutate(5, collection_ref="OTHER"))

    def test_e15_hash_format(self) -> None:
        self.assertIn("E15", self.mutate(5, content_sha256="ABC"))

    def test_e16_asset_rows_disagree(self) -> None:
        self.assertIn("E16", self.mutate(1, captured_at="2026-11-04T06:02:12Z"))

    def test_w01_missing_hash_is_a_warning_not_an_error(self) -> None:
        rows = [dict(r) for r in self.rows]
        rows[5]["content_sha256"] = ""
        r = validate(LIST, write_export(self.header, rows), NOW)
        self.assertEqual(r.errors, [])
        self.assertIn("W01", {w.code for w in r.warnings})


class GoldenCases(unittest.TestCase):
    """Every file in examples/golden/ gives exactly the codes in expected.json.

    The DCT app's TypeScript validator runs the same cases (see app-design.md §6), so the two
    implementations cannot drift apart.
    """

    def test_golden_cases(self) -> None:
        import json
        golden = os.path.join(EXAMPLES, "golden")
        with open(os.path.join(golden, "expected.json"), encoding="utf-8") as fh:
            spec = json.load(fh)
        list_path = os.path.normpath(os.path.join(golden, spec["list"]))
        self.assertGreaterEqual(len(spec["cases"]), 18)
        for name, want in spec["cases"].items():
            with self.subTest(case=name):
                r = validate(list_path, os.path.join(golden, name), parse_ts(want["now"]))
                self.assertEqual(sorted({f.code for f in r.errors}), want["error_codes"])
                self.assertEqual(sorted({f.code for f in r.warnings}), want["warning_codes"])


if __name__ == "__main__":
    unittest.main()
