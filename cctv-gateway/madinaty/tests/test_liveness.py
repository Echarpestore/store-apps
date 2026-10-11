"""Offline test of echarpe_liveness against real Madinaty clips.
Usage: python test_liveness.py <repo madinaty dir> <clips dir> <model.tflite>"""
import sys, os, glob
import cv2, numpy as np, mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

sys.path.insert(0, sys.argv[1])
from echarpe_liveness import LivenessMonitor, EmptyStoreCorrector

CLIPS, MODEL = sys.argv[2], sys.argv[3]


def make_detector(th):
    return vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
        base_options=python.BaseOptions(model_asset_path=MODEL), score_threshold=th, max_results=20))


def detect(det, frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    h, w = frame.shape[:2]; out = []
    for d in res.detections:
        if not d.categories or str(d.categories[0].category_name).lower() != "person": continue
        b = d.bounding_box
        out.append({"score": float(d.categories[0].score),
                    "cx": (b.origin_x + b.width * .5) / w, "cy": (b.origin_y + b.height * .5) / h,
                    "bw": b.width / w, "bh": b.height / h})
    return out


def run_clip(path, threshold, step_sec):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 10
    det = make_detector(threshold)
    mon = LivenessMonitor({})
    every = max(1, int(round(fps * step_sec)))
    i = 0; rows = []
    while True:
        ok, frame = cap.read()
        if not ok: break
        if i % every == 0:
            t = i / fps
            people = detect(det, frame)
            alive = mon.update(cv2, np, 1, frame, people, 1000.0 + t)
            rows.append((t, len(people), alive, mon.scene_quiet_seconds(1, 1000.0 + t)))
        i += 1
    cap.release()
    return rows


def summarize(name, rows):
    det = [r[1] for r in rows]; alive = [r[2] for r in rows]
    tail = rows[len(rows) // 5:]          # skip warm-up
    a = [r[2] for r in tail]
    zero_share = sum(1 for x in a if x == 0) / max(1, len(a))
    print("%-14s samples=%3d detections avg=%.2f max=%d | alive avg=%.2f max=%d | alive==0 in %3.0f%% of samples"
          % (name, len(rows), sum(det) / max(1, len(det)), max(det or [0]), sum(alive) / max(1, len(alive)), max(alive or [0]), zero_share * 100))
    q = [r[3] for r in tail]; print("%-14s scene quiet>=20s in %3.0f%% of samples" % ("", 100.0 * sum(1 for v in q if v >= 20) / max(1, len(q))))
    return zero_share, sum(det) / max(1, len(det))


fails = 0
print("--- per clip (door cam threshold 0.15, cashier cam 0.45; 1 sample/sec)")
results = {}
for path in sorted(glob.glob(os.path.join(CLIPS, "*.mp4"))):
    name = os.path.basename(path)[:-4]
    th = 0.15 if "cam8" in name else 0.45
    rows = run_clip(path, th, 1.0)
    results[name] = (rows,) + summarize(name, rows)

print("--- expectations")
for name, (rows, zero_share, det_avg) in results.items():
    if name.startswith("empty"):
        ok = zero_share >= 0.95
        print(("PASS" if ok else "FAIL"), name, "empty shop must read alive==0 almost always (got %.0f%%)" % (zero_share * 100))
    else:
        if "cam4" in name:
            # The cashier camera looks straight down: the detector misses the cashier, so the
            # requirement there is scene motion, not a person box.
            # What the reset rule needs: the desk is never motionless for a whole
            # confirmation period (20s quiet + 120s confirm = 140s) while someone is there.
            finite = [r[3] for r in rows if r[3] != float("inf")]
            longest = max(finite) if finite else float("inf")
            ok = longest < 140
            print(("PASS" if ok else "FAIL"), name, "cashier desk longest motionless stretch %.0fs (must stay under 140s)" % longest)
        else:
            ok = zero_share <= 0.50
            print(("PASS" if ok else "FAIL"), name, "busy shop must show alive people most of the time (alive==0 in %.0f%%)" % (zero_share * 100))
    fails += 0 if ok else 1

print("--- corrector on combined timelines (cam4 + cam8)")
def corrector_fires(a, b, staff):
    c = EmptyStoreCorrector({}); n = min(len(a), len(b))
    for k in range(n):
        if c.step(b[k][2], staff, 2, a[k][3], 1000.0 + a[k][0]): return a[k][0]
    return None
for tag, staff, must_fire in (("empty", None, True), ("empty", 0, True), ("busy-cam?-a", 1, False), ("busy-cam?-b", 1, False), ("busy-cam?-a", 9, False), ("busy-cam?-b", 9, False)):
    if tag == "empty": a, b = results["empty-cam4"][0], results["empty-cam8"][0]
    else: a, b = results[tag.replace("?", "4")][0], results[tag.replace("?", "8")][0]
    at = corrector_fires(a, b, staff)
    ok = (at is not None) == must_fire
    print(("PASS" if ok else "FAIL"), tag, "staff=%s" % staff, "reset fired at t=%s" % (("%.0fs" % at) if at is not None else "never"), "(expected %s)" % ("fire" if must_fire else "no fire"))
    fails += 0 if ok else 1

# Negative control: without the liveness filter (raw detections) the empty shop is NOT empty.
raw_empty = results["empty-cam8"][2]
print("--- control: raw detections in the empty door clip avg=%.2f (mannequins) -> %s" % (raw_empty, "confirms raw counts are unusable" if raw_empty >= 0.5 else "no mannequin detections in this clip"))
print("FAILS=%d" % fails)
sys.exit(1 if fails else 0)
