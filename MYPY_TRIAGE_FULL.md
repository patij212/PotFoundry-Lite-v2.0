MYPY_TRIAGE_FULL - Complete mypy report and actionable plan

Status: DRAFT
Branch: fix/edgeflow-debug-quick

Last updated: 2025-10-21

Purpose
- This file contains the complete mypy output captured from running `mypy --ignore-missing-imports .` in the repo root, plus a per-file triage, suggested fixes, risk/ETA estimates, and a fine-grained task list ready to execute.
- This is intended to augment `MYPY_TRIAGE.md` with the full, actionable plan you asked for. I will keep this file updated as I make changes and will log commits and results here.

Guidelines I will follow
- Apply small, test-backed commits. Re-run mypy and pytest after each commit or small batch.
- Where a full typed refactor is large (geometry, app.py), prefer incremental improvements and narrow `# type: ignore[...]` only if needed, with commented justification.
- Respect docs: READMEs and DEVELOPMENT.md for how work should be performed (branching, commit messages, tests).

---

Full mypy output (verbatim, from mypy_full_output.txt):

pfui\yaml_tools.py:22: error: Returning Any from function declared to return "str"  [no-any-return]
tmp_append_synth.py:35: error: "object" has no attribute "append"  [attr-defined]
tools\inspect_probe_zi.py:48: error: Incompatible types in assignment (expression has type "reversed[str]", variable has type "list[str]")  [assignment]
tools\inspect_edgeflow_zi42.py:20: error: Argument 2 to "zip" has incompatible type "Any | None"; expected "Iterable[Any]"  [arg-type]
tools\inspect_edgeflow_zi42.py:37: error: Value of type "Any | None" is not indexable  [index]
tools\inspect_edgeflow_zi42.py:39: error: Incompatible types in assignment (expression has type "dict[str, Any]", variable has type "str")  [assignment]
tools\inspect_edgeflow_zi42.py:40: error: Invalid index type "str" for "str"; expected "SupportsIndex | slice[Any, Any, Any]"  [index]
tools\edgeflow_make_compare.py:30: error: Incompatible types in assignment (expression has type "reversed[Any]", variable has type "list[Any]")  [assignment]
tools\analyze_edgeflow_probes.py:51: error: List comprehension has incompatible type List[int | str]; expected List[int]  [misc]
tools\analyze_edgeflow_probes.py:63: error: Argument 1 to "append" of "list" has incompatible type "tuple[int, int]"; expected "tuple[None, int]"  [arg-type]
tools\analyze_edgeflow_probes.py:67: error: Argument 1 to "append" of "list" has incompatible type "tuple[int, int]"; expected "tuple[None, int]"  [arg-type]
pfui\schemas.py:1693: error: Incompatible types in assignment (expression has type "MappingProxyType[str, str]", variable has type "dict[str, str]")  [assignment]
pfui\schemas.py:1694: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, str]]", variable has type "dict[str, dict[str, str]]")  [assignment]
pfui\schemas.py:1697: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, Any]]", variable has type "dict[str, dict[str, Any]]")  [assignment]
pfui\schemas.py:1698: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, MappingProxyType[str, Any]]]", variable has type "dict[str, dict[str, dict[str, Any]]]")  [assignment]
pfui\schemas.py:1699: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, Any]]", variable has type "dict[str, dict[str, Any]]")  [assignment]
pfui\schemas.py:1700: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, MappingProxyType[str, Any]]]", variable has type "dict[str, dict[str, dict[str, Any]]]")  [assignment]
pfui\schemas.py:1760: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:1760: error: Argument 1 to "dict" has incompatible type "dict[str, dict[str, Any]]"; expected "SupportsKeysAndGetItem[str, ControlMeta]"  [arg-type]
pfui\schemas.py:1760: note: Error code "arg-type" not covered by "type: ignore" comment
pfui\schemas.py:1763: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:1763: error: Argument 1 to "dict" has incompatible type "dict[str, dict[str, Any]]"; expected "SupportsKeysAndGetItem[str, ControlMeta]"  [arg-type]
pfui\schemas.py:1763: note: Error code "arg-type" not covered by "type: ignore" comment
pfui\schemas.py:1764: error: Argument 1 to "update" of "MutableMapping" has incompatible type "dict[str, dict[str, Any]]"; expected "SupportsKeysAndGetItem[str, ControlMeta]"  [arg-type]
pfui\schemas.py:1878: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:1880: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:2040: error: Incompatible types in assignment (expression has type "MappingProxyType[str, str]", variable has type "dict[str, str]")  [assignment]
pfui\schemas.py:2041: error: Incompatible types in assignment (expression has type "MappingProxyType[str, MappingProxyType[str, str]]", variable has type "dict[str, dict[str, str]]")  [assignment]
pfui\schemas.py:2047: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:2047: error: Incompatible types in assignment (expression has type "MappingProxyType[Any, Any]", variable has type "dict[str, dict[str, Any]]")  [assignment]
pfui\schemas.py:2047: note: Error code "assignment" not covered by "type: ignore" comment
pfui\schemas.py:2048: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:2048: error: Incompatible types in assignment (expression has type "MappingProxyType[Any, Any]", variable has type "dict[str, dict[str, dict[str, Any]]]")  [assignment]
pfui\schemas.py:2048: note: Error code "assignment" not covered by "type: ignore" comment
pfui\schemas.py:2049: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:2049: error: Incompatible types in assignment (expression has type "MappingProxyType[Any, Any]", variable has type "dict[str, dict[str, Any]]")  [assignment]
pfui\schemas.py:2049: note: Error code "assignment" not covered by "type: ignore" comment
pfui\schemas.py:2050: error: Unused "type: ignore" comment  [unused-ignore]
pfui\schemas.py:2050: error: Incompatible types in assignment (expression has type "MappingProxyType[Any, Any]", variable has type "dict[str, dict[str, dict[str, Any]]]")  [assignment]
tools\inspect_edge_flow_debug.py:65: error: Incompatible types in assignment (expression has type "tuple[int, Any, int, int]", variable has type "tuple[int, Any, Any]")  [assignment]
potfoundry\schema.py:67: error: Function is missing a return type annotation  [no-untyped-def]
potfoundry\schema.py:87: error: Argument "default_factory" to "Field" has incompatible type "type[MeshQualityModel]"; expected "Callable[[], Never] | Callable[[dict[str, Any]], Never]"  [arg-type]
potfoundry\schema.py:138: error: Unsupported target for indexed assignment ("object")  [index]
potfoundry\schema.py:146: error: "object" has no attribute "append"  [attr-defined]
pfui\colors.py:65: error: Statement is unreachable  [unreachable]
tests\test_stl_binary.py:11: error: Argument 3 to "write_stl_binary" has incompatible type "ndarray[tuple[Any, ...], dtype[floating[_32Bit]]]"; expected "ndarray[tuple[Any, ...], dtype[float64]]"  [arg-type]
potfoundry\integrations\supabase_client.py:102: error: Library stubs not installed for "requests"  [import-untyped]
potfoundry\integrations\supabase_client.py:163: error: Statement is unreachable  [unreachable]
potfoundry\integrations\supabase_client.py:213: error: Statement is unreachable  [unreachable]
potfoundry\integrations\supabase_client.py:255: error: Statement is unreachable  [unreachable]
potfoundry\integrations\supabase_client.py:314: error: Statement is unreachable  [unreachable]
potfoundry\integrations\supabase_client.py:373: error: Returning Any from function declared to return "list[dict[str, Any]]"  [no-any-return]
potfoundry\integrations\supabase_client.py:399: error: Statement is unreachable  [unreachable]
potfoundry\integrations\supabase_client.py:547: error: Incompatible types in assignment (expression has type "str | None", variable has type "str")  [assignment]
pfui\units.py:13: error: Returning Any from function declared to return "str"  [no-any-return]
pfui\units.py:23: error: Returning Any from function declared to return "str"  [no-any-return]
pfui\state_history.py:34: error: Unused "type: ignore" comment  [unused-ignore]
pfui\state.py:129: error: Argument 1 to "_deep_merge" has incompatible type "SessionStateProxy"; expected "dict[str, Any]"  [arg-type]
tests\pfui\test_state_history.py:10: error: Module has no attribute "session_state"  [attr-defined]
tests\pfui\test_state.py:11: error: Module has no attribute "session_state"  [attr-defined]
scripts\delete_library_rows.py:56: error: List comprehension has incompatible type List[Any | None]; expected List[str]  [misc]
potfoundry\geometry.py:90: error: Returning Any from function declared to return "float"  [no-any-return]
potfoundry\geometry.py:170: error: Returning Any from function declared to return "float"  [no-any-return]
potfoundry\geometry.py:253: error: Returning Any from function declared to return "float"  [no-any-return]
potfoundry\geometry.py:271: error: Returning Any from function declared to return "float"  [no-any-return]
potfoundry\geometry.py:352: error: Value of type variable "_ScalarT" of "array" cannot be "float"  [type-var]
potfoundry\geometry.py:352: error: "None" not callable  [misc]
potfoundry\geometry.py:375: error: Value of type variable "_ScalarT" of "array" cannot be "float"  [type-var]
potfoundry\geometry.py:375: error: "None" not callable  [misc]
potfoundry\geometry.py:376: error: Unsupported operand types for - ("ndarray[tuple[Any, ...], dtype[float]]" and "float")  [operator]
potfoundry\geometry.py:414: error: Incompatible types in assignment (expression has type "ndarray[tuple[Any, ...], dtype[Any]]", variable has type "list[int]")  [assignment]
potfoundry\geometry.py:415: error: Incompatible types in assignment (expression has type "ndarray[tuple[Any, ...], dtype[Any]]", variable has type "list[int]")  [assignment]
potfoundry\geometry.py:424: error: No overload variant of "zip" matches argument types "Any", "int", "int"  [call-overload]
... (truncated here; the full dump is in mypy_full_output.txt)

