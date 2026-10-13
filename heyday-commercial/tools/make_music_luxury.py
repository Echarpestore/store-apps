"""
"Presentes que ficam" — original score for the HEYDAY luxury film.
Synthesised from scratch (no samples): felt piano, warm strings pad, cello
drone, glass bells, soft heartbeat pulse.

    python3 tools/make_music_luxury.py /tmp/raw.wav
    (then loudness-normalise, see package.json "music:luxury")

Hit points follow src/luxury/timeline.ts:
  4.5 flake lands · 8–13.5 camera pull-back · 14 ordinary gifts · 16.2 dust ·
  17.6 "fica" · 18.6 shake (glitter) · 20.5 gallery (4 photos) · 27.5 logo · 34 end
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 34.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
LAND, PULL, REVEAL, CONTRAST, DUST, STAYS, SHAKE, GALLERY, END = 4.5, 8.0, 13.5, 14.0, 16.2, 17.6, 18.6, 20.5, 27.5
PHOTO_SLOT = (END - GALLERY - 0.5) / 4

L = np.zeros(N)
R = np.zeros(N)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.cos((pan + 1) * np.pi / 4)
    R[i : i + len(sig)] += sig * np.sin((pan + 1) * np.pi / 4)


def lowpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / cutoff) ** 4), len(x))


def env(n, a, r):
    e = np.ones(n)
    na = min(int(a * SR), n)
    nr = min(int(r * SR), n)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def piano(m, dur=3.0, vel=1.0):
    """Felt piano: soft attack, warm harmonics, long decay, slight detune."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    out = np.zeros(n)
    for h, a in ((1, 1.0), (2, 0.42), (3, 0.18), (4, 0.09), (5, 0.04)):
        dec = 0.9 + h * 0.9
        out += a * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h)) * np.exp(-t * dec / (1 + 0.6 * vel))
    out += 0.3 * np.sin(2 * np.pi * f * 1.002 * t) * np.exp(-t * 1.2)
    out *= np.minimum(1, t / 0.012) * env(n, 0, 0.3)
    return lowpass(out, 2500 + 2500 * vel) * vel


def strings(notes, start, dur, gain=0.05, attack=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        for det in (-0.08, 0.0, 0.07):
            f = hz(m) * 2 ** (det / 12)
            vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + rng.random() * 6)
            ph = 2 * np.pi * np.cumsum(f * vib) / SR
            for h in range(1, 6):
                out += np.sin(h * ph + rng.random() * 6) / h ** 1.8
    out = lowpass(out, 3200)
    out *= env(n, attack, 1.8)
    add(out / len(notes), start, gain=gain)


def bell(m, dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    out = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 1.2), (2.0, 0.4, 2.0), (2.76, 0.3, 2.8), (5.4, 0.14, 4.5), (8.9, 0.06, 7)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return out * np.minimum(1, t / 0.002)


def boom(gain=0.8):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * (34 + 24 * np.exp(-t * 5)) * t) * np.exp(-t * 1.6)
    s += lowpass(rng.standard_normal(n), 600) * np.exp(-t * 8) * 0.4
    return s * gain


def heartbeat(gain=0.4):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 42 + 50 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * gain


def swell(end, length=2.2, gain=0.12, bright=2600):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = lowpass(rng.standard_normal(n), bright)
    add(x * (t / length) ** 3, end - length, gain=gain * 0.45)


# ---------------------------------------------------------------- 0 – 4.5: one flake
strings([38, 50], 0.0, 6.0, gain=0.05, attack=2.5)  # low D drone
for i, (m, tt) in enumerate([(81, 0.9), (77, 2.0), (74, 3.1)]):
    add(piano(m, 4.0, 0.55), tt, pan=-0.2 + 0.2 * i, gain=0.16)
for i in range(10):
    add(bell(93 + (i % 3) * 2, 1.4), 0.4 + i * 0.4, pan=np.sin(i), gain=0.012)
swell(LAND, 2.4, 0.07)

# ---------------------------------------------------------------- 4.5: landing, macro glass
add(boom(0.55), LAND)
add(bell(74, 4.0), LAND, gain=0.07)
add(bell(86, 4.0), LAND + 0.04, gain=0.04)
strings([50, 53, 57, 60, 64], LAND, 4.0, gain=0.055)  # Dm9

