#!/usr/bin/env python3
"""Generates Yosa AI Monochrome Water-Droplet icons and 5 polyphonic WAV ringtones."""
import math
import os
import shutil
import struct
import sys
import wave

# Allow Pillow installed in /tmp/py-pil if not in system site-packages
if "/tmp/py-pil" not in sys.path and os.path.isdir("/tmp/py-pil"):
    sys.path.insert(0, "/tmp/py-pil")

from PIL import Image, ImageDraw, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_master_droplet() -> Image.Image:
    raw_path = os.path.join(ROOT, "public", "icons", "yosa-droplet-raw.png")
    master_path = os.path.join(ROOT, "public", "icons", "yosa-droplet.png")

    if os.path.exists(raw_path):
        im = Image.open(raw_path).convert("RGB")
        # Normalize near-black edge pixels (< 8) to pure #000000 so it blends invisibly on OLED black
        lut = [0 if i < 9 else min(255, int((i - 9) * (255.0 / 246.0))) for i in range(256)]
        im = im.point(lut * 3)
        im_512 = im.resize((512, 512), Image.Resampling.LANCZOS)
        os.makedirs(os.path.dirname(master_path), exist_ok=True)
        im_512.save(master_path, format="PNG", optimize=True)
        os.remove(raw_path)
        return im_512

    if os.path.exists(master_path):
        return Image.open(master_path).convert("RGB")

    raise FileNotFoundError("Missing public/icons/yosa-droplet.png")


def make_squircle_launcher_icon(master: Image.Image, size: int) -> Image.Image:
    # Render at 4x supersampling for razor-sharp anti-aliased squircle edges
    ss = size * 4
    canvas = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))

    art = master.resize((ss, ss), Image.Resampling.LANCZOS).convert("RGBA")

    mask = Image.new("L", (ss, ss), 0)
    draw_mask = ImageDraw.Draw(mask)
    radius = int(ss * 0.225)
    pad = max(2, int(ss * 0.01))
    draw_mask.rounded_rectangle([pad, pad, ss - 1 - pad, ss - 1 - pad], radius=radius, fill=255)

    canvas.paste(art, (0, 0), mask)

    # Subtle brushed-silver hairline border right on the squircle edge
    border_layer = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border_layer)
    stroke = max(3, int(ss * 0.01))
    draw_border.rounded_rectangle(
        [pad, pad, ss - 1 - pad, ss - 1 - pad],
        radius=radius,
        outline=(220, 224, 230, 58),
        width=stroke,
    )
    canvas = Image.alpha_composite(canvas, border_layer)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def write_wav(path: str, samples: list[float], sample_rate: int = 22050) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = bytearray()
    for s in samples:
        clamped = max(-0.98, min(0.98, s))
        pcm.extend(struct.pack("<h", int(clamped * 32767)))
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(pcm))


def synth_note(freq: float, dur: float, sr: int, kind: str = "marimba", vol: float = 0.45) -> list[float]:
    n = int(dur * sr)
    out = [0.0] * n
    for i in range(n):
        t = i / sr
        attack = min(1.0, t / 0.008)
        if kind == "marimba":
            env = attack * math.exp(-5.5 * t)
            val = (
                math.sin(2 * math.pi * freq * t)
                + 0.28 * math.sin(2 * math.pi * freq * 4.0 * t) * math.exp(-12 * t)
                + 0.12 * math.sin(2 * math.pi * freq * 2.0 * t)
            )
        elif kind == "crystal":
            env = attack * math.exp(-3.2 * t)
            val = (
                math.sin(2 * math.pi * freq * t)
                + 0.45 * math.sin(2 * math.pi * freq * 2.002 * t)
                + 0.22 * math.sin(2 * math.pi * freq * 3.005 * t) * math.exp(-5 * t)
            )
        elif kind == "soft":
            attack = min(1.0, t / 0.025)
            env = attack * math.exp(-2.8 * t)
            val = math.sin(2 * math.pi * freq * t) + 0.2 * math.sin(2 * math.pi * freq * 2 * t)
        else:
            env = attack * math.exp(-6.5 * t)
            val = (
                0.7 * math.sin(2 * math.pi * freq * t)
                + 0.35 * math.sin(2 * math.pi * freq * 1.5 * t)
                + 0.2 * math.sin(2 * math.pi * freq * 3.0 * t)
            )
        out[i] = val * env * vol
    return out


