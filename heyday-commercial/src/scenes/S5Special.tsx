import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, copy, fonts, photos} from '../config/brand';
import {PaperBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {CheckIcon} from '../components/Icons';
import {InnerGift, InnerLogo, InnerProduct, InnerVenue} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoGlobe} from '../components/PhotoSlot';
import {SceneIn} from '../components/Transition';
import {Eyebrow, KineticText} from '../components/Typography';
import {mixList, rgba} from '../lib/color';
import {useLayout} from '../lib/layout';
import {clamp, easeIn, easeInOut, easeOut, lerp, springAt} from '../lib/motion';

const BASES = [colors.ink, '#1F3A5F', '#7A2638', '#2F5D50', colors.ink];
// option highlight windows (seconds, scene-local) — matches copy.s5.options order
const OPT = [
  [0.7, 1.7], // Cor da base
  [1.7, 2.5], // Elementos internos
  [3.1, 3.8], // Mensagens
  [3.8, 4.6], // Logos
  [2.5, 3.1], // Neve ou glitter
];
const PLAQUES = ['SUA MARCA', 'SUA MARCA', 'BOAS FESTAS', 'OBRIGADO 2026'];

export const S5Special: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const V = L.vertical;
  const between = (a: number, b: number, e = easeInOut) => interpolate(t, [a, b], [0, 1], {...clamp, easing: e});

  // ---- part A: live customisation ----
  const baseT = interpolate(t, [0.7, 1.0, 1.25, 1.5, 1.75, 2.0, 4.3, 4.6], [0, 1, 1, 2, 2, 3, 3, 4], clamp);
  const baseColor = mixList(BASES, baseT);
  const innerSeq: [number, React.FC<{draw?: number; fill?: number; label?: string}>][] = [
    [0, InnerLogo],
    [1.75, InnerProduct],
    [2.15, InnerGift],
    [2.5, InnerVenue],
    [3.8, InnerLogo],
  ];
  let innerIdx = 0;
  innerSeq.forEach(([s], i) => {
    if (t >= s) innerIdx = i;
  });
  const [innerStart, Inner] = innerSeq[innerIdx];
  const popS = innerIdx === 0 ? 1 : springAt(frame, fps, innerStart, {damping: 11, stiffness: 180});
  const glitter = t < 2.5 ? null : t < 2.8 ? colors.gold : t < 3.1 ? '#E3A6B4' : null;
  const plaque = t < 3.1 ? PLAQUES[0] : t < 3.45 ? PLAQUES[2] : PLAQUES[3];

  // ---- part B: outline → finished product ----
  const B = 4.6;
  const toLine = between(B, B + 0.45, easeIn);
  const redraw = between(B + 0.45, B + 1.35);
  const reveal = between(B + 1.3, B + 2.0, easeOut);
  const outline = t < B + 0.45 ? 1 : redraw;
  const solid = t < B + 0.45 ? 1 - toLine : reveal;
  const move = between(B - 0.1, B + 0.8);
  const gScale = lerp((V ? 0.95 : 0.8) * u, (V ? 0.78 : 0.8) * u, move);
  const gx = lerp(L.stage.x, V ? L.stage.x : L.W * 0.28, move);
  const gy = lerp(V ? L.H * 0.42 : L.H * 0.5, V ? L.H * 0.36 : L.H * 0.47, move);
  const beauty = photos.beauty[0];
  const photoIn = beauty ? reveal : 0;

  const chipsOut = between(B - 0.2, B + 0.3, easeIn);
  return (
    <SceneIn type="iris" originX={L.stage.x} originY={L.stage.y}>
      <AbsoluteFill>
        <PaperBackground tint={colors.goldLight} warmth={1} />
        <SnowField seed="s5bg" count={34} color={colors.ice} glitterColor={colors.gold} opacity={0.5} speed={0.4} drift={-8} />
        <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
          <defs>
            <radialGradient id="s5-glow">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={gx} cy={gy} r={520 * u} fill="url(#s5-glow)" />
          <g transform={`translate(${gx} ${gy}) scale(${0.96 + 0.04 * popS}) translate(${-gx} ${-gy})`}>
            <Globe
              id="s5-globe"
              x={gx}
              y={gy}
              scale={gScale}
              t={t}
              baseColor={baseColor}
              plaque={plaque}
              glitter={glitter}
              swirl={interpolate(t, [2.5, 2.7, 3.4], [0, 0.6, 0], clamp)}
              inner={<Inner fill={1} draw={1} label="SUA MARCA" />}
              outline={outline}
              solid={beauty ? (t < B + 0.45 ? 1 - toLine : 0) : solid}
              opacity={1 - photoIn}
              sheen={interpolate(t, [B + 1.8, B + 3.0], [0, 1], clamp)}
            />
            {beauty && photoIn > 0 && (
              <PhotoGlobe id="s5-photo" photo={beauty} cx={gx} cy={gy} r={300 * gScale} mode="card" reveal={photoIn} sheen={interpolate(t, [B + 2.0, B + 3.2], [0, 1], clamp)} drift={1 + Math.max(0, t - B - 1.3) * 0.012} />
            )}
          </g>
        </svg>

        {/* headline */}
        <div style={{position: 'absolute', left: V ? 80 * u : L.W * 0.55, top: V ? L.H * 0.06 : L.H * 0.12, width: V ? L.W - 160 * u : L.W * 0.4}}>
          <Eyebrow text="Personalização" start={0.45} size={24 * u} align={V ? 'center' : 'left'} />
          <div style={{height: 22 * u}} />
          <KineticText text={copy.s5.headline} start={0.6} size={(V ? 64 : 60) * u} weight={300} align={V ? 'center' : 'left'} width={V ? L.W - 160 * u : L.W * 0.4} highlight={['detalhe']} />
        </div>

        {/* part A: option chips */}
        <div
          style={{
            position: 'absolute',
            left: V ? 70 * u : L.W * 0.55,
            width: V ? L.W - 140 * u : L.W * 0.4,
            top: V ? L.H * 0.72 : L.H * 0.48,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16 * u,
            justifyContent: V ? 'center' : 'flex-start',
            opacity: 1 - chipsOut,
          }}
        >
          {copy.s5.options.map((o, i) => {
            const s = springAt(frame, fps, 0.8 + i * 0.1);
            const [a, b] = OPT[i];
            const on = interpolate(t, [a, a + 0.15, b - 0.1, b], [0, 1, 1, 0], clamp);
            return (
              <div
                key={o}
                style={{
                  padding: `${16 * u}px ${28 * u}px`,
                  borderRadius: 999,
                  fontFamily: fonts.sans,
                  fontWeight: 500,
                  fontSize: 30 * u,
                  color: on > 0.5 ? '#fff' : colors.ink,
                  background: on > 0.5 ? colors.ink : 'rgba(255,255,255,0.85)',
                  border: `${2 * u}px solid ${on > 0.5 ? colors.ink : rgba(colors.ink, 0.1)}`,
                  boxShadow: on > 0.5 ? `0 ${12 * u}px ${30 * u}px ${rgba(colors.ink, 0.25)}` : 'none',
                  opacity: s,
                  transform: `translateY(${(1 - s) * 30 * u - on * 6 * u}px) scale(${1 + on * 0.06})`,
                }}
              >
                {o}
              </div>
            );
          })}
        </div>

        {/* part B: feature list */}
        <div
          style={{
            position: 'absolute',
            left: V ? 150 * u : L.W * 0.55,
            top: V ? L.H * 0.66 : L.H * 0.42,
            display: 'flex',
            flexDirection: 'column',
            gap: (V ? 26 : 22) * u,
          }}
        >
          {copy.s5.features.map((f, i) => {
            const s0 = B + 0.3 + i * 0.32;
            const p = interpolate(t, [s0, s0 + 0.6], [0, 1], {...clamp, easing: easeOut});
            return (
              <div key={f} style={{display: 'flex', alignItems: 'center', gap: 22 * u, opacity: p, transform: `translateX(${(1 - p) * 50 * u}px)`}}>
                <svg width={48 * u} height={48 * u}>
                  <CheckIcon x={24 * u} y={24 * u} size={46 * u} draw={p} fill={p} />
                </svg>
                <span style={{fontFamily: fonts.sans, fontSize: (V ? 40 : 36) * u, color: colors.ink, fontWeight: 400, letterSpacing: '-0.01em'}}>{f}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneIn>
  );
};
