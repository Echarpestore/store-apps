import React from 'react';
import {random, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Full-frame snow + glitter field with three depth layers (parallax).
 * Deterministic: the same frame always renders the same particles.
 */
export const SnowField: React.FC<{
  seed: string;
  count?: number;
  color?: string;
  glitterColor?: string;
  glitterRatio?: number;
  opacity?: number;
  speed?: number;
  drift?: number; // horizontal camera drift in px/sec (parallax)
  timeOffset?: number;
}> = ({seed, count = 140, color = '#ffffff', glitterColor = '#E9D3A6', glitterRatio = 0.18, opacity = 1, speed = 1, drift = 0, timeOffset = 0}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = frame / fps + timeOffset;
  const u = Math.min(W, H) / 1080;

  const items = [];
  for (let i = 0; i < count; i++) {
    const a = random(`${seed}-a${i}`);
    const b = random(`${seed}-b${i}`);
    const c = random(`${seed}-c${i}`);
    const depth = c < 0.55 ? 0 : c < 0.88 ? 1 : 2; // far, mid, near
    const z = [0.45, 0.8, 1.5][depth];
    const vy = (22 + b * 26) * z * speed * u;
    const spanY = H + 200 * u;
    const y = ((a * spanY + t * vy) % spanY) - 100 * u;
    const spanX = W + 200 * u;
    const x = ((((b * spanX + Math.sin(t * (0.3 + a * 0.5) + i) * 30 * u * z - t * drift * z) % spanX) + spanX) % spanX) - 100 * u;
    const r = (1.2 + a * 2.4) * z * u * (depth === 2 ? 1.8 : 1);
    const isGlitter = random(`${seed}-g${i}`) < glitterRatio;
    const tw = 0.5 + 0.5 * Math.sin(t * (2 + b * 3) + i * 1.7);
    const op = [0.35, 0.65, 0.5][depth];
    if (isGlitter) {
      const s = r * 2.4 * (0.6 + tw * 0.6);
      items.push(
        <path
          key={i}
          d={`M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`}
          fill={glitterColor}
          opacity={op * (0.4 + tw * 0.6)}
        />,
      );
    } else {
      items.push(<circle key={i} cx={x} cy={y} r={r} fill={`url(#${seed}-soft)`} opacity={op} />);
    }
  }

  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity}}>
      <defs>
        <radialGradient id={`${seed}-soft`}>
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="55%" stopColor={color} stopOpacity="0.7" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {items}
    </svg>
  );
};
