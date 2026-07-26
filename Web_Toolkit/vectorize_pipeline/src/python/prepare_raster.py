# ./Web_Toolkit/vectorize_pipeline/src/python/prepare_raster.py
"""Prepare a raster for VTracer.

Flattens transparency onto a contrasting background and optionally thresholds
to a clean B&W silhouette so logo traces stay sharp (no magenta/anti-alias soup).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image
import numpy as np


def detect_ink(rgb: np.ndarray, alpha: np.ndarray | None) -> str:
    """Return 'dark' or 'light' for dominant visible ink."""
    if alpha is not None:
        vis = alpha > 16
        if not np.any(vis):
            return "dark"
        luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        mean = float(luma[vis].mean())
        return "dark" if mean < 140 else "light"
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    # Assume corners are background
    h, w = luma.shape
    border = np.concatenate(
        [luma[0, :], luma[-1, :], luma[:, 0], luma[:, -1]]
    )
    bg = float(np.median(border))
    return "dark" if bg > 128 else "light"


def prepare(
    src: Path,
    dest: Path,
    *,
    ink: str = "auto",
    threshold: bool = True,
    threshold_value: int = 160,
    scale: float = 1.0,
    blur: float = 0.0,
) -> dict:
    from PIL import ImageFilter

    im = Image.open(src).convert("RGBA")
    scale = max(1.0, float(scale or 1.0))
    if scale != 1.0:
        im = im.resize(
            (max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))),
            Image.Resampling.LANCZOS,
        )

    arr = np.asarray(im).astype(np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3]

    ink_mode = ink
    if ink_mode == "auto":
        ink_mode = detect_ink(rgb, alpha)

    if ink_mode == "dark":
        bg = np.array([255.0, 255.0, 255.0], dtype=np.float32)
        ink_rgb = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    else:
        bg = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        ink_rgb = np.array([255.0, 255.0, 255.0], dtype=np.float32)

    a = (alpha / 255.0)[..., None]
    flat = rgb * a + bg * (1.0 - a)

    # Optional blur before threshold erases stair-steps from low-res aliased masters.
    blur = float(blur or 0.0)
    if blur > 0:
        flat_img = Image.fromarray(np.clip(flat, 0, 255).astype(np.uint8), "RGB")
        flat_img = flat_img.filter(ImageFilter.GaussianBlur(radius=blur))
        flat = np.asarray(flat_img).astype(np.float32)

    if threshold:
        luma = 0.299 * flat[..., 0] + 0.587 * flat[..., 1] + 0.114 * flat[..., 2]
        if ink_mode == "dark":
            # Dark ink on white: anything darker than threshold becomes black
            mask = luma < float(threshold_value)
        else:
            mask = luma > float(255 - threshold_value)
        out = np.where(mask[..., None], ink_rgb, bg)
    else:
        out = flat

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").save(dest, "PNG", optimize=True)
    return {
        "source": str(src),
        "prepared": str(dest),
        "ink": ink_mode,
        "threshold": threshold,
        "scale": scale,
        "blur": blur,
        "size": list(Image.open(dest).size),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ink", default="auto", choices=["auto", "dark", "light"])
    parser.add_argument("--no-threshold", action="store_true")
    parser.add_argument("--threshold-value", type=int, default=160)
    parser.add_argument("--scale", type=float, default=1.0, help="Upscale before threshold (e.g. 4)")
    parser.add_argument("--blur", type=float, default=0.0, help="Gaussian blur radius before threshold")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    meta = prepare(
        Path(args.input),
        Path(args.output),
        ink=args.ink,
        threshold=not args.no_threshold,
        threshold_value=args.threshold_value,
        scale=args.scale,
        blur=args.blur,
    )
    if args.json:
        print(json.dumps(meta))
    else:
        print(f"prepared {meta['prepared']} (ink={meta['ink']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
