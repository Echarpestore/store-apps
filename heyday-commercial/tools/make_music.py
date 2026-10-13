"""
HEYDAY commercial — original score, synthesised from scratch (no samples, no
third-party audio, so there are no licensing issues).

    python3 tools/make_music.py public/audio/heyday-score.wav

Hit points are aligned with src/config/timeline.ts:
  2.4s globe reveal · 5/12/19/35/43s scene transitions ·
  18.8/22.0/25.2/28.4/31.6s ordering steps · 43s CTA · 48s tagline · 54.5s end
Edit CUTS / STEPS below if the timeline changes.
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 54.5
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
CUTS = [5.0, 12.0, 19.0, 35.0, 43.0]
STEPS = [18.8, 22.0, 25.2, 28.4, 31.6]
REVEAL = 2.4
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def note_hz(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    lg = np.cos((pan + 1) * np.pi / 4)
    rg = np.sin((pan + 1) * np.pi / 4)
    L[i : i + len(sig)] += sig * lg
    R[i : i + len(sig)] += sig * rg


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    e = np.concatenate([
        np.linspace(0, 1, max(a, 1)),
        np.linspace(1, s, max(d, 1)),
        np.full(sus, s),
        np.linspace(s, 0, max(r, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def pad(notes, start, dur, gain=0.05):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = note_hz(m)
        for det in (-0.07, 0.0, 0.06):
            ff = f * 2 ** (det / 12)
            for h in range(1, 7):
                out += np.sin(2 * np.pi * ff * h * t + rng.random() * 6.28) / (h ** 1.6)
    out *= env_adsr(n, 1.2, 0.5, 0.85, 1.4)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 0.25 * t)
    return out * trem * gain / len(notes)


def pluck(m, dur=1.2, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = note_hz(m)
    out = np.zeros(n)
    for h in range(1, 6):
        out += np.sin(2 * np.pi * f * h * t) * np.exp(-t * (3 + h * 2.5 / bright)) / h
    out *= np.minimum(1, t / 0.004)
    return out


def bell(m, dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = note_hz(m)
    out = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 1.4), (2.0, 0.45, 2.2), (2.76, 0.35, 3.0), (5.4, 0.18, 5.0), (8.9, 0.08, 7)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return out * np.minimum(1, t / 0.002)


def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * gain


def shaker():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    x = np.diff(rng.standard_normal(n + 1))
    x = lowpass_fft(np.concatenate([x, np.zeros(2048)]), 9000)[:n]
    return x * np.exp(-t * 45) * 0.5


def lowpass_fft(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def whoosh(peak, pre=1.1, post=0.6, gain=0.25):
    n = int((pre + post) * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    low = lowpass_fft(noise, 500)
    high = lowpass_fft(noise, 6500) - lowpass_fft(noise, 1500)
    k = np.clip(t / pre, 0, 1) ** 2
    sig = low * (1 - k) + high * k * 0.6
    e = np.where(t < pre, (t / pre) ** 2.5, np.exp(-(t - pre) * 9))
    return sig * e * gain, peak - pre


def boom(gain=0.9):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * (38 + 30 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    s += lowpass_fft(rng.standard_normal(n), 900) * np.exp(-t * 10) * 0.6
    return s * gain


# ------------------------------------------------------------------ harmony
# D major colour: Dmaj9 – Bm9 – Gmaj9(#11) – A6sus   (4 s each = 2 bars)
CHORDS = [
    [50, 57, 61, 64, 66],  # Dmaj9
    [47, 54, 57, 61, 62],  # Bm9
    [43, 50, 54, 57, 61],  # Gmaj9
    [45, 52, 54, 59, 62],  # A6sus
]
ROOTS = [38, 35, 31, 33]


def chord_at(t):
    return int((t // 4) % 4)


# Intro drone + shimmer (0–2.4)
add(pad([50, 57, 62, 69], 0.0, 5.2, gain=0.05), 0.0)
for i, m in enumerate([86, 81, 90, 88, 93, 86]):
    add(bell(m, 1.6), 0.25 + i * 0.32, pan=(-0.6 + i * 0.25), gain=0.05)
w, st = whoosh(REVEAL, pre=1.6, post=0.4, gain=0.08)
add(w, st, gain=1)
# reveal hit
add(boom(0.7), REVEAL)
add(pad(CHORDS[0], REVEAL, 3.2, gain=0.06), REVEAL)
for i, m in enumerate([74, 78, 81, 85, 86]):
    add(bell(m, 2.6), REVEAL + i * 0.11, pan=(-0.5 + i * 0.25), gain=0.06)
# wordmark sparkle
for i, m in enumerate([93, 90, 97]):
    add(bell(m, 1.8), 3.1 + i * 0.12, pan=0.3 * (i - 1), gain=0.035)

# Main body (5 → 43): pad + bass + arpeggio + rhythm with dynamics
ARP = [0, 2, 3, 4, 3, 2, 1, 2]
t = 4.0
while t < 43.0:
    c = chord_at(t)
    start_pad = t
    add(pad(CHORDS[c], start_pad, 4.6, gain=0.055), start_pad, pan=0)
    t += 4.0

def section_level(tt):
    if tt < 5:
        return 0
    if tt < 12:
        return 0.6
    if tt < 19:
        return 0.75
    if tt < 35:
        return 1.0
    if tt < 37:
        return 0.45
    return 0.85

step = BEAT / 2
tt = 5.0
k = 0
while tt < 43.0 - 1e-6:
    lvl = section_level(tt)
    c = chord_at(tt)
    notes = CHORDS[c]
    m = notes[ARP[k % 8]] + 12
    add(pluck(m, 1.0, bright=0.8 + 0.4 * lvl), tt, pan=0.35 * np.sin(k * 0.7), gain=0.06 * (0.5 + 0.5 * lvl))
    beat_pos = k % 8
    if lvl >= 0.7 and beat_pos in (0, 4):
        add(kick(0.55 * lvl), tt)
    if lvl >= 0.6:
        add(shaker(), tt + (0.015 if k % 2 else 0), pan=0.5, gain=0.03 * lvl * (1.3 if k % 2 else 0.7))
    if beat_pos == 0:
        add(pluck(ROOTS[c], 2.0, bright=0.3) * 0.9, tt, gain=0.16 * max(lvl, 0.4))
    tt += step
    k += 1

# transitions
for c_ in CUTS:
    w, st = whoosh(c_, gain=0.09)
    add(w, st)
add(boom(0.45), 19.0)
# ordering steps — soft confirmation chimes
for i, s in enumerate(STEPS):
    for j, m in enumerate([81, 86]):
        add(bell(m + (i % 2) * 2, 1.5), s + j * 0.09, pan=0.4 * (j * 2 - 1), gain=0.045)
# approval "ding" (step 3 → approved)
add(bell(93, 2.0), 25.2 + 2.6, gain=0.05)
# outline → product moment in scene 5
for i, m in enumerate([78, 81, 85, 90]):
    add(bell(m, 2.2), 34.4 + 6.0 + i * 0.1, pan=-0.3 + i * 0.2, gain=0.04)

# CTA (43 → end): impact, warm resolve, no drums
add(boom(0.8), 43.0)
add(pad([38, 50, 57, 61, 64, 66], 43.0, 5.0, gain=0.07), 43.0)
add(pad([43, 50, 54, 57, 62, 66], 47.6, 4.2, gain=0.065), 47.6)
add(pad([38, 50, 57, 62, 64, 69, 74], 51.4, 3.1, gain=0.07), 51.4)
tt = 43.0
k = 0
while tt < 51.0:
    c = 0 if tt < 47.6 else 2
    m = CHORDS[c][ARP[k % 8]] + 24
    add(pluck(m, 1.4, 0.6), tt, pan=0.4 * np.sin(k), gain=0.035)
    tt += BEAT
    k += 1
for i, m in enumerate([86, 90, 93, 98]):
    add(bell(m, 3.0), 48.0 + i * 0.14, pan=-0.45 + i * 0.3, gain=0.045)
add(bell(74, 4.0), 51.4, gain=0.06)
add(bell(86, 4.0), 51.45, gain=0.04)

# ------------------------------------------------------------------ reverb
def reverb(x, seconds=2.6, mix=0.28):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 3.2)
    ir = lowpass_fft(ir, 6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + y * mix


L = reverb(L)
R = reverb(R)

# master: gentle glue, fade out, normalise
fade = np.ones(N)
fn = int(1.2 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
fi = int(0.05 * SR)
fade[:fi] = np.linspace(0, 1, fi)
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.3) / np.tanh(1.3) * 0.89
R = np.tanh(R / peak * 1.3) / np.tanh(1.3) * 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'public/audio/heyday-score.wav'
data = (np.stack([L, R], axis=1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print('wrote', out, f'{DUR}s')
