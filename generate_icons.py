import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_neocare_icon(size=1024):
    # Create master image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # 1. Soft ambient shadow behind the squircle
    shadow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_img)
    pad = int(size * 0.08)
    corner_radius = int(size * 0.22)
    s_box = [pad, pad + int(size * 0.03), size - pad, size - pad + int(size * 0.03)]
    s_draw.rounded_rectangle(s_box, radius=corner_radius, fill=(15, 5, 10, 160))
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(int(size * 0.04)))
    img.alpha_composite(shadow_img)

    # 2. Base rounded card with vibrant medical gradient
    # Gradient background from rose-500 (#f43f5e) to rose-700 (#be123c) to rose-900 (#881337)
    card_mask = Image.new("L", (size, size), 0)
    m_draw = ImageDraw.Draw(card_mask)
    box = [pad, pad, size - pad, size - pad]
    m_draw.rounded_rectangle(box, radius=corner_radius, fill=255)

    gradient_card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(gradient_card)
    
    # Render vertical linear gradient
    for y in range(pad, size - pad):
        factor = (y - pad) / float(size - 2 * pad)
        # Interpolate:
        # 0.0 -> #fb7185 (251, 113, 133)
        # 0.5 -> #e11d48 (225, 29, 72)
        # 1.0 -> #881337 (136, 19, 55)
        if factor < 0.5:
            f = factor / 0.5
            r = int(251 * (1 - f) + 225 * f)
            g = int(113 * (1 - f) + 29 * f)
            b = int(133 * (1 - f) + 72 * f)
        else:
            f = (factor - 0.5) / 0.5
            r = int(225 * (1 - f) + 136 * f)
            g = int(29 * (1 - f) + 19 * f)
            b = int(72 * (1 - f) + 55 * f)
        g_draw.line([(pad, y), (size - pad, y)], fill=(r, g, b, 255))

    # Add subtle radial lighting highlight from top center
    highlight_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(highlight_img)
    center_x = size // 2
    center_y = int(size * 0.25)
    max_radius = int(size * 0.55)
    for r in range(max_radius, 0, -8):
        alpha = int(45 * (1.0 - (r / max_radius)))
        h_draw.ellipse(
            [center_x - r, center_y - r, center_x + r, center_y + r],
            fill=(255, 255, 255, alpha)
        )
    gradient_card.alpha_composite(highlight_img)

    # Composite card into master with mask
    img.paste(gradient_card, (0, 0), card_mask)

    # 3. Inner border / bezel stroke
    stroke_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    st_draw = ImageDraw.Draw(stroke_layer)
    st_draw.rounded_rectangle(box, radius=corner_radius, outline=(255, 255, 255, 75), width=int(size * 0.012))
    img.alpha_composite(stroke_layer)

    # 4. Draw ECG Heartbeat Pulse Waveform
    # Original SVG viewBox="0 0 24 24":
    # d="M3 12h4.5l2.5-6 4.5 13 3.5-9H21"
    # Map (x, y) from 24x24 space into inner content box
    margin_x = int(size * 0.20)
    content_width = size - 2 * margin_x
    margin_y = int(size * 0.28)
    content_height = size - 2 * margin_y

    def map_pt(vx, vy):
        px = margin_x + ((vx - 2.5) / 19.0) * content_width
        py = margin_y + ((vy - 4.5) / 15.0) * content_height
        return (px, py)

    raw_pts = [
        (3.0, 12.0),
        (7.5, 12.0),
        (10.0, 6.0),
        (14.5, 19.0),
        (18.0, 10.0),
        (21.0, 12.0)
    ]
    mapped_pts = [map_pt(vx, vy) for vx, vy in raw_pts]

    # Pulse Glow Layer behind ECG line
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gl_draw = ImageDraw.Draw(glow_layer)
    glow_width = int(size * 0.09)
    for i in range(len(mapped_pts) - 1):
        gl_draw.line([mapped_pts[i], mapped_pts[i + 1]], fill=(255, 200, 220, 140), width=glow_width, joint="round")
    for pt in mapped_pts:
        gl_draw.ellipse([pt[0] - glow_width//2, pt[1] - glow_width//2, pt[0] + glow_width//2, pt[1] + glow_width//2], fill=(255, 200, 220, 140))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(int(size * 0.035)))
    img.alpha_composite(glow_layer)

    # Crisp Solid White ECG Line with rounded joints
    line_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ln_draw = ImageDraw.Draw(line_layer)
    line_width = int(size * 0.052)
    radius_joint = line_width // 2

    for i in range(len(mapped_pts) - 1):
        ln_draw.line([mapped_pts[i], mapped_pts[i + 1]], fill=(255, 255, 255, 255), width=line_width, joint="round")
    
    # Cap joints cleanly
    for pt in mapped_pts:
        ln_draw.ellipse([pt[0] - radius_joint, pt[1] - radius_joint, pt[0] + radius_joint, pt[1] + radius_joint], fill=(255, 255, 255, 255))
    
    # Subtle telemetry pulse dot at start/lead-in
    lead_pt = mapped_pts[0]
    ln_draw.ellipse([lead_pt[0] - line_width*0.7, lead_pt[1] - line_width*0.7, lead_pt[0] + line_width*0.7, lead_pt[1] + line_width*0.7], fill=(255, 255, 255, 255))

    img.alpha_composite(line_layer)

    # 5. Glowing Vital Heartbeat Indicator Dot in top-right
    vital_dot_x = int(size * 0.77)
    vital_dot_y = int(size * 0.23)
    dot_radius = int(size * 0.035)

    v_glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    vg_draw = ImageDraw.Draw(v_glow)
    vg_draw.ellipse([vital_dot_x - dot_radius*2.5, vital_dot_y - dot_radius*2.5, vital_dot_x + dot_radius*2.5, vital_dot_y + dot_radius*2.5], fill=(255, 255, 255, 180))
    v_glow = v_glow.filter(ImageFilter.GaussianBlur(int(size * 0.02)))
    img.alpha_composite(v_glow)

    v_dot = ImageDraw.Draw(img)
    v_dot.ellipse([vital_dot_x - dot_radius, vital_dot_y - dot_radius, vital_dot_x + dot_radius, vital_dot_y + dot_radius], fill=(255, 255, 255, 255))

    # Downsample with Lanczos for super-sampled anti-aliasing
    final_icon = img.resize((512, 512), Image.Resampling.LANCZOS)
    return final_icon

if __name__ == "__main__":
    icon = create_neocare_icon()

    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    electron_dir = os.path.join(base_dir, "web-dashboard", "electron")
    public_dir = os.path.join(base_dir, "web-dashboard", "public")
    
    os.makedirs(electron_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    # Save PNGs
    electron_png = os.path.join(electron_dir, "icon.png")
    public_png = os.path.join(public_dir, "icon.png")
    icon.save(electron_png, "PNG")
    icon.save(public_png, "PNG")

    # Multi-resolution ICO for Windows installer & desktop shortcut
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    electron_ico = os.path.join(electron_dir, "icon.ico")
    public_ico = os.path.join(public_dir, "favicon.ico")

    icon.save(electron_ico, format="ICO", sizes=ico_sizes)
    icon.save(public_ico, format="ICO", sizes=ico_sizes)

    print(f"Generated successfully:\n  {electron_png}\n  {electron_ico}\n  {public_ico}")