# ---------------------------------------------------------------- 8 – 13.5: pull-back
PROG = [([46, 53, 57, 62, 65], 46), ([41, 53, 57, 60, 64], 41), ([43, 50, 55, 58, 62], 43)]  # Bbmaj7, Fmaj7, Gm9
t0 = PULL
for chord, root in PROG:
    strings(chord, t0, 2.4, gain=0.06)
    add(piano(root - 12 + 12, 3.0, 0.5), t0, gain=0.18)
    for j, m in enumerate([chord[2] + 12, chord[3] + 12, chord[4] + 12, chord[3] + 12]):
        add(piano(m, 2.4, 0.5), t0 + j * 0.45, pan=-0.3 + 0.2 * j, gain=0.12)
    t0 += 1.85
swell(REVEAL, 2.8, 0.09)
for i, m in enumerate([86, 89, 93, 98]):
    add(bell(m, 2.4), 11.9 + i * 0.09, pan=-0.4 + 0.27 * i, gain=0.03)

# ---------------------------------------------------------------- 14 – 17.6: ordinary gifts, dust
strings([43, 50, 55, 58], CONTRAST, 3.8, gain=0.04, attack=0.8)  # Gm, thin
add(piano(67, 3.0, 0.4), CONTRAST + 0.4, gain=0.12)
add(piano(62, 3.0, 0.4), CONTRAST + 1.6, gain=0.11)
for i in range(16):  # dust drifting away: soft descending glints
    add(bell(96 - i, 1.0), DUST + i * 0.09, pan=0.6 - i * 0.05, gain=0.012 * (1 - i / 18))

# ---------------------------------------------------------------- 17.6: "fica" — warm F major
add(boom(0.35), STAYS)
strings([41, 53, 57, 60, 65, 69], STAYS, 3.2, gain=0.07, attack=0.6)
for j, m in enumerate([72, 76, 77, 81]):
    add(piano(m, 3.0, 0.7), STAYS + j * 0.22, pan=-0.3 + 0.2 * j, gain=0.13)

# ---------------------------------------------------------------- 18.6: shake — glitter swirl
pent = [77, 79, 81, 84, 86, 89, 91, 93, 96]
for i in range(34):
    m = pent[int(rng.random() * len(pent))]
    add(bell(m, 1.0), SHAKE + 0.05 + rng.random() * 1.1, pan=rng.random() * 1.6 - 0.8, gain=0.018)
swell(SHAKE + 0.5, 0.9, 0.05, 7000)

# ---------------------------------------------------------------- 20.5 – 27.5: the real work
GAL = [([41, 53, 57, 60, 65], 41), ([40, 52, 55, 60, 64], 40), ([38, 53, 57, 62, 65], 38), ([46, 53, 58, 62, 65], 46)]  # F, C/E, Dm, Bb
for i, (chord, root) in enumerate(GAL):
    tt = GALLERY + 0.3 + i * PHOTO_SLOT
    strings(chord, tt, PHOTO_SLOT + 0.8, gain=0.065, attack=0.5)
    add(piano(root, 3.0, 0.8), tt, gain=0.2)
    for j, m in enumerate(chord[2:] + [chord[3] + 12]):
        add(piano(m + 12, 2.4, 0.6), tt + j * 0.4, pan=-0.35 + 0.23 * j, gain=0.1)
    add(bell(chord[-1] + 24, 2.0), tt, gain=0.025)
    for b in range(2):
        add(heartbeat(0.32), tt + b * PHOTO_SLOT / 2)
swell(END, 1.8, 0.1)

# ---------------------------------------------------------------- 27.5: logo, resolve
add(boom(0.75), END)
strings([41, 48, 53, 57, 60, 65, 69, 72], END, DUR - END, gain=0.075, attack=0.4)  # Fadd9 wide
add(piano(41, 5.0, 0.9), END, gain=0.22)
add(piano(53, 5.0, 0.8), END + 0.05, gain=0.16)
for i, m in enumerate([77, 81, 84, 89]):
    add(bell(m, 4.0), END + 1.2 + i * 0.14, pan=-0.45 + 0.3 * i, gain=0.04)
for j, m in enumerate([72, 77, 79, 81]):
    add(piano(m, 4.0, 0.6), END + 2.0 + j * 0.45, pan=-0.2 + 0.15 * j, gain=0.11)
add(bell(89, 5.0), END + 3.6, gain=0.035)


# ---------------------------------------------------------------- reverb + master
def reverb(x, seconds=3.6, mix=0.34):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = lowpass(rng.standard_normal(n) * np.exp(-t * 2.4), 5200)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + y * mix


L = reverb(L)
R = reverb(R)
fade = np.ones(N)
fn = int(2.0 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 1.6
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.2) / np.tanh(1.2) * 0.89
R = np.tanh(R / peak * 1.2) / np.tanh(1.2) * 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'public/audio/heyday-luxury.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.stack([L, R], axis=1) * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR}s')
