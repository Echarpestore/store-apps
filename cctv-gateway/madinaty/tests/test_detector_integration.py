"""Runs the real patched detector loop against recorded clips (no cameras, no agent).
Usage: python test_detector_integration.py <madinaty dir> <clips dir> <model> <empty|busy> <seconds>
empty: door count preset to 2 in an empty shop  -> must be reset to 0 (visual_empty_reset)
busy : door count preset to 2 in a busy shop    -> must stay 2 (no reset)"""
import sys, os, json, time, threading, tempfile, importlib.util

mad, clips, model, mode, seconds = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
spec = importlib.util.spec_from_file_location("detector", os.path.join(mad, "ECHARPE-MADINATY-PERSON-DETECTOR.py"))
det = importlib.util.module_from_spec(spec); spec.loader.exec_module(det)

root = tempfile.mkdtemp(prefix="cctvtest-")
os.makedirs(os.path.join(root, "logs"), exist_ok=True)
det.ROOT = root
det.CONFIG_PATH = os.path.join(mad, "activity-config.json")
det.MODEL_PATH = model
det.PID_PATH = os.path.join(root, "detector.pid")
det.LOG_PATH = os.path.join(root, "logs", "detector.log")
det.TRAFFIC_PATH = os.path.join(root, "traffic.json")
det.OCCUPANCY_PATH = os.path.join(root, "occupancy.json")
tag = "empty" if mode == "empty" else "busy"
c4 = os.path.join(clips, ("empty-cam4.mp4" if mode == "empty" else "busy-cam4-a.mp4"))
c8 = os.path.join(clips, ("empty-cam8.mp4" if mode == "empty" else "busy-cam8-a.mp4"))
det.STREAMS = {4: c4, 5: c8, 7: c8, 8: c8}

# Preset a drifted door count for today's business day, fresh enough to be "continuous".
cfg = det.cfgload()
with open(det.OCCUPANCY_PATH, "w", encoding="utf-8") as f:
    json.dump({"version": 662, "businessDay": det.business_day_key(time.time(), cfg), "customersInside": 2,
               "updatedAtMs": int(time.time() * 1000), "lastEvent": "entry"}, f)

states = []
staff_count = 0 if mode == "empty" else 1
def fake_req(path, payload=None):
    if path == "/echarpe-playback/staff-state":
        return {"ok": True, "generatedAtMs": int(time.time() * 1000) - 1500, "activeStaffCount": staff_count, "source": "test"}
    if path == "/echarpe-playback/activity-state" and payload is not None:
        states.append(payload)
    return {"ok": True}
det.req = fake_req

# Play the clips in real time: read() returns the frame for "now", like a live RTSP stream.
import cv2
_RealCapture = cv2.VideoCapture
class RealtimeCapture:
    def __init__(self, path, *a):
        self.cap = _RealCapture(path); self.t0 = time.time()
        fps = self.cap.get(cv2.CAP_PROP_FPS) or 10
        self.duration_ms = max(1000.0, 1000.0 * (self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps - 2000.0)
    def isOpened(self): return self.cap.isOpened()
    def set(self, *a): return True
    def release(self): self.cap.release()
    def read(self):
        self.cap.set(cv2.CAP_PROP_POS_MSEC, ((time.time() - self.t0) * 1000.0) % self.duration_ms)
        return self.cap.read()
cv2.VideoCapture = RealtimeCapture

threading.Thread(target=det.run, daemon=True).start()
t0 = time.time()
while time.time() - t0 < seconds:
    time.sleep(5)
    if mode == "empty" and states and states[-1].get("customersInside") == 0:
        break

if not states:
    print("FAIL no state was published (detector loop did not run)"); sys.exit(1)
last = states[-1]
first = states[0]
print("mode=%s ran=%.0fs states=%d first.customersInside=%s last.customersInside=%s alivePeople=%s emptyResets=%s lastEvent=%s cameraPeople=%s"
      % (mode, time.time() - t0, len(states), first.get("customersInside"), last.get("customersInside"), last.get("alivePeople"),
         last.get("emptyResets"), last.get("occupancyLastEvent"), json.dumps(last.get("cameraPeople"))))
try:
    with open(det.LOG_PATH, encoding="utf-8") as f:
        for line in f.read().splitlines():
            if "visual_empty_reset" in line or "detector_v" in line: print("log:", line)
except Exception: pass

if mode == "empty":
    ok = (first.get("customersInside") == 2 and last.get("customersInside") == 0 and last.get("occupancyLastEvent") == "visual_empty_reset")
else:
    # Door crossings in the clip may legitimately move the count; what must NOT happen is a visual reset.
    ok = (last.get("emptyResets") == 0)
print("PASS" if ok else "FAIL", mode)
sys.stdout.flush(); os._exit(0 if ok else 1)
