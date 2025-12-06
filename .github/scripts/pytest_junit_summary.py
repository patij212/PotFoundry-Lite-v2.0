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
from typing import Any
from xml.etree import ElementTree as ET


def parse_junit(path: str) -> dict[str, Any]:
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
    slow_entries: list[dict[str, Any]] = []

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

            # Attempt to guess source file from classname (module-like) -> path
            guessed_file = None
            if classname:
                candidate = classname.replace(".", "/") + ".py"
                # Prefer repository-relative path if exists
                try:
                    from pathlib import Path

                    p = Path(candidate)
                    if p.exists():
                        guessed_file = str(p)
                    else:
                        # Try tests/ prefix in case classname starts with test path
                        p2 = Path("tests") / Path(candidate)
                        if p2.exists():
                            guessed_file = str(p2)
                except Exception:
                    guessed_file = None

            # Extract any marker/property info attached specifically to this testcase
            markers: list[str] = []
            # pytest sometimes encodes markers/properties as attributes or children; gather anything useful
            for prop in tc.findall("properties/property"):
                pname = prop.attrib.get("name", "")
                if pname.startswith("marker") or pname.startswith("markers"):
                    markers.append(prop.attrib.get("value", ""))

            # Per-test captured stdout/stderr if present
            stdout = None
            stderr = None
            so = tc.find("system-out") or tc.find("system-out")
            se = tc.find("system-err") or tc.find("system-err")
            if so is not None and so.text:
                stdout = so.text
            if se is not None and se.text:
                stderr = se.text

            # Parameter parsing: try to extract parameter suffix like 'testname[param]' -> parameters='param'
            parameters = None
            if "[" in name and name.endswith("]"):
                try:
                    parameters = name[name.index("[") + 1 : -1]
                except Exception:
                    parameters = None

            slow_entries.append(
                {
                    "nodeid": nodeid,
                    "time": t,
                    "classname": classname,
                    "name": name,
                    "file": guessed_file,
                    "markers": markers,
                    "parameters": parameters,
                    "stdout": stdout,
                    "stderr": stderr,
                },
            )

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
        "suites": [
            {
                "name": s.attrib.get("name", ""),
                "tests": int(s.attrib.get("tests", "0")),
                "time": float(s.attrib.get("time", "0")),
            }
            for s in suites
        ],
        "slowest": top_n,
    }


def main(argv: list[str]):
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

    # Attach git sha if available (env or local git)
    sha = None
    try:
        import os

        sha = os.environ.get("GITHUB_SHA")
        if not sha:
            # fallback to git
            from subprocess import check_output

            sha = check_output(["git", "rev-parse", "HEAD"]).decode("utf-8").strip()
    except Exception:
        sha = None
    if sha:
        summary["git_sha"] = sha

    # Attach raw pytest output if available in cwd
    try:
        with open("pytest-output.txt", encoding="utf-8") as rf:
            raw = rf.read()
            summary["raw_output"] = raw
    except Exception:
        summary["raw_output"] = None

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Wrote summary to {outfile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
