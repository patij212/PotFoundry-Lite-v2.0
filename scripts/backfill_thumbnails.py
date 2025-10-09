#!/usr/bin/env python3
"""Regenerate and update thumbnails for existing Public Library records.

This script fetches existing rows from the `pots` table, rebuilds thumbnails
with the latest renderer settings (no floor grid, ortho, palette parity),
uploads them to Storage, and updates the DB `thumb_url` (with a cache-busting
query param ?v=timestamp).

Usage:
  python scripts/backfill_thumbnails.py [--limit N] [--offset M]

Environment / Secrets:
  Requires Supabase to be configured (env SUPABASE_URL + SUPABASE_KEY or
  .streamlit/secrets.toml). Uses service role to write.
"""
from __future__ import annotations

import sys
import time
import json
from typing import List, Tuple

from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from potfoundry.integrations.supabase_client import get_singleton_client, NotConfiguredError
from potfoundry.library import list_published

# Verbose logging flag (enabled via --verbose)
VERBOSE: bool = False


def _log(msg: str) -> None:
    if VERBOSE:
        print(msg)


def _regen_thumb_bytes(row: dict) -> bytes | None:
    try:
        from pfui.preview import render_mesh_snapshot_cached
        H = float(row.get("size", {}).get("height", 120.0))
        Rt = float(row.get("size", {}).get("top_od", 140.0)) / 2.0
        Rb = float(row.get("size", {}).get("bottom_od", 90.0)) / 2.0
        expn = float(row.get("size", {}).get("flare_exp", 1.1))
        n_theta = int(row.get("mesh", {}).get("n_theta", 144))
        n_z = int(row.get("mesh", {}).get("n_z", 64))
        style = row.get("style")
        opts_json = json.dumps(row.get("opts", {}) or {})
        png = render_mesh_snapshot_cached(
            H, Rt, Rb, expn, n_theta, n_z, style, opts_json, 4.0, 4.0, 120,
            inner_wall=None, place_on_ground=True, view_elev=20.0, view_azim=-60.0, theme="dark"
        )
        if not png:
            _log(f"render_mesh_snapshot_cached returned None for id={row.get('id')}")
        return png
    except Exception as e:
        _log(f"mesh snapshot failed for id={row.get('id')}: {e}")
        try:
            from pfui.preview import render_preview_png_cached
            H = float(row.get("size", {}).get("height", 120.0))
            Rt = float(row.get("size", {}).get("top_od", 140.0)) / 2.0
            Rb = float(row.get("size", {}).get("bottom_od", 90.0)) / 2.0
            expn = float(row.get("size", {}).get("flare_exp", 1.1))
            n_theta = int(row.get("mesh", {}).get("n_theta", 144))
            n_z = int(row.get("mesh", {}).get("n_z", 64))
            style = row.get("style")
            opts_json = json.dumps(row.get("opts", {}) or {})
            png2 = render_preview_png_cached(
                H, Rt, Rb, expn, n_theta, n_z, style, opts_json, 4.0, 4.0, 120, theme="dark", show_floor=False
            )
            if not png2:
                _log(f"render_preview_png_cached returned None for id={row.get('id')}")
            return png2
        except Exception as e2:
            _log(f"preview png failed for id={row.get('id')}: {e2}")
            return None


def backfill(limit: int = 100, offset: int = 0) -> Tuple[int, int]:
    client = get_singleton_client()
    if not client.is_configured():
        raise NotConfiguredError("Supabase not configured for this environment.")

    updated = 0
    skipped = 0
    page = 0
    while True:
        rows, has_next = list_published(offset=offset + page * limit, limit=limit)
        if not rows:
            break
        for row in rows:
            try:
                png = _regen_thumb_bytes(row)
                if not png:
                    _log(f"SKIP: no png generated for id={row.get('id')} style={row.get('style')}")
                    skipped += 1
                    continue
                design_id = row.get("id")
                if not design_id:
                    _log("SKIP: row without id")
                    skipped += 1
                    continue
                # Upload and update thumb_url (with cache buster)
                path = f"thumb/{design_id}.png"
                url = client.upload_bytes(path, png, content_type="image/png")
                url_ver = f"{url}?v={int(time.time())}"
                # Update existing row in-place to avoid NOT NULL column requirements of INSERT/UPSERT
                client.update_rows("pots", {"id": design_id}, {"thumb_url": url_ver})
                _log(f"UPDATED: id={design_id} -> {url_ver}")
                updated += 1
            except Exception as ex:
                _log(f"ERROR updating id={row.get('id')}: {ex}")
                skipped += 1
                continue
        if not has_next:
            break
        page += 1
    return updated, skipped


def main(argv: List[str]) -> int:
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args(argv)
    global VERBOSE
    VERBOSE = bool(args.verbose)
    try:
        upd, skip = backfill(limit=args.limit, offset=args.offset)
        print(f"Backfill complete. Updated: {upd}, Skipped: {skip}")
        return 0
    except NotConfiguredError as e:
        print(f"ERROR: {e}")
        return 2
    except Exception as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
