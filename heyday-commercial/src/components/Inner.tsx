import React from 'react';
import {colors} from '../config/brand';
import {shade} from '../lib/color';

/**
 * Interior scenes for the SVG globe (sphere-local coordinates, ground ≈ y 175).
 * Each one illustrates a kind of customisation: logo, product, event venue,
 * gift, character. `draw` animates the line art, `fill` the colour.
 */
type P = {draw?: number; fill?: number; accent?: string; label?: string; pines?: boolean};

const line = (draw: number) => ({
  pathLength: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1 - draw,
  fill: 'none',
  stroke: colors.gold,
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

const Pines: React.FC<{fill: number}> = ({fill}) => (
  <g opacity={fill}>
    {[
      [-205, 150, 0.8],
      [-165, 168, 0.6],
      [190, 158, 0.75],
      [225, 172, 0.5],
    ].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M 0 -120 L 42 -30 L 22 -30 L 55 30 L -55 30 L -22 -30 L -42 -30 Z" fill={shade('#2f5d50', -0.1 * i)} />
        <path d="M 0 -120 L 42 -30 L 22 -30 L 55 30 L 0 30 Z" fill="#000" opacity={0.15} />
        <path d="M -14 -60 L 14 -60 M -26 0 L 26 0" stroke="#fff" strokeWidth={6} opacity={0.8} strokeLinecap="round" />
      </g>
    ))}
  </g>
);

/** Corporate logo on a monolith — "your logo, in 3D". */
export const InnerLogo: React.FC<P> = ({draw = 1, fill = 1, accent = colors.iceDeep, label = 'SUA MARCA'}) => (
  <g>
    <Pines fill={fill} />
    <g opacity={fill}>
      <path d="M -110 182 L -96 -40 L 96 -40 L 110 182 Z" fill={shade(colors.ink, 0.08)} />
      <path d="M 96 -40 L 110 182 L 40 182 L 50 -40 Z" fill="#000" opacity={0.25} />
      <circle cx={0} cy={30} r={52} fill="none" stroke={accent} strokeWidth={14} />
      <path d="M -26 30 A 26 26 0 0 1 26 30" fill="none" stroke={colors.goldLight} strokeWidth={14} strokeLinecap="round" />
      <text x={0} y={136} textAnchor="middle" fontFamily='"Inter", sans-serif' fontWeight={600} fontSize={22} letterSpacing={4} fill="#fff">
        {label}
      </text>
    </g>
    <g>
      <path d="M -110 182 L -96 -40 L 96 -40 L 110 182 Z" {...line(draw)} />
      <circle cx={0} cy={30} r={52} {...line(draw)} />
    </g>
  </g>
);

/** Product replica — a bottle, for launches and promotional campaigns. */
export const InnerProduct: React.FC<P> = ({draw = 1, fill = 1, accent = '#B4485C'}) => (
  <g>
    <Pines fill={fill} />
    <g opacity={fill}>
      <rect x={-26} y={-150} width={52} height={46} rx={8} fill={colors.gold} />
      <path d="M -70 -96 Q -70 -110 -56 -110 L 56 -110 Q 70 -110 70 -96 L 82 160 Q 82 182 60 182 L -60 182 Q -82 182 -82 160 Z" fill={accent} />
      <path d="M 30 -110 L 56 -110 Q 70 -110 70 -96 L 82 160 Q 82 182 60 182 L 40 182 Z" fill="#000" opacity={0.2} />
      <path d="M -52 -90 L -46 150" stroke="#fff" strokeOpacity={0.45} strokeWidth={10} strokeLinecap="round" />
      <rect x={-56} y={10} width={112} height={78} rx={6} fill={colors.paper} />
      <path d="M -34 40 L 34 40 M -24 60 L 24 60" stroke={accent} strokeWidth={6} strokeLinecap="round" />
    </g>
    <g>
      <path d="M -70 -96 Q -70 -110 -56 -110 L 56 -110 Q 70 -110 70 -96 L 82 160 Q 82 182 60 182 L -60 182 Q -82 182 -82 160 Z" {...line(draw)} />
      <rect x={-26} y={-150} width={52} height={46} rx={8} {...line(draw)} />
    </g>
  </g>
);

