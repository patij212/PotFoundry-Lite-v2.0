#!/usr/bin/env python3
"""Backfill script for publishing designs to the Public Library.

This script reads STL files and their metadata from a directory and publishes
them to the Supabase library. Useful for batch-publishing existing designs.

Usage:
    python scripts/backfill_library.py <directory>
    
Directory structure:
    designs/
        design1.stl
        design1.json  (metadata)
        design1.png   (optional thumbnail)
        design2.stl
        design2.json
        ...

Metadata JSON format:
    {
        "title": "Design Title",
        "style": "HarmonicRipple",
        "size": {...},
        "opts": {...},
        "mesh": {...},
        "diagnostics": {...},
        "license": "CC BY-NC 4.0",
        "tags": ["tag1", "tag2"]
    }
"""
import sys
import json
from pathlib import Path
from typing import Dict, List

# Add parent directory to path to import library modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from potfoundry.library import publish_design
from potfoundry.integrations.supabase_client import get_singleton_client, NotConfiguredError


def load_metadata(json_path: Path) -> dict:
    """Load and validate metadata from JSON file."""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Validate required fields
    required = ["title", "style", "size", "opts", "mesh", "diagnostics", "license"]
    for field in required:
        if field not in data:
            raise ValueError(f"Missing required field: {field}")
    
    return data


def find_designs(directory: Path) -> List[tuple[Path, Path, Path | None]]:
    """Find all design triples (STL, JSON, optional PNG) in directory.
    
    Returns:
        List of (stl_path, json_path, png_path) tuples
    """
    designs = []
    
    for stl_path in directory.glob("*.stl"):
        stem = stl_path.stem
        json_path = directory / f"{stem}.json"
        png_path = directory / f"{stem}.png"
        
        if not json_path.exists():
            print(f"Warning: No metadata found for {stl_path.name}, skipping")
            continue
        
        png_path = png_path if png_path.exists() else None
        designs.append((stl_path, json_path, png_path))
    
    return designs


def backfill(directory: Path, dry_run: bool = False):
    """Backfill designs from directory to library.
    
    Args:
        directory: Directory containing STL/JSON/PNG files
        dry_run: If True, don't actually publish (just validate)
    """
    # Check if library is configured
    client = get_singleton_client()
    if not client.is_configured():
        raise NotConfiguredError(
            "Library not configured. Set SUPABASE_URL and SUPABASE_KEY environment variables "
            "or configure in .streamlit/secrets.toml"
        )
    
    # Find all designs
    designs = find_designs(directory)
    
    if not designs:
        print(f"No designs found in {directory}")
        return
    
    print(f"Found {len(designs)} design(s)")
    
    # Process each design
    published_count = 0
    duplicate_count = 0
    error_count = 0
    
    for stl_path, json_path, png_path in designs:
        try:
            # Load metadata
            metadata = load_metadata(json_path)
            
            # Load STL
            stl_bytes = stl_path.read_bytes()
            
            if dry_run:
                print(f"[DRY RUN] Would publish: {metadata['title']}")
                continue
            
            # Publish
            print(f"Publishing: {metadata['title']}")
            result = publish_design(
                stl_bytes=stl_bytes,
                style=metadata["style"],
                size=metadata["size"],
                opts=metadata["opts"],
                mesh=metadata["mesh"],
                diagnostics=metadata["diagnostics"],
                license=metadata["license"],
                title=metadata["title"],
                tags=metadata.get("tags", []),
                app_commit=metadata.get("app_commit")
            )
            
            if result.duplicate:
                print(f"  → Duplicate (ID: {result.id[:8]}...)")
                duplicate_count += 1
            else:
                print(f"  → Published (ID: {result.id[:8]}...)")
                published_count += 1
        
        except Exception as e:
            print(f"  → Error: {e}")
            error_count += 1
    
    # Summary
    print("\n" + "=" * 50)
    print("Backfill Summary")
    print("=" * 50)
    print(f"Total designs: {len(designs)}")
    print(f"Published: {published_count}")
    print(f"Duplicates: {duplicate_count}")
    print(f"Errors: {error_count}")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Backfill designs to Public Library")
    parser.add_argument("directory", type=Path, help="Directory containing STL/JSON files")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually publish (validate only)")
    
    args = parser.parse_args()
    
    if not args.directory.exists():
        print(f"Error: Directory not found: {args.directory}")
        sys.exit(1)
    
    if not args.directory.is_dir():
        print(f"Error: Not a directory: {args.directory}")
        sys.exit(1)
    
    try:
        backfill(args.directory, dry_run=args.dry_run)
    except NotConfiguredError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nAborted by user")
        sys.exit(1)


if __name__ == "__main__":
    main()
