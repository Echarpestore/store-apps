import {FPS} from './brand';

/** Scene timeline in seconds. Edit here; every scene derives its frames from it. */
export const TIMELINE = {
  s1: {from: 0, dur: 5},
  s2: {from: 5, dur: 7},
  s3: {from: 12, dur: 7},
  s4: {from: 19, dur: 16},
  s5: {from: 35, dur: 8},
  s6: {from: 43, dur: 11.5},
} as const;

/** Overlap used by cross-scene transitions (seconds). */
export const OVERLAP = 0.6;

export const TOTAL_SECONDS = TIMELINE.s6.from + TIMELINE.s6.dur;
export const TOTAL_FRAMES = Math.round(TOTAL_SECONDS * FPS);

export const sec = (s: number) => Math.round(s * FPS);

/** Step boundaries inside Scene 4 (seconds, relative to scene start). */
export const S4_STEPS = [0, 3.2, 6.4, 9.6, 12.8, 16];
