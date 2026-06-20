# ./Web_Toolkit/image_pipeline/src/python/image_pipeline.py
"""Image inspection and lossless WebP conversion helpers for the portable toolkit."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image


def inspect(path_value: str) -> dict:
    """Inspect a raster image and return metadata useful to the toolkit."""

    path = Path(path_value)
    with Image.open(path) as image:
        actual_format = (image.format or "").upper()
        extension = path.suffix.lower()
        expected = {
            ".png": "PNG",
            ".jpg": "JPEG",
            ".jpeg": "JPEG",
        }.get(extension, actual_format)
        return {
            "format": actual_format,
            "extension": extension,
            "extensionMismatch": bool(expected and actual_format and expected != actual_format),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "hasAlpha": "A" in image.mode,
        }


def convert_webp(input_value: str, output_value: str) -> dict:
    """Convert a raster image to lossless WebP."""

    input_path = Path(input_value)
    output_path = Path(output_value)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(input_path) as image:
        save_kwargs = {
            "format": "WEBP",
            "lossless": True,
            "method": 6,
        }
        image.save(output_path, **save_kwargs)
    return {
        "output": str(output_path),
        "sizeBytes": os.path.getsize(output_path),
    }


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(description="Portable image pipeline helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("--path", required=True)

    convert_parser = subparsers.add_parser("convert-webp")
    convert_parser.add_argument("--input", required=True)
    convert_parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> int:
    """Run the requested image-pipeline helper action."""

    args = parse_args()
    if args.command == "inspect":
        print(json.dumps(inspect(args.path)))
        return 0
    if args.command == "convert-webp":
        print(json.dumps(convert_webp(args.input, args.output)))
        return 0
    raise SystemExit("Unknown command")


if __name__ == "__main__":
    raise SystemExit(main())

