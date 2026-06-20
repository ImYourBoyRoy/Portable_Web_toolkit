# ./src/python/brand_assets.py
"""
AI-Ready Rendering Engine for Brand Doctor.
Handles High-Fidelity Open Graph generation and Icon suites.
Version: Luxe 6.0 (AI-First Surgical Merge)
"""
import sys
import json
import io
import os
import textwrap
import colorsys
import re
import random
import codecs
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageColor, ImageFilter, ImageOps

# --- 2026 Engine Logic: Force UTF-8 for Agentic Handshakes ---
if hasattr(sys.stdin, 'encoding') and sys.stdin.encoding != 'utf-8':
    try:
        sys.stdin = codecs.getreader('utf-8')(sys.stdin.detach())
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    except Exception:
        pass # Fallback to system default if detach fails

try:
    import cairosvg
    HAS_CAIRO = True
except (ImportError, OSError):
    HAS_CAIRO = False

# --- Architectural Grid ---
CANVAS_W = 1200
CANVAS_H = 630
MARGIN = 100
CONTENT_W = 600
ASSET_X = 880     
GUTTER = ASSET_X - (MARGIN + CONTENT_W)

# --- Default Spec (AI Fallbacks) ---
DEFAULT_SPEC = {
    "colors": {
        "background": "#08080d",
        "accent": "#c45142",
        "text_primary": "#ffffff",
        "text_secondary": "#a0a0b0",
        "glow": "#c45142"
    },
    "visuals": {
        "signature_enabled": True,
        "signature_delimiter": "|",
        "signature_offset_px": 1,
        "glow_passes": 5,
        "aurora_enabled": True,
        "aurora_blur": 160,
        "noise_intensity": 0.005,
        "portrait_blur_radius": 1
    }
}

# --- Helpers ---

def _get_val(spec, keys, default=None):
    """Deep get for spec dictionary."""
    curr = spec
    for k in keys:
        if isinstance(curr, dict) and k in curr:
            curr = curr[k]
        else:
            # Check default spec
            def_curr = DEFAULT_SPEC
            for dk in keys:
                if isinstance(def_curr, dict) and dk in def_curr:
                    def_curr = def_curr[dk]
                else:
                    return default
            return def_curr
    return curr

def _get_rgb(color_str):
    if not color_str: return (255, 255, 255)
    if isinstance(color_str, (list, tuple)): return tuple(color_str)
    if color_str.startswith("hsl"):
        match = re.match(r"hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)", color_str.lower())
        if match:
            h, s, l = map(int, match.groups())
            r, g, b = colorsys.hls_to_rgb(h/360.0, l/100.0, s/100.0)
            return (int(r*255), int(g*255), int(b*255))
    try: return ImageColor.getrgb(color_str)
    except: return (255, 255, 255)

def _get_font(path_val, size, project_root=""):
    path_str = ""
    if isinstance(path_val, dict): path_str = path_val.get("path", "")
    elif isinstance(path_val, str): path_str = path_val
        
    try:
        p = Path(path_str)
        if not p.is_absolute(): p = Path(project_root) / p
        if not p.exists(): return ImageFont.load_default()
        if p.suffix.lower() == '.woff2':
            from fontTools.ttLib import TTFont
            font = TTFont(str(p))
            out = io.BytesIO()
            font.save(out, reorderTables=False)
            out.seek(0)
            return ImageFont.truetype(out, size)
        return ImageFont.truetype(str(p), size)
    except: return ImageFont.load_default()

def _load_image(path_str, project_root=""):
    if not path_str: return None
    p = Path(path_str)
    if not p.is_absolute(): p = Path(project_root) / p
    if not p.exists(): return None
    if p.suffix.lower() == '.svg':
        if not HAS_CAIRO: return None
        try:
            out = io.BytesIO()
            cairosvg.svg2png(url=str(p), write_to=out)
            out.seek(0)
            return Image.open(out).convert("RGBA")
        except: return None
    try: return Image.open(p).convert("RGBA")
    except: return None

# --- OG Logic ---