---

Per-file triage, recommended fixes, risk, and ETA

---

Group A — Immediate low-risk quick wins (Batch 1)
These are small changes that will cut down noise quickly. I'll do these first, one commit per change.

A1) tools/edgeflow_make_compare.py
- Errors: reversed assigned to list (Incompatible types in assignment)
- Fix: change assignment to use list(reversed(...)) or wrap result with list() where a list is expected. Add typing Optional where `None` is expected (if applicable).
- ETA: 5–15 minutes. Risk: very low.
- Task: T-A1 apply small edit, run mypy+pytest, commit with message "fix(tools): list(...) for reversed in edgeflow_make_compare"

A2) tools/inspect_probe_zi.py and tools/inspect_edgeflow_zi42.py
- Errors: reversed->list, optional zip arguments, index on Any|None
- Fix: annotate variables Optional[Iterable[...]] and guard; ensure zip receives Iterable (use or [] fallback).
- ETA: 10–30 minutes combined. Risk: very low.
- Task: T-A2 commit per file.

A3) tools/analyze_edgeflow_probes.py
- Errors: list comprehension element type mismatches; append type mismatch
- Fix: adjust comprehension to produce homogeneous list types (cast or change expected types); fix .append() argument types or update declared container type.
- ETA: 15–30 minutes. Risk: low.
- Task: T-A3 small commit, tests.

