"""Convert pytest JUnit XML (pytest-report.xml) into a compact JSON summary.

Usage:
    python .github/scripts/pytest_junit_summary.py pytest-report.xml pytest-summary.json

Output structure (pytest-summary.json):
{
  "tests": {"total": int, "errors": int, "failures": int, "skipped": int, "time": float},
  "suites": [ ... optional per-suite totals ... ],
  "slowest": [ {"nodeid": str, "time": float, "classname": str, "name": str}, ... ]
}

The script extracts testcase times and lists the top 10 slowest testcases.
"""
from __future__ import annotations

import json
import sys
from xml.etree import ElementTree as ET
from typing import List, Dict, Any


def parse_junit(path: str) -> Dict[str, Any]:
    tree = ET.parse(path)
    root = tree.getroot()

    # pytest writes <testsuite> at top (or <testsuites>). Handle both.
    suites = []
    if root.tag == "testsuites":
        suites = list(root.findall("testsuite"))
    elif root.tag == "testsuite":
        suites = [root]
    else:
        # Unexpected format -- try to find testsuite descendants
        suites = list(root.findall(".//testsuite"))

    total_tests = 0
    total_errors = 0
    total_failures = 0
    total_skipped = 0
    total_time = 0.0
    slow_entries: List[Dict[str, Any]] = []

    for s in suites:
        try:
            stests = int(s.attrib.get("tests", "0"))
        except Exception:
            stests = 0
        try:
            serrors = int(s.attrib.get("errors", "0"))
        except Exception:
            serrors = 0
        try:
            sfailures = int(s.attrib.get("failures", "0"))
        except Exception:
            sfailures = 0
        try:
            sskipped = int(s.attrib.get("skipped", "0"))
        except Exception:
            sskipped = 0
        try:
            stime = float(s.attrib.get("time", "0"))
        except Exception:
            stime = 0.0

        total_tests += stests
        total_errors += serrors
        total_failures += sfailures
        total_skipped += sskipped
        total_time += stime

        for tc in s.findall("testcase"):
            try:
                t = float(tc.attrib.get("time", "0"))
            except Exception:
                t = 0.0
            classname = tc.attrib.get("classname") or ""
            name = tc.attrib.get("name") or tc.attrib.get("testcase") or ""
            nodeid = f"{classname}::{name}" if classname else name
            slow_entries.append({"nodeid": nodeid, "time": t, "classname": classname, "name": name})

    # Sort slowest by time desc and pick top N
    slow_entries.sort(key=lambda x: x.get("time", 0.0), reverse=True)
    top_n = slow_entries[:10]

    return {
        "tests": {
            "total": total_tests,
            "errors": total_errors,
            "failures": total_failures,
            "skipped": total_skipped,
            "time": total_time,
        },
        "suites": [{
            "name": s.attrib.get("name", ""),
            "tests": int(s.attrib.get("tests", "0")),
            "time": float(s.attrib.get("time", "0")),
        } for s in suites],
        "slowest": top_n,
    }


def main(argv: List[str]):
    if len(argv) < 3:
        print("Usage: python pytest_junit_summary.py <input-junit-xml> <output-json>")
        return 2
    infile = argv[1]
    outfile = argv[2]

    try:
        summary = parse_junit(infile)
    except Exception as e:
        print(f"Failed to parse {infile}: {e}")
        return 3

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Wrote summary to {outfile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
