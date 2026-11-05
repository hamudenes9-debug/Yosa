#!/usr/bin/env python3
"""Generates Yosa AI PNG app icons and 5 realistic polyphonic WAV ringtones."""
import math
import os
import shutil
import struct
import wave
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write_png(path: str, width: int, height: int, rgba_bytes: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0
        raw.extend(rgba_bytes[y * stride : (y + 1) * stride])

    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def render_yosa_icon(size: int) -> bytes:
    buf = bytearray(size * size * 4)
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    half = size / 2.0
    corner_r = size * 0.23

    for y in range(size):
        ny = (y - cy) / half  # -1..1
        for x in range(size):
            nx = (x - cx) / half  # -1..1

            # Rounded squircle signed distance
            qx = max(abs(x - cx) - (half - corner_r), 0.0)
            qy = max(abs(y - cy) - (half - corner_r), 0.0)
            dist_edge = math.hypot(qx, qy) - corner_r

            if dist_edge > 0.7:
                continue
            alpha = 1.0 if dist_edge < -0.7 else max(0.0, min(1.0, 0.5 - dist_edge / 1.4))

            # Deep midnight navy -> emerald/cyan radial glow background
            r_norm = math.hypot(nx, ny)
            glow = math.exp(-2.6 * (r_norm ** 2))
            bg_r = 10 + 14 * glow
            bg_g = 18 + 65 * glow
            bg_b = 34 + 82 * glow

            # Outer glowing call ring
            ring_dist = abs(r_norm - 0.68)
            ring_alpha = math.exp(-((ring_dist / 0.045) ** 2))
            # Gradient from emerald (#10b981) to cyan (#06b6d4)
            grad_t = (nx + ny + 2.0) / 4.0
            ac_r = 16 * (1 - grad_t) + 6 * grad_t
            ac_g = 185 * (1 - grad_t) + 182 * grad_t
            ac_b = 129 * (1 - grad_t) + 212 * grad_t

            r = bg_r * (1 - 0.85 * ring_alpha) + ac_r * (0.85 * ring_alpha)
            g = bg_g * (1 - 0.85 * ring_alpha) + ac_g * (0.85 * ring_alpha)
            b = bg_b * (1 - 0.85 * ring_alpha) + ac_b * (0.85 * ring_alpha)

            # Second subtle pulse ring
            ring2_dist = abs(r_norm - 0.82)
            ring2_alpha = 0.35 * math.exp(-((ring2_dist / 0.025) ** 2))
            r = r * (1 - ring2_alpha) + ac_r * ring2_alpha
            g = g * (1 - ring2_alpha) + ac_g * ring2_alpha
            b = b * (1 - ring2_alpha) + ac_b * ring2_alpha

            # Center stylized 5-bar AI voice equalizer capsules
            bars = [
                (-0.34, 0.16),
                (-0.17, 0.30),
                (0.00, 0.42),
                (0.17, 0.28),
                (0.34, 0.16),
            ]
            bar_half_w = 0.048
            bar_hit = 0.0
            for bx, bh in bars:
                dx = abs(nx - bx)
                dy = max(abs(ny) - bh, 0.0)
                d_capsule = math.hypot(dx, dy) - bar_half_w
                if d_capsule < 0.03:
                    bar_hit = max(bar_hit, max(0.0, min(1.0, (0.02 - d_capsule) / 0.035)))

            if bar_hit > 0:
                # Crisp white-mint core for voice bars
                br = 235 * (1 - 0.25 * grad_t) + 160 * (0.25 * grad_t)
                bg2 = 255
                bb = 248
                r = r * (1 - bar_hit) + br * bar_hit
                g = g * (1 - bar_hit) + bg2 * bar_hit
                b = b * (1 - bar_hit) + bb * bar_hit

            idx = (y * size + x) * 4
            buf[idx] = max(0, min(255, int(r)))
            buf[idx + 1] = max(0, min(255, int(g)))
            buf[idx + 2] = max(0, min(255, int(b)))
            buf[idx + 3] = max(0, min(255, int(alpha * 255)))

    return bytes(buf)


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
        else:  # pulse
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

    # 1. Yosa Imza (Warm Smartphone Marimba Arpeggio)
    events_yosa = [
        (0.00, 523.25, 0.45, "marimba", 0.48),  # C5
        (0.18, 659.25, 0.45, "marimba", 0.48),  # E5
        (0.36, 783.99, 0.45, "marimba", 0.50),  # G5
        (0.54, 987.77, 0.55, "marimba", 0.52),  # B5
        (0.82, 783.99, 0.40, "marimba", 0.42),  # G5
        (1.00, 1046.50, 0.85, "marimba", 0.56), # C6
        # Soft bass root
        (0.00, 261.63, 0.90, "soft", 0.25),
        (1.00, 349.23, 0.90, "soft", 0.25),
    ]
    tones["ring_yosa"] = mix_events(2.8, events_yosa, sr)

    # 2. Klasik Ahize Zili (Realistic Dual-Frequency 440+480Hz modulated at 20Hz)
    dur_phone = 3.2
    buf_phone = [0.0] * int(dur_phone * sr)
    for i in range(len(buf_phone)):
        t = i / sr
        # Two bursts: 0.0..0.75 and 1.05..1.80, then pause
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

    # 3. Kristal Melodi (Bright Bell Chimes)
    events_crystal = [
        (0.00, 880.00, 0.70, "crystal", 0.40),  # A5
        (0.24, 1108.73, 0.70, "crystal", 0.40), # C#6
        (0.48, 1318.51, 0.75, "crystal", 0.42), # E6
        (0.72, 1760.00, 0.95, "crystal", 0.44), # A6
        (1.20, 1318.51, 0.65, "crystal", 0.36), # E6
        (1.46, 1479.98, 0.95, "crystal", 0.42), # F#6
    ]
    tones["ring_crystal"] = mix_events(3.0, events_crystal, sr)

    # 4. Gece Ritmi (Calm Warm Evening Chord Melody)
    events_night = [
        (0.00, 392.00, 0.90, "soft", 0.42),     # G4
        (0.30, 493.88, 0.90, "soft", 0.40),     # B4
        (0.60, 587.33, 0.95, "soft", 0.42),     # D5
        (0.95, 739.99, 1.15, "soft", 0.44),     # F#5
        (1.45, 659.25, 1.10, "soft", 0.40),     # E5
    ]
    tones["ring_night"] = mix_events(3.1, events_night, sr)

    # 5. Dijital Nabiz (Modern AI Call Pulse)
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
    # 1. Icons
    densities = {
        "drawable-mdpi": 48,
        "drawable-hdpi": 72,
        "drawable-xhdpi": 96,
        "drawable-xxhdpi": 144,
        "drawable-xxxhdpi": 192,
    }
    for folder, px in densities.items():
        icon_bytes = render_yosa_icon(px)
        write_png(os.path.join(ROOT, "android", "res", folder, "ic_launcher.png"), px, px, icon_bytes)

    web_icon = render_yosa_icon(256)
    write_png(os.path.join(ROOT, "public", "icons", "yosa-icon.png"), 256, 256, web_icon)

    # 2. Ringtones
    tones = build_ringtones()
    for name, samples in tones.items():
        pub_path = os.path.join(ROOT, "public", "ringtones", f"{name}.wav")
        raw_path = os.path.join(ROOT, "android", "res", "raw", f"{name}.wav")
        write_wav(pub_path, samples)
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)
        shutil.copy2(pub_path, raw_path)

    print("Generated Yosa AI icons and 5 ringtones successfully.")


if __name__ == "__main__":
    main()