A4) tools/inspect_edge_flow_debug.py
- Errors: tuple length/type mismatch
- Fix: correct tuple annotation or adjust constructed tuple to match annotated type.
- ETA: 5–15 minutes.
- Task: T-A4 commit.

A5) Install missing stubs: types-requests
- Command: pip install types-requests (in venv)
- ETA: 2–10 minutes.
- Task: T-A5 run install, re-run mypy.

---

Group B — pfui modules and small infra (Batch 2)
These require slightly larger attention but are still straightforward.

B1) pfui/schemas.py
- Errors: MappingProxyType -> dict assignment mismatches; unused type: ignore
- Fix: where MappingProxyType is used, change variable annotations to Mapping[str, ...] or convert MappingProxy->dict using dict(...). Remove unused type: ignore comments. Add narrow type annotations for ControlMeta where possible.
- ETA: 1–3 hours. Risk: low.
- Tasks: T-B1.1 convert proxys to Mapping where safe; T-B1.2 remove unused ignores.

B2) pfui/preview.py and pfui/controls.py
- Errors: return dtypes (ndarray float64 expected), None vs bytes, float->int assignment.
- Fix: use numpy.typing.NDArray[np.float64], coerce with np.asarray(..., dtype=np.float64), explicit int() conversions where code expects ints.
- ETA: 1–3 hours. Risk: low–medium.
- Tasks: T-B2 per file commits.

