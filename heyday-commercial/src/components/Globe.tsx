import React from 'react';
import {random} from 'remotion';
import {colors} from '../config/brand';
import {mix, rgba, shade} from '../lib/color';

/**
 * Editable SVG snow globe illustration.
 *
 * Local geometry: sphere centred at (0,0) with radius 300; the base sits
 * between y≈230 and y≈410. Place it with x/y/scale (scale 1 → sphere r=300px).
 *
 * This is an illustration used to explain the product and the process.
 * It is never presented as a photograph of a HEYDAY project.
 */
export type GlobeProps = {
  id: string;
  x: number;
  y: number;
  scale: number;
  t: number; // seconds, drives the internal snow
  baseColor?: string;
  plaque?: string; // engraved message on the base
  inner?: React.ReactNode; // content inside the glass (local coords)
  snow?: number; // 0..1 amount of snow inside
  glitter?: string | null; // colour of glitter flakes, null = white snow
  liquid?: number; // 0..1 water level (used in the production step)
  outline?: number; // 0..1 line-art draw-on of the whole object
  solid?: number; // 0..1 fill-in after the outline
  sheen?: number; // 0..1 light sweep across the glass
  shadow?: boolean;
  opacity?: number;
  rotate?: number;
  swirl?: number; // extra snow agitation (after a shake)
};

const SPHERE = 300;

const BASE_PATH = 'M -205 232 C -205 250 -215 262 -232 268 L -268 384 C -270 400 -250 412 -220 412 L 220 412 C 250 412 270 400 268 384 L 232 268 C 215 262 205 250 205 232 Z';
const COLLAR_PATH = 'M -215 222 L 215 222 C 222 222 226 228 226 236 L 226 250 C 226 258 220 264 212 264 L -212 264 C -220 264 -226 258 -226 250 L -226 236 C -226 228 -222 222 -215 222 Z';

