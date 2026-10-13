import React from 'react';
import {colors} from '../config/brand';

/**
 * Minimal smartphone in SVG. Screen is 360×760 in local units, origin at the
 * phone centre. Children are drawn in screen coordinates (0,0 = top-left of
 * the screen) and clipped to it.
 */
export const PHONE_W = 360;
export const PHONE_H = 760;

export const Phone: React.FC<{
  id: string;
  x: number;
  y: number;
  scale: number;
  rotate?: number;
  opacity?: number;
  children?: React.ReactNode;
}> = ({id, x, y, scale, rotate = 0, opacity = 1, children}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={opacity}>
    <defs>
      <clipPath id={`${id}-screen`}>
        <rect x={0} y={0} width={PHONE_W} height={PHONE_H} rx={44} />
      </clipPath>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2a2f3a" />
        <stop offset="50%" stopColor="#0f1218" />
        <stop offset="100%" stopColor="#2a2f3a" />
      </linearGradient>
      <radialGradient id={`${id}-shadow`}>
        <stop offset="0%" stopColor="#000" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx={0} cy={PHONE_H / 2 + 50} rx={260} ry={34} fill={`url(#${id}-shadow)`} />
    <rect x={-PHONE_W / 2 - 16} y={-PHONE_H / 2 - 16} width={PHONE_W + 32} height={PHONE_H + 32} rx={58} fill={`url(#${id}-body)`} />
    <rect x={-PHONE_W / 2 - 13} y={-PHONE_H / 2 - 13} width={PHONE_W + 26} height={PHONE_H + 26} rx={56} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={2} />
    <g transform={`translate(${-PHONE_W / 2} ${-PHONE_H / 2})`}>
      <g clipPath={`url(#${id}-screen)`}>
        <rect x={0} y={0} width={PHONE_W} height={PHONE_H} fill="#F4F1EC" />
        {children}
      </g>
      <rect x={PHONE_W / 2 - 52} y={14} width={104} height={30} rx={15} fill="#0b0d12" />
    </g>
    {/* glass reflection */}
    <path
      d={`M ${-PHONE_W / 2} ${-PHONE_H / 2 + 60} L ${-PHONE_W / 2 + 150} ${-PHONE_H / 2} L ${-PHONE_W / 2 + 230} ${-PHONE_H / 2} L ${-PHONE_W / 2} ${-PHONE_H / 2 + 150} Z`}
      fill="#fff"
      opacity={0.06}
    />
  </g>
);

/** Chat header used on the phone screen. */
export const ChatHeader: React.FC<{title: string; subtitle: string}> = ({title, subtitle}) => (
  <g>
    <rect x={0} y={0} width={PHONE_W} height={118} fill={colors.ink} />
    <circle cx={46} cy={82} r={22} fill={colors.paper} />
    <text x={46} y={89} textAnchor="middle" fontFamily='"Inter", sans-serif' fontWeight={700} fontSize={18} fill={colors.ink}>
      H
    </text>
    <text x={82} y={78} fontFamily='"Inter", sans-serif' fontWeight={600} fontSize={20} fill="#fff" letterSpacing={2}>
      {title}
    </text>
    <text x={82} y={100} fontFamily='"Inter", sans-serif' fontWeight={400} fontSize={14} fill="#fff" opacity={0.6}>
      {subtitle}
    </text>
  </g>
);

/** A chat bubble that pops in. `p` 0..1. */
export const Bubble: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'left' | 'right';
  p: number;
  children?: React.ReactNode;
  color?: string;
}> = ({x, y, w, h, side, p, children, color}) => {
  const ox = side === 'right' ? x + w : x;
  const s = 0.6 + 0.4 * p;
  return (
    <g opacity={Math.min(1, p * 1.5)} transform={`translate(${ox} ${y + h}) scale(${s}) translate(${-ox} ${-(y + h)}) translate(0 ${(1 - p) * 16})`}>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={color ?? (side === 'right' ? '#DCF3E4' : '#fff')} />
      {children}
    </g>
  );
};
