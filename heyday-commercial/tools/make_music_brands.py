"""
"A próxima pode ser a sua marca" — original score for the HEYDAY brands film.
Synthesised from scratch (no samples): felt piano, warm strings pad, cello
drone, glass bells, soft heartbeat pulse.

    python3 tools/make_music_luxury.py /tmp/raw.wav
    (then loudness-normalise, see package.json "music:brands")

Hit points follow src/brands/timeline.ts:
  3.2 + k·1.9 each brand globe lands (7 bars at 126 BPM) · 16.6 shelf ·
  19.4 shake · 21 real photos · 25.5 "A próxima pode ser a sua marca" · 32 end
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 32.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
TRACK, STEP, SHELF, SHAKE, PROOF, CTA = 3.2, 1.9, 16.6, 19.4, 21.0, 25.5
BEAT = STEP / 4  # 126 BPM: one brand every bar
ARRIVALS = [TRACK + k * STEP for k in range(7)]

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




def kick(gain=0.6):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) * gain


def clap(gain=0.25):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = lowpass(x, 6000) - lowpass(x, 1200)
    e = np.exp(-t * 22) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 26) * (t > 0.012)
    return x * e * gain


def hat(gain=0.05):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    return (x - lowpass(x, 7000)) * np.exp(-t * 60) * gain


CH = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]]  # D, Bm, G, A
ROOT = [38, 35, 31, 33]

# ---------------------------------------------------------------- 0 – 3.2: intro, anticipation
strings([50, 57, 62, 66], 0.0, 3.6, gain=0.05, attack=1.2)
for i in range(6):
    add(piano(74 + [0, 4, 7, 12, 7, 4][i], 1.6, 0.6), 0.5 + i * BEAT, pan=-0.3 + 0.12 * i, gain=0.1)
swell(TRACK, 1.6, 0.12, 4000)

# ---------------------------------------------------------------- 3.2 – 16.6: one brand per bar
for k, a in enumerate(ARRIVALS):
    c = k % 4
    strings(CH[c], a, STEP + 0.4, gain=0.05, attack=0.15)
    add(piano(ROOT[c], 2.0, 0.9), a, gain=0.26)
    for b in range(4):
        tb = a + b * BEAT
        add(kick(0.55), tb)
        if b in (1, 3):
            add(clap(0.22), tb, pan=0.1)
        for h in range(2):
            add(hat(0.045), tb + h * BEAT / 2, pan=0.4)
        add(piano(CH[c][2 + (b % 3)] + 12, 0.9, 0.7), tb + BEAT / 2, pan=-0.25 + 0.2 * (b % 3), gain=0.08)
    add(bell(CH[c][-1] + 24, 1.6), a, pan=0.2 * (k % 3 - 1), gain=0.05)  # the landing "ping"
    w = lowpass(rng.standard_normal(int(0.5 * SR)), 3000)
    add(w * np.linspace(0, 1, len(w)) ** 2, a - 0.5, gain=0.035)  # whoosh into each landing

# ---------------------------------------------------------------- 16.6: shelf — all together
swell(SHELF + 1.1, 1.4, 0.12, 5000)
add(boom(0.6), SHELF + 1.1)
strings([38, 50, 57, 62, 66, 69, 74], SHELF + 1.1, 3.4, gain=0.07, attack=0.2)
for i, m in enumerate([74, 78, 81, 86, 90]):
    add(piano(m, 2.4, 0.8), SHELF + 1.1 + i * 0.12, pan=-0.4 + 0.2 * i, gain=0.1)
for b in range(int((PROOF - SHELF - 1.1) / BEAT)):
    add(kick(0.4), SHELF + 1.1 + b * BEAT)
# shake: glitter
pent = [74, 76, 78, 81, 83, 86, 88, 90, 93]
for i in range(30):
    add(bell(pent[int(rng.random() * len(pent))], 1.0), SHAKE + rng.random() * 1.0, pan=rng.random() * 1.6 - 0.8, gain=0.02)

# ---------------------------------------------------------------- 21: real photos — pulse drops back
strings([43, 50, 55, 59, 62], PROOF, 2.4, gain=0.06, attack=0.4)
strings([45, 52, 57, 61, 64], PROOF + 2.25, 2.4, gain=0.06, attack=0.4)
for b in range(int((CTA - PROOF) / BEAT)):
    tb = PROOF + b * BEAT
    if b % 2 == 0:
        add(kick(0.35), tb)
    add(hat(0.03), tb + BEAT / 2, pan=0.4)
add(bell(86, 2.0), PROOF + 0.2, gain=0.04)
add(bell(88, 2.0), PROOF + 0.4, gain=0.04)
swell(CTA, 1.5, 0.1, 4500)

# ---------------------------------------------------------------- 25.5: CTA — resolve
add(boom(0.75), CTA)
strings([38, 50, 57, 62, 66, 69, 74], CTA, DUR - CTA, gain=0.075, attack=0.3)
add(piano(38, 5.0, 1.0), CTA, gain=0.26)
add(piano(50, 5.0, 0.9), CTA + 0.03, gain=0.18)
for i, m in enumerate([74, 78, 81, 86]):
    add(piano(m, 3.0, 0.7), CTA + 0.9 + i * 0.24, pan=-0.3 + 0.2 * i, gain=0.11)
for i, m in enumerate([86, 90, 93]):
    add(bell(m, 3.0), CTA + 1.8 + i * 0.14, pan=-0.3 + 0.3 * i, gain=0.04)


# ---------------------------------------------------------------- reverb + master
def reverb(x, seconds=2.4, mix=0.24):
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
out = sys.argv[1] if len(sys.argv) > 1 else 'public/audio/heyday-brands.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.stack([L, R], axis=1) * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR}s')
