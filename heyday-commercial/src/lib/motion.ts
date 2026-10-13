import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Premium "expo out" style curve used for most entrances. */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

/** 0→1 progress between two times (seconds) with an easing curve. */
export const useProgress = (startSec: number, durSec: number, easing = easeOut) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return interpolate(frame, [startSec * fps, (startSec + durSec) * fps], [0, 1], {...clamp, easing});
};

export const progressAt = (frame: number, fps: number, startSec: number, durSec: number, easing = easeOut) =>
  interpolate(frame, [startSec * fps, (startSec + durSec) * fps], [0, 1], {...clamp, easing});

/** Spring that starts at a given second. */
export const springAt = (
  frame: number,
  fps: number,
  startSec: number,
  config: {damping?: number; stiffness?: number; mass?: number} = {},
) =>
  spring({
    frame: frame - startSec * fps,
    fps,
    config: {damping: 18, stiffness: 120, mass: 0.9, ...config},
  });

/** In/out envelope: fades in at `a`, holds, fades out ending at `b` (seconds). */
export const envelope = (frame: number, fps: number, a: number, b: number, fadeIn = 0.5, fadeOut = 0.5) => {
  const t = frame / fps;
  const i = interpolate(t, [a, a + fadeIn], [0, 1], {...clamp, easing: easeOut});
  const o = interpolate(t, [b - fadeOut, b], [1, 0], {...clamp, easing: easeIn});
  return Math.min(i, o);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
