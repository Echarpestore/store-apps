import React from 'react';
import {staticFile} from 'remotion';
import type {Photo} from '../config/brand';

/**
 * Authentic photo masked inside an SVG shape, with a slow Ken Burns push.
 * Render this only when a real HEYDAY photo is configured; callers fall
 * back to the SVG illustration otherwise.
 */
export const PhotoSlot: React.FC<{
  id: string;
  photo: Photo;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  shape?: 'circle' | 'rounded' | 'arch';
  zoom?: number; // 1 → fit; >1 pushes in
  reveal?: number; // 0..1 circular reveal
  opacity?: number;
}> = ({id, photo, x, y, w, h, shape = 'rounded', zoom = 1.05, reveal = 1, opacity = 1}) => {
  const fx = photo.focus?.x ?? 0.5;
  const fy = photo.focus?.y ?? 0.5;
  const iw = w * zoom;
  const ih = h * zoom;
  const r = Math.min(w, h);
  const shapeEl =
    shape === 'circle' ? (
      <circle cx={x} cy={y} r={(r / 2) * reveal} />
    ) : shape === 'arch' ? (
      <path d={`M ${x - w / 2} ${y + h / 2} V ${y - h / 2 + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h / 2 + w / 2} V ${y + h / 2} Z`} />
    ) : (
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={r * 0.06} />
    );
  return (
    <g opacity={opacity}>
      <defs>
        <clipPath id={`${id}-clip`}>{shapeEl}</clipPath>
        {shape !== 'circle' && (
          <clipPath id={`${id}-reveal`}>
            <circle cx={x} cy={y} r={Math.hypot(w, h) * 0.55 * reveal} />
          </clipPath>
        )}
      </defs>
      <g clipPath={shape !== 'circle' ? `url(#${id}-reveal)` : undefined}>
        <image
          href={staticFile(photo.file)}
          x={x - iw * fx}
          y={y - ih * fy}
          width={iw}
          height={ih}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${id}-clip)`}
        />
      </g>
    </g>
  );
};