export const Globe: React.FC<GlobeProps> = ({
  id,
  x,
  y,
  scale,
  t,
  baseColor = colors.ink,
  plaque,
  inner,
  snow = 1,
  glitter = null,
  liquid = 1,
  outline = 1,
  solid = 1,
  sheen = -1,
  shadow = true,
  opacity = 1,
  rotate = 0,
  swirl = 0,
}) => {
  const g = (s: string) => `${id}-${s}`;
  const draw = {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - outline};
  const lineColor = colors.gold;

  // internal snow — deterministic, clipped by the glass
  const flakes = [];
  const N = 70;
  for (let i = 0; i < N; i++) {
    const r0 = random(`${id}-f${i}`);
    const r1 = random(`${id}-g${i}`);
    const r2 = random(`${id}-h${i}`);
    const speed = 18 + r1 * 30 + swirl * 120;
    const span = 560;
    const yy = ((r0 * span + t * speed) % span) - 300;
    const xx = (r2 - 0.5) * 540 + Math.sin(t * (0.6 + r1) + i) * (14 + swirl * 60);
    const size = 2.2 + r1 * 4.2;
    const show = r2 < snow;
    if (!show) continue;
    const isGlitter = glitter && i % 2 === 0;
    flakes.push(
      isGlitter ? (
        <path
          key={i}
          d={`M ${xx} ${yy - size * 1.6} L ${xx + size * 0.45} ${yy} L ${xx} ${yy + size * 1.6} L ${xx - size * 0.45} ${yy} Z`}
          fill={glitter!}
          opacity={0.55 + 0.45 * Math.abs(Math.sin(t * 3 + i))}
          transform={`rotate(${(t * 90 + i * 37) % 360} ${xx} ${yy})`}
        />
      ) : (
        <circle key={i} cx={xx} cy={yy} r={size} fill={`url(#${g('flake')})`} />
      ),
    );
  }

  const liquidTop = 280 - liquid * 580;

  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${rotate})`} opacity={opacity}>
      <defs>
        <radialGradient id={g('glass')} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="70%" stopColor={colors.ice} stopOpacity="0.16" />
          <stop offset="100%" stopColor={colors.iceDeep} stopOpacity="0.42" />
        </radialGradient>
        <radialGradient id={g('flake')}>
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor={colors.ice} stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={g('base')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={shade(baseColor, -0.45)} />
          <stop offset="22%" stopColor={shade(baseColor, 0.12)} />
          <stop offset="34%" stopColor={shade(baseColor, 0.32)} />
          <stop offset="55%" stopColor={baseColor} />
          <stop offset="100%" stopColor={shade(baseColor, -0.55)} />
        </linearGradient>
        <linearGradient id={g('collar')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a6d3b" />
          <stop offset="30%" stopColor={colors.goldLight} />
          <stop offset="55%" stopColor={colors.gold} />
          <stop offset="100%" stopColor="#6e5428" />
        </linearGradient>
        <linearGradient id={g('ground')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={mix(colors.ice, '#ffffff', 0.4)} />
        </linearGradient>
        <linearGradient id={g('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={g('shadow')}>
          <stop offset="0%" stopColor="#000" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={g('clip')}>
          <circle cx={0} cy={0} r={SPHERE - 4} />
        </clipPath>
      </defs>

      {shadow && <ellipse cx={0} cy={418} rx={330} ry={34} fill={`url(#${g('shadow')})`} opacity={solid} />}

      {/* ---- solid render ---- */}
      <g opacity={solid}>
        <circle cx={0} cy={0} r={SPHERE} fill={`url(#${g('glass')})`} />
        <g clipPath={`url(#${g('clip')})`}>
          {/* liquid */}
          <rect x={-320} y={liquidTop} width={640} height={700} fill={rgba(colors.ice, 0.12)} />
          {liquid < 1 && (
            <ellipse cx={0} cy={liquidTop} rx={290} ry={14} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={3} />
          )}
          {/* ground */}
          <ellipse cx={0} cy={205} rx={300} ry={86} fill={`url(#${g('ground')})`} />
          <ellipse cx={-80} cy={176} rx={120} ry={22} fill="#fff" opacity={0.9} />
          {inner}
          {flakes}
          {sheen >= 0 && sheen <= 1 && (
            <rect
              x={-700 + sheen * 1400 - 120}
              y={-400}
              width={240}
              height={800}
              fill={`url(#${g('sheen')})`}
              transform={`rotate(24 ${-700 + sheen * 1400} 0)`}
            />
          )}
        </g>
        {/* glass highlights */}
        <path d="M -232 -118 A 252 252 0 0 1 -60 -262 A 300 300 0 0 0 -212 -60 Z" fill="#fff" opacity={0.55} />
        <ellipse cx={-150} cy={-170} rx={22} ry={12} fill="#fff" opacity={0.9} transform="rotate(-38 -150 -170)" />
        <path d="M 250 60 A 262 262 0 0 1 140 228" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={7} strokeLinecap="round" />
        <circle cx={0} cy={0} r={SPHERE} fill="none" stroke={`url(#${g('rim')})`} strokeWidth={5} />

        {/* base */}
        <path d={BASE_PATH} fill={`url(#${g('base')})`} />
        <path d="M -232 268 L 232 268" stroke="#fff" strokeOpacity={0.18} strokeWidth={2} />
        <path d={COLLAR_PATH} fill={`url(#${g('collar')})`} />
        {plaque && (
          <g>
            <rect x={-128} y={312} width={256} height={52} rx={8} fill={`url(#${g('collar')})`} />
            <text
              x={0}
              y={345}
              textAnchor="middle"
              fontFamily='"Inter", sans-serif'
              fontWeight={600}
              fontSize={20}
              letterSpacing={5}
              fill={colors.ink}
            >
              {plaque}
            </text>
          </g>
        )}
      </g>

      {/* ---- line-art (draw-on) ---- */}
      {outline < 1 || solid < 1 ? (
        <g fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={1 - solid * 0.95}>
          <circle cx={0} cy={0} r={SPHERE} {...draw} transform="rotate(-90)" />
          <path d={BASE_PATH} {...draw} />
          <path d={COLLAR_PATH} {...draw} />
          <path d="M -260 205 C -150 150 150 150 260 205" {...draw} />
          <path d="M -232 -118 A 252 252 0 0 1 -60 -262" {...draw} />
        </g>
      ) : null}
    </g>
  );
};