/** Event pavilion with flags — for corporate events and celebrations. */
export const InnerVenue: React.FC<P> = ({draw = 1, fill = 1, accent = colors.gold}) => (
  <g>
    <Pines fill={fill} />
    <g opacity={fill}>
      <path d="M -150 -30 L 0 -120 L 150 -30 Z" fill={accent} />
      <path d="M 0 -120 L 150 -30 L 0 -30 Z" fill="#000" opacity={0.15} />
      <rect x={-140} y={-30} width={280} height={22} fill={colors.paper} />
      {[-110, -55, 0, 55, 110].map((cx) => (
        <rect key={cx} x={cx - 12} y={-8} width={24} height={170} fill={colors.paper} />
      ))}
      <rect x={-150} y={162} width={300} height={20} fill={shade(colors.paper, -0.12)} />
      <path d="M 0 -120 L 0 -170" stroke={colors.ink} strokeWidth={4} />
      <path d="M 0 -170 L 36 -158 L 0 -146 Z" fill={colors.iceDeep} />
      {[-82, -28, 28, 82].map((cx, i) => (
        <circle key={cx} cx={cx} cy={40} r={6} fill={colors.goldLight} opacity={0.6 + 0.4 * (i % 2)} />
      ))}
    </g>
    <g>
      <path d="M -150 -30 L 0 -120 L 150 -30 Z" {...line(draw)} />
      <path d="M -150 182 L 150 182 M -110 -8 L -110 162 M 110 -8 L 110 162 M 0 -8 L 0 162" {...line(draw)} />
    </g>
  </g>
);

/** Gift box — exclusive presents. */
export const InnerGift: React.FC<P> = ({draw = 1, fill = 1, accent = '#1F3A5F', pines = true}) => (
  <g>
    {pines && <Pines fill={fill} />}
    <g opacity={fill}>
      <rect x={-105} y={10} width={210} height={172} rx={6} fill={accent} />
      <rect x={-120} y={-32} width={240} height={50} rx={6} fill={shade(accent, 0.12)} />
      <rect x={20} y={10} width={85} height={172} fill="#000" opacity={0.18} />
      <rect x={-16} y={-32} width={32} height={214} fill={colors.gold} />
      <path d="M 0 -32 C -40 -100 -110 -80 -70 -40 C -50 -24 -20 -30 0 -32 C 20 -30 50 -24 70 -40 C 110 -80 40 -100 0 -32 Z" fill={colors.goldLight} />
    </g>
    <g>
      <rect x={-105} y={10} width={210} height={172} rx={6} {...line(draw)} />
      <rect x={-120} y={-32} width={240} height={50} rx={6} {...line(draw)} />
    </g>
  </g>
);

/** Geometric character — brand mascots and characters. */
export const InnerMascot: React.FC<P> = ({draw = 1, fill = 1, accent = colors.ink}) => (
  <g>
    <Pines fill={fill} />
    <g opacity={fill}>
      <ellipse cx={0} cy={70} rx={92} ry={112} fill={accent} />
      <ellipse cx={0} cy={92} rx={60} ry={84} fill={colors.paper} />
      <circle cx={0} cy={-60} r={66} fill={accent} />
      <circle cx={-22} cy={-66} r={9} fill="#fff" />
      <circle cx={22} cy={-66} r={9} fill="#fff" />
      <path d="M -14 -40 L 14 -40 L 0 -22 Z" fill={colors.gold} />
      <path d="M -70 -10 C -96 0 -100 34 -84 60" stroke={colors.iceDeep} strokeWidth={22} strokeLinecap="round" fill="none" />
      <rect x={-70} y={-16} width={140} height={22} rx={11} fill={colors.iceDeep} />
      <ellipse cx={-36} cy={180} rx={30} ry={10} fill={colors.gold} />
      <ellipse cx={36} cy={180} rx={30} ry={10} fill={colors.gold} />
    </g>
    <g>
      <ellipse cx={0} cy={70} rx={92} ry={112} {...line(draw)} />
      <circle cx={0} cy={-60} r={66} {...line(draw)} />
    </g>
  </g>
);

export const INNERS = {logo: InnerLogo, product: InnerProduct, venue: InnerVenue, gift: InnerGift, mascot: InnerMascot};
export type InnerKind = keyof typeof INNERS;
