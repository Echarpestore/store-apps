import React from 'react';
import {staticFile} from 'remotion';
import type {Photo} from '../config/brand';

/** Cover-fit an image of size (iw, ih) into a box, honouring a focus point, never leaving gaps. */
const cover = (photo: Photo, x: number, y: number, w: number, h: number, zoom: number) => {
  const s = Math.max(w / photo.size.w, h / photo.size.h) * zoom;
  const iw = photo.size.w * s;
  const ih = photo.size.h * s;
  const fx = photo.focus?.x ?? 0.5;
  const fy = photo.focus?.y ?? 0.5;
  const left = x - w / 2;
  const top = y - h / 2;
  const ix = Math.min(left, Math.max(left + w - iw, x - iw * fx));
  const iy = Math.min(top, Math.max(top + h - ih, y - ih * fy));
  return {ix, iy, iw, ih};
};

/**
 * Authentic photo masked inside an SVG shape (rounded card, arch or circle),
 * with a slow Ken Burns push and an optional circular reveal.
 */
export const PhotoSlot: React.FC<{
  id: string;
  photo: Photo;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  shape?: 'circle' | 'rounded' | 'arch';
  zoom?: number; // 1 → cover; >1 pushes in
  reveal?: number; // 0..1 circular reveal
  opacity?: number;
}> = ({id, photo, x, y, w, h, shape = 'rounded', zoom = 1.04, reveal = 1, opacity = 1}) => {
  const {ix, iy, iw, ih} = cover(photo, x, y, w, h, zoom);
  const r = Math.min(w, h);
  const shapeEl =
    shape === 'circle' ? (
      <circle cx={x} cy={y} r={r / 2} />
    ) : shape === 'arch' ? (
      <path d={`M ${x - w / 2} ${y + h / 2} V ${y - h / 2 + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h / 2 + w / 2} V ${y + h / 2} Z`} />
    ) : (
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={r * 0.06} />
    );
  return (
    <g opacity={opacity}>
      <defs>
        <clipPath id={`${id}-clip`}>{shapeEl}</clipPath>
        <clipPath id={`${id}-reveal`}>
          <circle cx={x} cy={y} r={Math.hypot(w, h) * 0.55 * reveal} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-reveal)`}>
        <g clipPath={`url(#${id}-clip)`}>
          <image href={staticFile(photo.file)} x={ix} y={iy} width={iw} height={ih} preserveAspectRatio="none" />
        </g>
      </g>
    </g>
  );
};

/**
 * Real globe photo placed so its glass sphere sits exactly on a target circle
 * (cx, cy, r) — the same circle the SVG globe uses — so line art and
 * illustration can hand over to the photograph seamlessly.
 *
 * mode 'feather': soft radial edge that melts into the scene background.
 * mode 'card': rounded portrait card around the globe.
 * `reveal` grows a circle from the sphere outwards.
 */
export const PhotoGlobe: React.FC<{
  id: string;
  photo: Photo;
  cx: number;
  cy: number;
  r: number;
  mode?: 'feather' | 'card';
  reveal?: number;
  opacity?: number;
  sheen?: number; // 0..1 light sweep across the glass, <0 = off
  drift?: number; // slow push-in factor (1 = none)
  featherR?: number; // feather radius in sphere radii
  featherY?: number; // feather centre offset below the sphere centre, in radii
  border?: string; // card hairline colour
}> = ({id, photo, cx, cy, r, mode = 'feather', reveal = 1, opacity = 1, sheen = -1, drift = 1, featherR = 1.75, featherY = 0.45, border = 'rgba(255,255,255,0.18)'}) => {
  const sp = photo.sphere ?? {x: photo.size.w / 2, y: photo.size.h * 0.4, r: photo.size.w * 0.4};
  const s = (r / sp.r) * drift;
  const ix = cx - sp.x * s;
  const iy = cy - sp.y * s;
  const iw = photo.size.w * s;
  const ih = photo.size.h * s;
  const revealR = r * (0.98 + reveal * 2.4);
  // keep the feather inside the photo so its rectangular edge never shows
  const fr = Math.min(
    featherR,
    sp.x / sp.r,
    (photo.size.w - sp.x) / sp.r,
    sp.y / sp.r + featherY,
    (photo.size.h - sp.y) / sp.r - featherY,
  );
  // portrait card around the globe, never larger than the photo itself
  const cl = Math.max(cx - r * 1.32, ix + 1);
  const cr = Math.min(cx + r * 1.32, ix + iw - 1);
  const ct = Math.max(cy - r * 1.3, iy + 1);
  const cb = Math.min(cy + r * 1.75, iy + ih - 1);
  const card = {x: cl, y: ct, w: cr - cl, h: cb - ct};
  return (
    <g opacity={opacity}>
      <defs>
        <radialGradient id={`${id}-fade`} cx={cx} cy={cy + r * featherY} r={r * fr} gradientUnits="userSpaceOnUse">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={ix} y={iy} width={iw} height={ih}>
          <rect x={ix} y={iy} width={iw} height={ih} fill={`url(#${id}-fade)`} />
        </mask>
        <clipPath id={`${id}-reveal`}>
          <circle cx={cx} cy={cy} r={revealR} />
        </clipPath>
        <clipPath id={`${id}-card`}>
          <rect x={card.x} y={card.y} width={card.w} height={card.h} rx={r * 0.16} />
        </clipPath>
        <clipPath id={`${id}-glass`}>
          <circle cx={cx} cy={cy} r={r * 0.98} />
        </clipPath>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {mode === 'card' && reveal > 0 && (
        <rect x={card.x + r * 0.04} y={card.y + r * 0.1} width={card.w} height={card.h} rx={r * 0.16} fill="#000" opacity={0.12 * Math.min(1, reveal * 2)} />
      )}
      <g clipPath={`url(#${id}-reveal)`}>
        <g clipPath={mode === 'card' ? `url(#${id}-card)` : undefined} mask={mode === 'feather' ? `url(#${id}-mask)` : undefined}>
          <image href={staticFile(photo.file)} x={ix} y={iy} width={iw} height={ih} preserveAspectRatio="none" />
        </g>
      </g>
      {mode === 'card' && (
        <g clipPath={`url(#${id}-reveal)`}>
          <rect x={card.x} y={card.y} width={card.w} height={card.h} rx={r * 0.16} fill="none" stroke={border} strokeWidth={Math.max(1, r * 0.008)} />
        </g>
      )}
      {sheen >= 0 && sheen <= 1 && (
        <g clipPath={`url(#${id}-glass)`}>
          <rect
            x={cx - r * 2.4 + sheen * r * 4.8 - r * 0.4}
            y={cy - r * 1.4}
            width={r * 0.8}
            height={r * 2.8}
            fill={`url(#${id}-sheen)`}
            transform={`rotate(24 ${cx - r * 2.4 + sheen * r * 4.8} ${cy})`}
          />
        </g>
      )}
    </g>
  );
};
