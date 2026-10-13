import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, officialLogo} from '../config/brand';
import {clamp, easeOut} from '../lib/motion';

/**
 * HEYDAY wordmark.
 *
 * If `officialLogo` is set in config/brand.ts the official file is used.
 * Otherwise a monoline vector wordmark is drawn letter by letter. The
 * vector version is a typeset stand-in, NOT the official HEYDAY logo
 * (which could not be downloaded — see docs/RESEARCH.md).
 */
const LETTERS: {w: number; d: string}[] = [
  {w: 60, d: 'M0 0 V100 M60 0 V100 M0 50 H60'}, // H
  {w: 50, d: 'M50 0 H0 V100 H50 M0 50 H42'}, // E
  {w: 64, d: 'M0 0 L32 52 L64 0 M32 52 V100'}, // Y
  {w: 70, d: 'M0 0 H20 A50 50 0 0 1 20 100 H0 Z'}, // D
  {w: 66, d: 'M0 100 L33 0 L66 100 M13 64 H53'}, // A
  {w: 64, d: 'M0 0 L32 52 L64 0 M32 52 V100'}, // Y
];
const TRACK = 34;
export const WORDMARK_W = LETTERS.reduce((s, l) => s + l.w, 0) + TRACK * (LETTERS.length - 1);

export const Wordmark: React.FC<{
  x: number; // centre
  y: number; // centre
  height: number; // cap height in px
  start: number; // seconds
  color?: string;
  stroke?: number;
  opacity?: number;
  shimmer?: number; // 0..1 light sweep across the letters
}> = ({x, y, height, start, color = colors.ink, stroke = 7, opacity = 1, shimmer = -1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const s = height / 100;
  const width = WORDMARK_W * s;

  if (officialLogo) {
    const p = interpolate(t, [start, start + 0.9], [0, 1], {...clamp, easing: easeOut});
    return (
      <Img
        src={staticFile(officialLogo)}
        style={{position: 'absolute', left: x - width / 2, top: y - height, height: height * 2, width, objectFit: 'contain', opacity: p * opacity, filter: `blur(${(1 - p) * 8}px)`}}
      />
    );
  }

  let cursor = 0;
  const id = `wm-${Math.round(x)}-${Math.round(y)}`;
  return (
    <svg
      style={{position: 'absolute', left: x - width / 2 - 20, top: y - height / 2 - 20, overflow: 'visible', opacity}}
      width={width + 40}
      height={height + 40}
    >
      <g transform={`translate(20 20) scale(${s})`}>
        {LETTERS.map((L, i) => {
          const ls = start + i * 0.09;
          const p = interpolate(t, [ls, ls + 0.9], [0, 1], {...clamp, easing: easeOut});
          const fill = interpolate(t, [ls + 0.35, ls + 1.0], [0, 1], clamp);
          const g = (
            <g key={i} transform={`translate(${cursor} ${(1 - p) * 26})`} opacity={Math.min(1, p * 2)}>
              {shimmer >= 0 && (
                <defs>
                  <linearGradient id={`${id}-sh${i}`} gradientUnits="userSpaceOnUse" x1={-cursor} y1={0} x2={WORDMARK_W - cursor} y2={0}>
                    <stop offset={Math.max(0, shimmer - 0.12)} stopColor={color} />
                    <stop offset={Math.max(0, Math.min(1, shimmer))} stopColor={colors.goldLight} />
                    <stop offset={Math.min(1, shimmer + 0.12)} stopColor={color} />
                  </linearGradient>
                </defs>
              )}
              <path
                d={L.d}
                fill="none"
                stroke={shimmer >= 0 ? `url(#${id}-sh${i})` : color}
                strokeWidth={stroke + fill * 3}
                strokeLinecap="square"
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
            </g>
          );
          cursor += L.w + TRACK;
          return g;
        })}
      </g>
    </svg>
  );
};
