"""Optional WebGPU asset validation hooks.

These tests remain skipped unless ``PF_RUN_WEBGPU_VALIDATORS=1`` is present in
``os.environ``. They invoke external tooling (WGSL analyzers, ``tsc``, and
``eslint``) when available, skipping gracefully when prerequisites are
missing.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT_DIR / "pfui" / "preview" / "assets"
WGSL_PATH = ASSETS_DIR / "pot_preview.wgsl"
TS_PATH = ASSETS_DIR / "webgpu_preview.ts"
TS_CONFIG = ROOT_DIR / "tsconfig.json"

PF_RUN_WEBGPU_VALIDATORS = os.getenv("PF_RUN_WEBGPU_VALIDATORS") == "1"
pytestmark = pytest.mark.skipif(
    not PF_RUN_WEBGPU_VALIDATORS,
    reason="Set PF_RUN_WEBGPU_VALIDATORS=1 to enable WebGPU asset validators.",
)


def _run_command(command: Sequence[str], *, description: str) -> None:
    """Execute ``command`` and surface stdout/stderr on failure."""

    try:
        completed = subprocess.run(
            command,
            cwd=ROOT_DIR,
            capture_output=True,
            check=True,
            text=True,
        )
    except FileNotFoundError:
        pytest.skip(f"{description} skipped; executable not found: {command[0]}")
    except subprocess.CalledProcessError as exc:  # pragma: no cover - diagnostic helper
        stdout = exc.stdout or "<no stdout>"
        stderr = exc.stderr or "<no stderr>"
        pytest.fail(
            f"{description} failed with exit code {exc.returncode}\n"
            f"STDOUT:\n{stdout}\n"
            f"STDERR:\n{stderr}",
        )
    else:
        if completed.stderr:
            # Surface warnings emitted via stderr so they do not go unnoticed.
            print(completed.stderr)


def _iter_existing(paths: Iterable[Path]) -> Iterable[Path]:
    """Yield existing paths from ``paths``."""

    for candidate in paths:
        if candidate.exists():
            yield candidate


@pytest.mark.parametrize(
    "validator,builder",
    (
        (
            "wgsl_analyzer",
            lambda binary: [binary, str(WGSL_PATH)],
        ),
        (
            "wgsl-analyzer",
            lambda binary: [binary, str(WGSL_PATH)],
        ),
        (
            "naga",
            lambda binary: [binary, "validate", str(WGSL_PATH)],
        ),
        (
            "tint",
            lambda binary: [binary, str(WGSL_PATH)],
        ),
    ),
)
def test_wgsl_static_validation(
    validator: str, builder: Callable[[str], Sequence[str]],
) -> None:
    """Validate the WGSL shader via any available static analysis CLI."""

    binary = shutil.which(validator)
    if binary is None:
        pytest.skip(f"{validator} executable not available")
        return

    assert binary is not None
    _run_command(builder(binary), description=f"{validator} validation")


@pytest.mark.skipif(
    not TS_CONFIG.exists(),
    reason="tsconfig.json not present; skipping TypeScript type check.",
)
def test_typescript_typecheck() -> None:
    """Run ``tsc --noEmit`` against the WebGPU TypeScript source."""

    compiler = shutil.which("tsc")
    if compiler is None:
        pytest.skip("TypeScript compiler (tsc) not available")

    command = [compiler, "--noEmit", str(TS_PATH)]
    _run_command(command, description="tsc type-check")


@pytest.mark.skipif(
    not any(
        _iter_existing(
            ROOT_DIR.joinpath(name)
            for name in (".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json")
        ),
    ),
    reason="No ESLint configuration found.",
)
def test_typescript_eslint() -> None:
    """Run ``eslint`` to lint the WebGPU TypeScript module."""

    eslint = shutil.which("eslint")
    if eslint is None:
        pytest.skip("eslint executable not available")

    command = [eslint, "--max-warnings", "0", str(TS_PATH)]
    _run_command(command, description="eslint lint")