def generate_og(spec: dict) -> dict:
    project_root = spec.get("project_root", "")
    bg_rgb = _get_rgb(_get_val(spec, ["colors", "background"]))
    accent_rgb = _get_rgb(_get_val(spec, ["colors", "accent"]))
    
    image = Image.new("RGB", (CANVAS_W, CANVAS_H), bg_rgb)
    
    if _get_val(spec, ["visuals", "aurora_enabled"], True):
        _draw_aurora(image, accent_rgb, spec)
    
    draw = ImageDraw.Draw(image)
    horizon = CANVAS_H // 2 
    portrait_center = (ASSET_X + (CANVAS_W - MARGIN - ASSET_X)//2, horizon)
    
    _draw_ambient_unity(image, portrait_center, accent_rgb)

    if _get_val(spec, ["assets", "portrait"]):
        p_size = 400 
        box = [portrait_center[0] - p_size//2, horizon - p_size//2, portrait_center[0] + p_size//2, horizon + p_size//2]
        mode = _get_val(spec, ["layout", "portrait_mode"], "circle")
        
        if mode == "rounded-rect":
            _draw_editorial_portrait_rect(image, spec["assets"]["portrait"], box, accent_rgb, spec, project_root)
        else:
            _draw_editorial_portrait(image, spec["assets"]["portrait"], box, accent_rgb, spec, project_root)

    content_y_start = horizon - 230 
    _draw_polished_content(draw, spec, [MARGIN, content_y_start, MARGIN + CONTENT_W, 600], accent_rgb, project_root=project_root)

    if _get_val(spec, ["visuals", "noise_intensity"], 0.005) > 0:
        _draw_noise_grain(image, _get_val(spec, ["visuals", "noise_intensity"]))

    path_str = _get_val(spec, ["output", "path"], "public/assets/og-image.png")
    out_path = Path(path_str)
    if not out_path.is_absolute(): out_path = Path(project_root) / out_path
    
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(str(out_path), "PNG")
    return {"output": str(out_path), "layout_used": _get_val(spec, ["visuals", "og_layout"], "master-polish-5.5")}

# --- Icon Logic ---

def generate_icons(spec: dict) -> dict:
    project_root = spec.get("project_root", "")
    source_path = _get_val(spec, ["assets", "source"])
    output_dir = _get_val(spec, ["output", "dir"], "public/assets/icons")
    
    source = _load_image(source_path, project_root)
    if not source:
        raise ValueError(f"Could not load source image: {source_path}")
    
    out_p = Path(output_dir)
    if not out_p.is_absolute(): out_p = Path(project_root) / out_p
    out_p.mkdir(parents=True, exist_ok=True)
    
    icon_specs = [
        ("favicon.png", 32, 32),
        ("favicon-16x16.png", 16, 16),
        ("favicon-32x32.png", 32, 32),
        ("apple-touch-icon.png", 180, 180),
        ("android-chrome-192x192.png", 192, 192),
        ("android-chrome-512x512.png", 512, 512)
    ]
    
    generated = []
    for (name, w, h) in icon_specs:
        target = out_p / name
        icon = source.resize((w, h), Image.Resampling.LANCZOS)
        icon.save(str(target), "PNG")
        generated.append(str(target.relative_to(Path(project_root)) if project_root else target))
        
    return {"generated": generated}

def generate_ico(input_path, output_path):
    img = Image.open(input_path)
    img.save(output_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    return {"output": output_path}

def inspect_image(path_str):
    img = _load_image(path_str)
    if not img: return {"valid": False}
    return {
        "valid": True,
        "width": img.width,
        "height": img.height,
        "format": img.format,
        "mode": img.mode
    }

def rewrite_png(input_path, output_path):
    img = Image.open(input_path)
    img.save(output_path, "PNG")
    return {"output": output_path}

# --- Artistic Drawing Pass ---

def _draw_aurora(image, accent_rgb, spec):
    blur_rad = _get_val(spec, ["visuals", "aurora_blur"], 160)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    
    bg_rgb = _get_rgb(_get_val(spec, ["colors", "background"]))
    # Calculate luminance to detect light/dark theme
    lum = (0.299 * bg_rgb[0] + 0.587 * bg_rgb[1] + 0.114 * bg_rgb[2]) / 255.0
    
    h, s, v = colorsys.rgb_to_hsv(accent_rgb[0]/255, accent_rgb[1]/255, accent_rgb[2]/255)
    
    if lum > 0.7:
        # Light mode: use soft, warm highlights
        vibrant_accent = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, max(s*0.6, 0.2), 0.98))
        secondary = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(0.1, 0.1, 0.99)) # Warm cream
        orbs = [
            ((CANVAS_W-100, CANVAS_H//2), 950, vibrant_accent, 35), 
            ((250, CANVAS_H), 1150, secondary, 45),
        ]
    else:
        # Dark mode: original deep logic
        vibrant_accent = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, s, min(v * 1.8, 1.0)))
        orbs = [
            ((CANVAS_W-100, CANVAS_H//2), 950, vibrant_accent, 45), 
            ((250, CANVAS_H), 1150, (6, 10, 40), 80), # Deep blue
        ]
        
    for (pos, rad, rgb, alpha) in orbs:
        d.ellipse([pos[0]-rad, pos[1]-rad, pos[0]+rad, pos[1]+rad], fill=rgb+(alpha,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=blur_rad))
    image.paste(overlay, (0, 0), overlay)

def _draw_noise_grain(image, intensity):
    noise = Image.new("RGBA", image.size, (0,0,0,0))
    for _ in range(int(CANVAS_W * CANVAS_H * intensity)): 
        noise.putpixel((random.randint(0, CANVAS_W-1), random.randint(0, CANVAS_H-1)), (255, 255, 255, random.randint(0, 16)))
    image.paste(noise, (0,0), noise)

def _draw_ambient_unity(image, portrait_pos, accent_rgb):
    glow = Image.new("RGBA", image.size, (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    px, py = portrait_pos
    gd.ellipse([px-600, py-600, px+600, py+600], fill=accent_rgb+(10,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=180))
    image.paste(glow, (0,0), glow)

def _draw_editorial_portrait(image, path, box, accent_rgb, spec, project_root=""):
    asset = _load_image(path, project_root)
    if not asset: return
    x1, y1, x2, y2 = box
    asset = ImageOps.fit(asset, (x2-x1, y2-y1), Image.Resampling.LANCZOS)
    mask = Image.new("L", asset.size, 0)
    ImageDraw.Draw(mask).ellipse([0,0,asset.width,asset.height], fill=255)
    
    blur_r = _get_val(spec, ["visuals", "portrait_blur_radius"], 1)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=blur_r))
    
    temp = Image.new("RGBA", image.size, (0,0,0,0))
    temp.paste(asset, (x1, y1), mask)
    
    # Luxe Borders
    ImageDraw.Draw(temp).ellipse([x1-4, y1-4, x2+4, y2+4], outline=accent_rgb+(40,), width=2)
    ImageDraw.Draw(temp).ellipse([x1-12, y1-12, x2+12, y2+12], outline=accent_rgb+(12,), width=1)
    
    image.paste(temp, (0,0), temp)

def _draw_editorial_portrait_rect(image, path, box, accent_rgb, spec, project_root=""):
    asset = _load_image(path, project_root)
    if not asset: return
    x1, y1, x2, y2 = box
    asset = ImageOps.fit(asset, (x2-x1, y2-y1), Image.Resampling.LANCZOS)
    
    # Create Rounded Rect Mask
    mask = Image.new("L", asset.size, 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rounded_rectangle([0, 0, asset.width, asset.height], radius=40, fill=255)
    
    blur_r = _get_val(spec, ["visuals", "portrait_blur_radius"], 1)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=blur_r))
    
    temp = Image.new("RGBA", image.size, (0,0,0,0))
    temp.paste(asset, (x1, y1), mask)
    
    # Luxe Borders
    draw_temp = ImageDraw.Draw(temp)
    draw_temp.rounded_rectangle([x1-4, y1-4, x2+4, y2+4], radius=44, outline=accent_rgb+(40,), width=2)
    draw_temp.rounded_rectangle([x1-12, y1-12, x2+12, y2+12], radius=52, outline=accent_rgb+(12,), width=1)
    
    image.paste(temp, (0,0), temp)

def _draw_polished_content(draw, spec, rect, accent_rgb, project_root=""):
    x1, y1, x2, y2 = rect
    text_prime = _get_rgb(_get_val(spec, ["colors", "text_primary"], "#ffffff"))
    text_sec = _get_rgb(_get_val(spec, ["colors", "text_secondary"], "#a0a0b0"))
    
    content = spec.get("content", {})
    curr_y = y1
    
    # 1. Signature Eyebrow with Letter Spacing (matching .section-label)
    if content.get("eyebrow"):
        e_path = _get_val(spec, ["typography", "eyebrow_font", "path"])
        e_size = _get_val(spec, ["typography", "eyebrow_font", "size"], 34)
        font_e = _get_font(e_path, e_size, project_root)
        spacing = _get_val(spec, ["visuals", "eyebrow_letter_spacing"], 6)
        
        text = content["eyebrow"].upper()
        temp_x = x1
        for char in text:
            draw.text((temp_x, curr_y), char, font=font_e, fill=accent_rgb)
            temp_x += (draw.textlength(char, font=font_e) + spacing)
        curr_y += 75

    # 2. Headline with Clean Editorial Polish
    title_text = content.get("title", "Site Title")
    t_path = _get_val(spec, ["typography", "title_font", "path"])
    t_size = _get_val(spec, ["typography", "title_font", "size"], 100)
    font_reg = _get_font(t_path, t_size, project_root)
    
    # Split logic for AI-controlled Signature
    delimiter = _get_val(spec, ["visuals", "signature_delimiter"], "|")
    parts = [p.strip() for p in title_text.split(delimiter, 1)] if delimiter in title_text else [title_text]
    full_display = " ".join(parts) # Re-inject single space for clean kerning
    
    # Auto-scale headline
    t_len = draw.textlength(full_display, font=font_reg)
    while t_len > CONTENT_W and t_size > 70:
        t_size -= 4
        font_reg = _get_font(t_path, t_size, project_root)
        t_len = draw.textlength(full_display, font=font_reg)
    
    # Draw Subtle Editorial Shadow
    shadow_color = (int(accent_rgb[0]*0.2), int(accent_rgb[1]*0.2), int(accent_rgb[2]*0.2), 30)
    draw.text((x1+2, curr_y+2), full_display, font=font_reg, fill=shadow_color)
    
    if len(parts) > 1:
        # Part 1 (Regular)
        draw.text((x1, curr_y), parts[0], font=font_reg, fill=text_prime)
        
        # Part 2 (Site Preview Accent: Italic + Accent Color)
        sub_x = x1 + draw.textlength(parts[0] + " ", font=font_reg) # Add space width
        t2 = parts[1]
        
        # Load Italic variant if requested
        if _get_val(spec, ["visuals", "signature_use_italic"], True):
            ti_path = _get_val(spec, ["typography", "title_italic_font", "path"]) or t_path
            font_accent = _get_font(ti_path, t_size, project_root)
        else:
            font_accent = font_reg
            
        accent_fill = accent_rgb if _get_val(spec, ["visuals", "signature_use_accent"], True) else text_prime
        
        # Single Sharp Draw (Gutted the smudge-passes)
        draw.text((sub_x, curr_y), t2, font=font_accent, fill=accent_fill)
    else:
        draw.text((x1, curr_y), title_text, font=font_reg, fill=text_prime)
        
    curr_y += (t_size + 35)

    # 3. Tagline (Site Preview Hook) - Automatically wrapped for Face Safety
    tagline = content.get("subtitle", "")
    if tagline:
        b_path = _get_val(spec, ["typography", "body_font", "path"])
        b_size = _get_val(spec, ["typography", "body_font", "size"], 36)
        font_f = _get_font(b_path, b_size, project_root)
        
        # Wrapped for Face-Safety (32 chars is safe for CONTENT_W)
        wrapped = textwrap.fill(tagline, width=32)
        draw.text((x1, curr_y), wrapped, font=font_f, fill=text_sec)
        # Advance Y based on lines
        curr_y += (len(wrapped.split('\n')) * (b_size + 15))

    # 4. Role & Location (Hard Returns supported via |)
    description = content.get("description", "")
    if description:
        s_path = _get_val(spec, ["typography", "subtitle_font", "path"])
        s_size = _get_val(spec, ["typography", "subtitle_font", "size"], 32)
        font_s = _get_font(s_path, s_size, project_root)
        
        # Hard returns via | (mimicking user's intuitive suggestion)
        lines = [l.strip() for l in description.split('|')]
        for line in lines:
            draw.text((x1, curr_y), line, font=font_s, fill=text_sec)
            curr_y += (s_size + 15)

# --- Entry Point ---

def main():
    if len(sys.argv) < 2: return 1
    command = sys.argv[1]
    
    def load_spec():
        try:
            if "--spec-json" in sys.argv:
                idx = sys.argv.index("--spec-json")
                if idx+1 < len(sys.argv):
                    if sys.argv[idx+1] == "-": return json.load(sys.stdin)
                    return json.loads(sys.argv[idx+1])
            return json.load(sys.stdin)
        except: return {}

    if command == "generate-og":
        print(json.dumps(generate_og(load_spec())))
    elif command == "generate-icons":
        print(json.dumps(generate_icons(load_spec())))
    elif command == "generate-ico":
        i_idx = sys.argv.index("--input")
        o_idx = sys.argv.index("--output")
        print(json.dumps(generate_ico(sys.argv[i_idx+1], sys.argv[o_idx+1])))
    elif command == "inspect":
        idx = sys.argv.index("--path") if "--path" in sys.argv else -1
        if idx != -1: print(json.dumps(inspect_image(sys.argv[idx+1])))
    elif command == "rewrite-png":
        i_idx = sys.argv.index("--input")
        o_idx = sys.argv.index("--output")
        print(json.dumps(rewrite_png(sys.argv[i_idx+1], sys.argv[o_idx+1])))
    else: return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
