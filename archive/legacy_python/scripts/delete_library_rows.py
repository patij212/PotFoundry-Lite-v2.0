#!/usr/bin/env python3
"""Admin script: delete rows from the Public Library (pots table).

CAUTION: This permanently removes database rows. Files in Storage are NOT
removed by this script. Run separately if you wish to clean Storage objects.

Usage examples:
  # Dry run (default): show what would be deleted
  python scripts/delete_library_rows.py --id 0123abcd...
  python scripts/delete_library_rows.py --ids-file ids.txt
  python scripts/delete_library_rows.py --style HarmonicRipple --limit 100

  # Apply deletions (no prompt)
  python scripts/delete_library_rows.py --id 0123abcd... --apply

Notes:
- Requires service role (SUPABASE_KEY) with write permissions.
- Use filters to target specific rows; avoid broad, unfiltered deletes.

"""

from __future__ import annotations

import sys
from pathlib import Path

# Add project root for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from potfoundry.integrations.supabase_client import (
    NotConfiguredError,
    get_singleton_client,
)


def load_ids_file(path: Path) -> set[str]:
    ids: set[str] = set()
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s:
                ids.add(s)
    return ids


def gather_ids(style: str | None, limit: int) -> list[str]:
    client = get_singleton_client()
    ids: list[str] = []
    offset = 0
    page = 200 if limit <= 0 else min(200, limit)
    remaining = limit if limit > 0 else 10_000_000
    filters = {}
    if style:
        filters["style"] = style
    while remaining > 0:
        batch = min(page, remaining)
        rows = client.select_rows(
            "pots",
            filters=filters,
            order_by="created_at",
            order_desc=True,
            limit=batch,
            offset=offset,
        )
        if not rows:
            break
        # Ensure we only collect str IDs (filter out None). Use indexing when present
        ids.extend([row["id"] for row in rows if row.get("id") is not None])
        offset += len(rows)
        remaining -= len(rows)
        if len(rows) < batch:
            break
    return ids


def delete_ids(ids: list[str], apply: bool) -> int:
    client = get_singleton_client()
    deleted = 0
    for i, id_ in enumerate(ids, start=1):
        if not id_:
            continue
        if not apply:
            print(f"[DRY RUN] Would delete id={id_}")
            deleted += 1
            continue
        try:
            n = client.delete_rows("pots", {"id": id_})
            print(f"[{i}/{len(ids)}] Deleted id={id_} (rows={n})")
            deleted += n
        except Exception as e:
            print(f"[{i}/{len(ids)}] ERROR deleting id={id_}: {e}")
    return deleted


def main(argv: list[str]) -> int:
    import argparse

    p = argparse.ArgumentParser(description="Delete rows from Public Library (pots)")
    p.add_argument(
        "--id", dest="ids", action="append", help="Delete by specific id (repeatable)",
    )
    p.add_argument("--ids-file", type=Path, help="Path to file with ids (one per line)")
    p.add_argument("--style", type=str, help="Delete rows matching a style name")
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max rows to fetch for style filter (0=no limit)",
    )
    p.add_argument(
        "--apply", action="store_true", help="Apply deletions (default is dry-run)",
    )
    args = p.parse_args(argv)

    try:
        client = get_singleton_client()
        if not client.is_configured():
            raise NotConfiguredError(
                "Supabase not configured (set SUPABASE_URL and SUPABASE_KEY)",
            )
    except NotConfiguredError as e:
        print(f"ERROR: {e}")
        return 2

    # Collect target IDs
    target_ids: set[str] = set()
    if args.ids:
        target_ids.update(args.ids)
    if args.ids_file and args.ids_file.exists():
        target_ids.update(load_ids_file(args.ids_file))
    if args.style:
        fetched = gather_ids(args.style, args.limit)
        target_ids.update(fetched)

    if not target_ids:
        print("No ids selected. Provide --id/--ids-file or a --style filter.")
        return 0

    ids_sorted = sorted(target_ids)
    print(f"Preparing to delete {len(ids_sorted)} row(s) in pots")
    if not args.apply:
        print("Dry run only. Use --apply to perform deletions.")

    deleted = delete_ids(ids_sorted, apply=args.apply)
    print(f"Done. {'Deleted' if args.apply else 'Would delete'}: {deleted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