B3) pfui/imports.py and pfui/* unused type-ignore sweep
- Fix: remove unused ignores; add explicit typing where helpful.
- ETA: 30–90 minutes.

---

Group C — Core numeric modules (Batch 3)
Large and sensitive. I'll approach conservatively with small commits.

C1) potfoundry/core/geometry.py
- Errors: many ndarray vs float mismatches, returns of Any, untyped locals, name-before-definition
- Fix approach:
  - Add local annotations: e.g., R_raw: np.ndarray; s_tw: np.ndarray[int]; origin_map: np.ndarray[int]
  - Replace ambiguous initializations (e.g., est_top_od = None) with Optional[float] and guard before use
  - For ndarrays that are used with .append(), switch to Python lists during accumulation and convert to ndarray at end OR use np.concatenate appropriately.
  - Use numpy.typing.NDArray and typing.Optional in function annotations.
- ETA: initial triage 2–6h; full cleanup longer. Risk: medium — rely on tests to catch regressions.
- Tasks: T-C1.1 annotate locals in the edgeflow block; T-C1.2 fix list-vs-ndarray append issues; T-C1.3 narrow any-return functions.

C2) potfoundry/geometry.py
- Similar numeric issues. Do targeted fixes as above.
- ETA: 1–4h. Risk: medium.

---

Group D — Schema/API/integrations/tests (Batch 4)

D1) potfoundry/schema.py and yaml_api.py
- Errors: missing return types, default_factory type mismatches, missing typing imports (Tuple)
- Fix: add return type annotations, wrap default_factory in lambda if required by Field, add typing imports and small signature adjustments.
- ETA: 30–90 minutes. Risk: low.

D2) potfoundry/integrations/supabase_client.py
- Errors: missing stubs for requests, unreachable statements, returning Any
- Fix: install types-requests; annotate return types, and remove/guard unreachable code paths.
- ETA: 30–120 minutes. Risk: medium.

D3) tests/* adjustments
- Fix session_state tests by importing or mocking session_state; adjust dtype expectations in tests to match actual outputs or coerce outputs with .astype.
- ETA: 30–120 minutes. Risk: low.

---

Execution plan (detailed)
- Phase 1 (Batch 1):
  1) Install types stubs: pip install types-requests
  2) Fix tools/edgeflow_make_compare.py (commit)
  3) Fix tools/inspect_probe_zi.py (commit)
  4) Fix tools/inspect_edgeflow_zi42.py (commit)
  5) Fix tools/analyze_edgeflow_probes.py (commit)
  6) Fix tools/inspect_edge_flow_debug.py (commit)
  7) Re-run mypy and pytest; capture results in this file and `mypy_full_output.txt`.
  - Expected impact: reduce mypy errors by ~10–30, mostly small tools.

- Phase 2 (Batch 2):
  - Tackle pfui/* (schemas, preview, controls), remove unused type: ignore comments. Commit after each file.

- Phase 3 (Batch 3):
  - Incrementally fix geometry modules with narrow changes and local annotations.

- Phase 4 (Batch 4):
  - Fix integrations, scripts and tests.

- Phase 5 (Batch 5):
  - Tackle app.py and remaining high-risk items.

Each commit will be recorded in this file with:
- date/time, commit SHA, short description, mypy/pytest results after commit, notes.

---

Immediate next actions I will perform when you reply "Start Batch 1":
1) Install missing stubs into the activated venv: `pip install types-requests`
2) Make each tools/ file fix in a separate commit and run mypy+pytest after each commit.
3) Update this file and `MYPY_TRIAGE.md` with the results (commit SHAs and updated error counts).

If you'd like a different order, tell me which file or batch to prioritize.

---

Appendix: helper commands I'll run (in PowerShell; venv already activated)

# install a stub package
pip install types-requests

# run mypy and save output
mypy --show-error-codes --ignore-missing-imports . | tee mypy_full_output.txt

# run tests
pytest -q

---

Change log
- [2025-10-21] Created MYPY_TRIAGE_FULL.md with full mypy output and detailed triage plan.


