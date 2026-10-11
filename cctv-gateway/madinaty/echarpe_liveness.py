"""ECHARPE CCTV - liveness check for person detections (v720).

Why: the door counter (entries minus exits) drifts, and it has no way back to zero.
The shop also has mannequins that the detector labels "person", so raw person counts
cannot be used to correct it. A mannequin never moves; a person does, even when
standing. This module answers one question per camera: how many detected persons
sit on image area that actually changed recently?

LivenessMonitor  - per camera, remembers when each grid cell last changed and counts
                   the person boxes that overlap recently-changed cells ("alive").
EmptyStoreCorrector - decides when the door-count occupancy may be forced back to 0:
                   only after the alive count stayed at or below the staff count
                   for a confirmation period. It never raises occupancy.

Pure numpy + cv2, no I/O, so it is unit-tested offline against recorded clips.
"""

GRID_W, GRID_H = 32, 18
SMALL_W, SMALL_H = 160, 90


class LivenessMonitor:
    def __init__(self, cfg=None):
        cfg = cfg or {}
        self.alive_window = float(cfg.get("aliveWindowSeconds", 30))      # motion memory per cell
        self.pixel_delta = int(cfg.get("alivePixelDelta", 14))            # gray-level change that counts
        self.cell_fraction = float(cfg.get("aliveCellFraction", 0.18))    # share of a cell that must change
        self.box_fraction = float(cfg.get("aliveBoxFraction", 0.10))      # share of a box's cells recently changed
        self.global_reject = float(cfg.get("aliveGlobalReject", 0.55))    # whole-image change = lighting, ignore
        self.max_gap = float(cfg.get("aliveMaxFrameGapSeconds", 5))
        self.min_gap = float(cfg.get("aliveMinFrameGapSeconds", 0.8))
        self.stale_after = float(cfg.get("aliveStaleSeconds", 6))
        self._prev = {}      # cam -> (ts, small gray)
        self._motion = {}    # cam -> GRID_H x GRID_W array of last-change timestamps
        self._alive = {}     # cam -> (ts, alive count)
        self.overlay_rows = int(cfg.get("aliveOverlayRows", 3))           # top grid rows hold the camera clock
        self.scene_min_cells = int(cfg.get("sceneMotionMinCells", 3))     # changed cells that count as scene motion
        self._scene = {}     # cam -> ts of the last frame with real scene motion

    def update(self, cv2, np, cam, frame, people, now):
        """Feed one frame and its person boxes. Returns the alive count for this camera."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.GaussianBlur(cv2.resize(gray, (SMALL_W, SMALL_H), interpolation=cv2.INTER_AREA), (5, 5), 0)
        motion = self._motion.get(cam)
        if motion is None:
            motion = np.zeros((GRID_H, GRID_W), dtype=np.float64)
            self._motion[cam] = motion
        prev = self._prev.get(cam)
        # Compare against a reference about a second old, not the previous frame: the door
        # camera is sampled several times a second and frame-to-frame change is too small.
        if prev is None or (now - prev[0]) >= self.min_gap or (now - prev[0]) < 0:
            self._prev[cam] = (now, small)
        else:
            prev = None
        if prev is not None and 0 < (now - prev[0]) <= self.max_gap:
            changed = (cv2.absdiff(small, prev[1]) >= self.pixel_delta).astype(np.float32)
            cells = cv2.resize(changed, (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
            active = cells >= self.cell_fraction
            # A change across most of the image is a lighting/exposure jump, not people.
            if float(active.mean()) < self.global_reject:
                motion[active] = now
                # Scene motion ignores the on-screen clock, which changes every second.
                if int(active[self.overlay_rows:, :].sum()) >= self.scene_min_cells:
                    self._scene[cam] = now
        alive = 0
        for p in people or []:
            if self._box_alive(np, motion, p, now):
                alive += 1
                p["alive"] = True
            else:
                p["alive"] = False
        self._alive[cam] = (now, alive)
        return alive

    def _box_alive(self, np, motion, p, now):
        cx, cy = float(p.get("cx") or 0), float(p.get("cy") or 0)
        bw, bh = float(p.get("bw") or 0), float(p.get("bh") or 0)
        # Use the inner 80% of the box so a passer-by brushing the edge does not wake a mannequin.
        x0 = int(max(0, (cx - bw * 0.40) * GRID_W)); x1 = int(min(GRID_W, (cx + bw * 0.40) * GRID_W + 1))
        y0 = int(max(0, (cy - bh * 0.40) * GRID_H)); y1 = int(min(GRID_H, (cy + bh * 0.40) * GRID_H + 1))
        if x1 <= x0 or y1 <= y0:
            return False
        region = motion[y0:y1, x0:x1]
        recent = (region > 0) & ((now - region) <= self.alive_window)
        return float(recent.mean()) >= self.box_fraction

    def alive_total(self, now):
        """Sum of alive persons over cameras that reported recently."""
        return sum(n for (ts, n) in self._alive.values() if (now - ts) <= self.stale_after)

    def scene_quiet_seconds(self, cam, now):
        """Seconds since anything at all moved in this camera (person detected or not)."""
        ts = self._scene.get(cam)
        return float("inf") if ts is None else max(0.0, now - ts)

    def cameras_reporting(self, now):
        return sum(1 for (ts, _) in self._alive.values() if (now - ts) <= self.stale_after)


class EmptyStoreCorrector:
    """Says when occupancy may be reset to zero. Conservative on purpose:
    a false reset creates a false 'sale without customer' alert."""

    def __init__(self, cfg=None):
        cfg = cfg or {}
        self.confirm = float(cfg.get("emptyResetConfirmSeconds", 120))
        self.min_cameras = int(cfg.get("emptyResetMinCameras", 2))
        self.cashier_quiet = float(cfg.get("emptyResetCashierQuietSeconds", 20))
        self._since = None

    def step(self, alive_total, staff_count, cameras_reporting, cashier_quiet_seconds, now):
        """staff_count None = attendance unknown -> only a completely still shop counts as empty.
        cashier_quiet_seconds: time since ANY motion on the cashier camera. That camera looks
        straight down and the detector misses people there, so a customer paying at the desk
        is only visible as motion; any recent motion there blocks the reset.
        Returns True once the empty condition has held for the whole confirmation period."""
        allowed = int(staff_count) if staff_count is not None else 0
        if cameras_reporting < self.min_cameras or alive_total > allowed or cashier_quiet_seconds < self.cashier_quiet:
            self._since = None
            return False
        if self._since is None:
            self._since = now
            return False
        return (now - self._since) >= self.confirm

    def held_seconds(self, now):
        return 0.0 if self._since is None else max(0.0, now - self._since)
