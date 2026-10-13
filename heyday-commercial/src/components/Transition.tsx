import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {OVERLAP} from '../config/timeline';
import {clamp, easeInOut} from '../lib/motion';

/**
 * Scene entrance. Each scene starts OVERLAP seconds before the previous one
 * ends and reveals itself over the outgoing scene, so cuts are seamless.
 */
export const SceneIn: React.FC<{
  type: 'iris' | 'wipeUp' | 'slide' | 'none';
  originX?: number; // px, for iris
  originY?: number;
  children: React.ReactNode;
}> = ({type, originX, originY, children}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const p = interpolate(frame, [0, OVERLAP * fps], [0, 1], {...clamp, easing: easeInOut});
  let clipPath: string | undefined;
  let transform: string | undefined;
  if (p < 1) {
    if (type === 'iris') {
      const ox = originX ?? W / 2;
      const oy = originY ?? H / 2;
      const maxR = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy));
      clipPath = `circle(${p * maxR}px at ${ox}px ${oy}px)`;
    } else if (type === 'wipeUp') {
      clipPath = `inset(${(1 - p) * 100}% 0 0 0)`;
      transform = `translateY(${(1 - p) * 6}%)`;
    } else if (type === 'slide') {
      clipPath = `inset(0 0 0 ${(1 - p) * 100}%)`;
      transform = `translateX(${(1 - p) * 8}%)`;
    }
  }
  return <AbsoluteFill style={{clipPath, transform}}>{children}</AbsoluteFill>;
};
