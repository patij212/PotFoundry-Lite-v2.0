#!/usr/bin/env python
import re
import sys
from pathlib import Path


# JWT-ish token pattern
JWT_RE = re.compile(r"eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+")
SERVICE_ROLE_RE = re.compile(r"service_role", re.IGNORECASE)
ENV_KEY = "SUPABASE_SERVICE_ROLE_KEY"


def is_text_file(p: Path) -> bool:
    try:
        with p.open("rb") as f:
            chunk = f.read(2048)
        # Heuristic: if it contains NUL, treat as binary
        return b"\x00" not in chunk
    except Exception:
        return False


def interesting_file(p: Path) -> bool:
    # Only scan config/code files that could contain secrets;
    # ignore docs, migrations, and shell scripts to reduce false positives.
    if any(str(p).replace("\\", "/").startswith(prefix) for prefix in (
        "docs/", "adr/", "db/", "tests/", "scripts/precommit_forbid_service_role",
    )):
        return False
    if p.suffix.lower() in {".md", ".sql", ".sh", ".bat", ".ps1"}:
        return False
    if p.suffix.lower() in {".py", ".toml", ".env", ".json", ".yaml", ".yml", ".ini"}:
        return True
    return False


def extract_env_value(text: str, key: str) -> str | None:
    # Try common formats: TOML/INI/ENV
    rx = re.compile(rf"^{key}\s*[:=]\s*(['\"]?)(.+?)\1\s*$", re.IGNORECASE | re.MULTILINE)
    m = rx.search(text)
    if m:
        return m.group(2).strip()
    return None


def looks_like_placeholder(val: str) -> bool:
    v = val.strip().lower()
    return (
        not v
        or v in {"<your-key>", "changeme", "example", "placeholder", "xxx"}
        or "your-" in v
        or "example" in v
        or "placeholder" in v
    )


def file_has_real_service_role_secret(text: str) -> bool:
    # A real leak if we see the ENV key with a non-placeholder value
    val = extract_env_value(text, ENV_KEY)
    if val and not looks_like_placeholder(val) and len(val) >= 20:
        return True
    # Or a long JWT-like token present alongside a service_role mention
    if SERVICE_ROLE_RE.search(text) and any(len(tok) > 80 for tok in JWT_RE.findall(text)):
        return True
    return False


def scan_file(p: Path) -> bool:
    try:
        if not p.exists() or not p.is_file() or not is_text_file(p) or not interesting_file(p):
            return False
        text = p.read_text(errors="ignore")
        # Ignore templates/examples
        path_s = str(p).replace("\\", "/").lower()
        if any(s in path_s for s in ("template", "example")):
            return False
        return file_has_real_service_role_secret(text)
    except Exception:
        return False


def main(argv: list[str]) -> int:
    bad: list[str] = []
    for arg in argv[1:]:
        p = Path(arg)
        if scan_file(p):
            bad.append(str(p))

    if bad:
        sys.stderr.write("\nERROR: Potential Supabase service_role secret detected in the following files:\n")
        for fname in bad:
            sys.stderr.write(f"  - {fname}\n")
        sys.stderr.write("\nRefuse to commit. Remove or redact service_role credentials before committing.\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
