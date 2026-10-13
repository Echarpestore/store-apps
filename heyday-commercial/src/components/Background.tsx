import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from '../config/brand';
import {rgba} from '../lib/color';

/** Clean white studio surface with slowly drifting light pools. */
export const PaperBackground: React.FC<{tint?: string; warmth?: number}> = ({tint = colors.ice, warmth = 0.5}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = frame / fps;
  const ax = 30 + Math.sin(t * 0.25) * 8;
  const ay = 22 + Math.cos(t * 0.2) * 6;
  const bx = 72 + Math.cos(t * 0.22) * 8;
  const by = 78 + Math.sin(t * 0.18) * 6;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 45% at ${ax}% ${ay}%, ${rgba(tint, 0.22)}, transparent 70%),
          radial-gradient(ellipse 55% 40% at ${bx}% ${by}%, ${rgba(colors.gold, 0.12 * warmth * 2)}, transparent 70%),
          linear-gradient(180deg, ${colors.paper} 0%, ${colors.paperDeep} 100%)`,
      }}
    >
      {/* fine studio floor line */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.07" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#vignette)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Deep night stage for the opening and the closing. */
export const NightBackground: React.FC<{glowX?: number; glowY?: number; glow?: number}> = ({glowX = 50, glowY = 40, glow = 1}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 70% 45% at ${glowX}% ${glowY}%, ${rgba(colors.nightSoft, 0.95 * glow)}, transparent 75%),
        radial-gradient(ellipse 40% 25% at ${glowX}% ${glowY + 18}%, ${rgba(colors.gold, 0.08 * glow)}, transparent 70%),
        linear-gradient(180deg, ${colors.night} 0%, #05070C 100%)`,
    }}
  />
);
