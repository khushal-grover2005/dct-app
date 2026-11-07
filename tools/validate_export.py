#!/usr/bin/env python3
"""Validate an asset export against a consented list (data contract v1).

Implements every rule in docs/consent-tagging/data-contract.md §3.
Standard library only; Python 3.9 or later.

Usage:
    python validate_export.py --list consented_list.csv --export asset_export.csv
    python validate_export.py --list L.csv --export E.csv --json        # machine-readable report
    python validate_export.py --list L.csv --export E.csv --now 2026-11-04T12:00:00Z

Exit status: 0 = no errors (warnings allowed), 1 = errors found, 2 = a file could not be read.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone

CONTRACT_VERSION = 1

LIST_COLUMNS = {
    "project_id", "project_name", "person_id", "consent_id", "display_name", "contact_hint",
    "consent_expires_at", "is_minor", "list_generated_at", "list_valid_until",
}
EXPORT_COLUMNS = {
    "export_id", "exported_at", "collection_ref", "project_id", "asset_id", "asset_type",
    "captured_at", "content_sha256", "row_type", "person_id", "consent_id", "bystander_count",
}
ASSET_TYPES = {"image", "video", "audio", "sensor", "document", "other"}
ROW_TYPES = {"person", "bystander", "no_person", "deleted"}

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$")


@dataclass
class Finding:
    code: str
    message: str
    line: int | None = None      # line number in the export file (header = 1)
    asset_id: str | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class Report:
    errors: list[Finding] = field(default_factory=list)
    warnings: list[Finding] = field(default_factory=list)
    rows: int = 0
    assets: int = 0
    held_assets: list[str] = field(default_factory=list)

    def error(self, code: str, message: str, line: int | None = None, asset_id: str | None = None) -> None:
        self.errors.append(Finding(code, message, line, asset_id))

    def warn(self, code: str, message: str, line: int | None = None, asset_id: str | None = None) -> None:
        self.warnings.append(Finding(code, message, line, asset_id))


def parse_ts(value: str) -> datetime | None:
    if not TS_RE.match(value or ""):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def read_csv(path: str) -> tuple[list[str], list[dict[str, str]]]:
    with open(path, newline="", encoding="utf-8") as fh:
        text = fh.read()
    if text.startswith("﻿"):
        raise ValueError(f"{path}: file starts with a byte-order mark; save as UTF-8 without BOM")
    reader = csv.DictReader(text.splitlines())
    header = [h.strip() for h in (reader.fieldnames or [])]
    rows = [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]
    return header, rows


def load_list(path: str, report: Report) -> tuple[str | None, datetime | None, dict[str, dict[str, str]]]:
    header, rows = read_csv(path)
    missing = LIST_COLUMNS - set(header)
    if missing:
        report.error("L01", f"consented list is missing columns: {', '.join(sorted(missing))}")
        return None, None, {}
    projects = {r["project_id"] for r in rows}
    if len(projects) != 1:
        report.error("L02", f"consented list must hold exactly one project_id, found {len(projects)}")
        return None, None, {}
    valid_until = {r["list_valid_until"] for r in rows}
    if len(valid_until) != 1 or parse_ts(next(iter(valid_until))) is None:
        report.error("L03", "consented list must carry one valid list_valid_until on every row")
        return None, None, {}
    people: dict[str, dict[str, str]] = {}
    for r in rows:
        if r["person_id"] in people:
            report.error("L04", f"person_id {r['person_id']} appears twice in the consented list")
        people[r["person_id"]] = r
    return next(iter(projects)), parse_ts(next(iter(valid_until))), people


def validate(list_path: str, export_path: str, now: datetime) -> Report:
    report = Report()
    project_id, list_valid_until, people = load_list(list_path, report)
    if report.errors:
        return report

    header, rows = read_csv(export_path)
    report.rows = len(rows)
    cols = set(header)
    if EXPORT_COLUMNS - cols:
        report.error("E01", f"missing columns: {', '.join(sorted(EXPORT_COLUMNS - cols))}")
    if cols - EXPORT_COLUMNS:
        report.error("E01", f"unknown columns: {', '.join(sorted(cols - EXPORT_COLUMNS))}")
    if report.errors:
        return report

    # file-level constants (E14) and project (E03)
    for col in ("export_id", "exported_at", "collection_ref"):
        values = {r[col] for r in rows}
        if len(values) > 1:
            report.error("E14", f"{col} differs between rows: {', '.join(sorted(values))}")
    seen_project_mismatch = False

    by_asset: dict[str, list[tuple[int, dict[str, str]]]] = {}
    for i, r in enumerate(rows, start=2):
        a = r["asset_id"]
        by_asset.setdefault(a, []).append((i, r))

        # identifiers
        for col in ("export_id", "project_id"):
            if not UUID_RE.match(r[col]):
                report.error("E02", f"{col} is not a lowercase UUID: {r[col]!r}", i, a)
        if r["project_id"] != project_id and not seen_project_mismatch:
            report.error("E03", f"project_id {r['project_id']} does not match the consented list "
                                f"({project_id})", i, a)
            seen_project_mismatch = True
        if not a:
            report.error("E09", "asset_id is empty", i)

        # timestamps
        captured = parse_ts(r["captured_at"])
        if captured is None:
            report.error("E13", f"captured_at is not ISO 8601 UTC with Z: {r['captured_at']!r}", i, a)
        elif captured > now:
            report.error("E13", f"captured_at {r['captured_at']} is in the future", i, a)
        if parse_ts(r["exported_at"]) is None:
            report.error("E13", f"exported_at is not ISO 8601 UTC with Z: {r['exported_at']!r}", i, a)

        # type and hash
        if r["asset_type"] not in ASSET_TYPES:
            report.error("E12", f"asset_type {r['asset_type']!r} is not one of {sorted(ASSET_TYPES)}", i, a)
        if r["content_sha256"] and not SHA_RE.match(r["content_sha256"]):
            report.error("E15", "content_sha256 is not 64 lowercase hex characters", i, a)

        # row-type shape (E09)
        rt = r["row_type"]
        pid, cid, bc = r["person_id"], r["consent_id"], r["bystander_count"]
        if rt not in ROW_TYPES:
            report.error("E09", f"row_type {rt!r} is not one of {sorted(ROW_TYPES)}", i, a)
            continue
        if rt == "person":
            if not pid or not cid or bc:
                report.error("E09", "a person row needs person_id and consent_id and an empty "
                                    "bystander_count", i, a)
                continue
            for col, v in (("person_id", pid), ("consent_id", cid)):
                if not UUID_RE.match(v):
                    report.error("E02", f"{col} is not a lowercase UUID: {v!r}", i, a)
            entry = people.get(pid)
            if entry is None:
                report.error("E04", f"person_id {pid} is not on the consented list", i, a)
                continue
            if entry["consent_id"] != cid:
                report.error("E05", f"consent_id {cid} does not belong to person_id {pid}", i, a)
            if entry["is_minor"].lower() == "true":
                report.error("E06", f"person_id {pid} is a minor and cannot be tagged", i, a)
            expires = parse_ts(entry["consent_expires_at"]) if entry["consent_expires_at"] else None
            if captured and expires and captured >= expires:
                report.error("E07", f"consent {cid} expired at {entry['consent_expires_at']}, "
                                    f"before capture", i, a)
            if captured and list_valid_until and captured > list_valid_until:
                report.error("E08", f"captured_at is after the list's list_valid_until "
                                    f"({list_valid_until.isoformat().replace('+00:00', 'Z')})", i, a)
        elif rt == "bystander":
            if pid or cid or not bc.isdigit() or int(bc) < 1:
                report.error("E09", "a bystander row needs empty person_id and consent_id and a "
                                    "bystander_count of 1 or more", i, a)
        else:  # no_person, deleted
            if pid or cid or bc:
                report.error("E09", f"a {rt} row needs empty person_id, consent_id and bystander_count", i, a)

    # per-asset rules
    report.assets = len(by_asset)
    for a, items in by_asset.items():
        types = [r["row_type"] for _, r in items]
        first_line = items[0][0]
        solo = [t for t in types if t in ("no_person", "deleted")]
        if solo and len(types) > 1:
            report.error("E11", f"a {solo[0]} row must be the only row for its asset", first_line, a)
        if types.count("bystander") > 1:
            report.error("E11", "more than one bystander row for the asset", first_line, a)
        if "bystander" in types and "person" not in types:
            report.error("E11", "a bystander row needs at least one person row; delete a file that "
                                "shows only people without consent", first_line, a)
        persons = [r["person_id"] for _, r in items if r["row_type"] == "person" and r["person_id"]]
        for p in sorted({p for p in persons if persons.count(p) > 1}):
            report.error("E10", f"person_id {p} appears more than once on the asset", first_line, a)
        for col in ("asset_type", "captured_at", "content_sha256"):
            if len({r[col] for _, r in items}) > 1:
                report.error("E16", f"rows of the asset disagree on {col}", first_line, a)
        if not items[0][1]["content_sha256"] and "deleted" not in types:
            report.warn("W01", "content_sha256 is empty", first_line, a)
        if "bystander" in types:
            report.held_assets.append(a)

    if report.held_assets:
        report.warn("W02", f"{len(report.held_assets)} asset(s) carry bystander rows and will be held: "
                           f"{', '.join(sorted(report.held_assets))}")
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate an asset export against a consented list.")
    ap.add_argument("--list", required=True, help="consented list CSV")
    ap.add_argument("--export", required=True, help="asset export CSV")
    ap.add_argument("--json", action="store_true", help="print a JSON report")
    ap.add_argument("--now", help="override the current time (ISO 8601 UTC), for tests")
    args = ap.parse_args(argv)

    now = parse_ts(args.now) if args.now else datetime.now(timezone.utc)
    if now is None:
        print("--now must be ISO 8601 UTC with Z", file=sys.stderr)
        return 2
    try:
        report = validate(args.list, args.export, now)
    except (OSError, ValueError, csv.Error) as exc:
        print(f"could not read input: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({
            "contract_version": CONTRACT_VERSION,
            "valid": not report.errors,
            "rows": report.rows, "assets": report.assets,
            "held_assets": sorted(report.held_assets),
            "errors": [f.as_dict() for f in report.errors],
            "warnings": [f.as_dict() for f in report.warnings],
        }, indent=2))
    else:
        for f in report.errors:
            where = f" line {f.line}" if f.line else ""
            asset = f" [{f.asset_id}]" if f.asset_id else ""
            print(f"ERROR   {f.code}{where}{asset}: {f.message}")
        for f in report.warnings:
            where = f" line {f.line}" if f.line else ""
            asset = f" [{f.asset_id}]" if f.asset_id else ""
            print(f"WARNING {f.code}{where}{asset}: {f.message}")
        verdict = "VALID" if not report.errors else "INVALID"
        print(f"{verdict}: {report.rows} rows, {report.assets} assets, "
              f"{len(report.errors)} errors, {len(report.warnings)} warnings")
    return 0 if not report.errors else 1


if __name__ == "__main__":
    sys.exit(main())