def mix_events(total_dur: float, events: list[tuple[float, float, float, str, float]], sr: int = 22050) -> list[float]:
    buf = [0.0] * int(total_dur * sr)
    for start, freq, dur, kind, vol in events:
        note = synth_note(freq, dur, sr, kind, vol)
        s_idx = int(start * sr)
        for i, v in enumerate(note):
            if 0 <= s_idx + i < len(buf):
                buf[s_idx + i] += v
    return buf


def build_ringtones() -> dict[str, list[float]]:
    sr = 22050
    tones: dict[str, list[float]] = {}

    events_yosa = [
        (0.00, 523.25, 0.45, "marimba", 0.48),
        (0.18, 659.25, 0.45, "marimba", 0.48),
        (0.36, 783.99, 0.45, "marimba", 0.50),
        (0.54, 987.77, 0.55, "marimba", 0.52),
        (0.82, 783.99, 0.40, "marimba", 0.42),
        (1.00, 1046.50, 0.85, "marimba", 0.56),
        (0.00, 261.63, 0.90, "soft", 0.25),
        (1.00, 349.23, 0.90, "soft", 0.25),
    ]
    tones["ring_yosa"] = mix_events(2.8, events_yosa, sr)

    dur_phone = 3.2
    buf_phone = [0.0] * int(dur_phone * sr)
    for i in range(len(buf_phone)):
        t = i / sr
        in_burst = (0.0 <= t <= 0.75) or (1.05 <= t <= 1.80)
        if in_burst:
            mod = 0.55 + 0.45 * math.sin(2 * math.pi * 20.0 * t)
            carrier = (
                0.5 * math.sin(2 * math.pi * 440.0 * t)
                + 0.5 * math.sin(2 * math.pi * 480.0 * t)
                + 0.15 * math.sin(2 * math.pi * 880.0 * t)
            )
            buf_phone[i] = carrier * mod * 0.52
    tones["ring_phone"] = buf_phone

    events_crystal = [
        (0.00, 880.00, 0.70, "crystal", 0.40),
        (0.24, 1108.73, 0.70, "crystal", 0.40),
        (0.48, 1318.51, 0.75, "crystal", 0.42),
        (0.72, 1760.00, 0.95, "crystal", 0.44),
        (1.20, 1318.51, 0.65, "crystal", 0.36),
        (1.46, 1479.98, 0.95, "crystal", 0.42),
    ]
    tones["ring_crystal"] = mix_events(3.0, events_crystal, sr)

    events_night = [
        (0.00, 392.00, 0.90, "soft", 0.42),
        (0.30, 493.88, 0.90, "soft", 0.40),
        (0.60, 587.33, 0.95, "soft", 0.42),
        (0.95, 739.99, 1.15, "soft", 0.44),
        (1.45, 659.25, 1.10, "soft", 0.40),
    ]
    tones["ring_night"] = mix_events(3.1, events_night, sr)

    events_pulse = [
        (0.00, 587.33, 0.22, "pulse", 0.48),
        (0.16, 587.33, 0.22, "pulse", 0.48),
        (0.36, 880.00, 0.40, "pulse", 0.52),
        (0.95, 587.33, 0.22, "pulse", 0.48),
        (1.11, 587.33, 0.22, "pulse", 0.48),
        (1.31, 1174.66, 0.50, "pulse", 0.52),
    ]
    tones["ring_pulse"] = mix_events(2.7, events_pulse, sr)

    return tones


def main() -> None:
    master = ensure_master_droplet()

    densities = {
        "drawable-mdpi": 48,
        "drawable-hdpi": 72,
        "drawable-xhdpi": 96,
        "drawable-xxhdpi": 144,
        "drawable-xxxhdpi": 192,
    }
    for folder, px in densities.items():
        out_p = os.path.join(ROOT, "android", "res", folder, "ic_launcher.png")
        os.makedirs(os.path.dirname(out_p), exist_ok=True)
        make_squircle_launcher_icon(master, px).save(out_p, format="PNG", optimize=True)

    web_icon_path = os.path.join(ROOT, "public", "icons", "yosa-icon.png")
    make_squircle_launcher_icon(master, 256).save(web_icon_path, format="PNG", optimize=True)

    tones = build_ringtones()
    for name, samples in tones.items():
        pub_path = os.path.join(ROOT, "public", "ringtones", f"{name}.wav")
        raw_path = os.path.join(ROOT, "android", "res", "raw", f"{name}.wav")
        write_wav(pub_path, samples)
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)
        shutil.copy2(pub_path, raw_path)

    print("Generated monochrome water-droplet icons and 5 ringtones successfully.")


if __name__ == "__main__":
    main()
