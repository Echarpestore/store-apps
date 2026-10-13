import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, copy, fonts, photos} from '../config/brand';
import {PaperBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {InnerGift, InnerLogo, InnerProduct, InnerVenue} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoSlot} from '../components/PhotoSlot';
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

  // ---- part B: real HEYDAY work, one piece per strength ----
  const B = 4.4; // showcase starts
  const SLOT = 1.35; // seconds per photo
  const XF = 0.4; // crossfade
  const gallery = photos.beauty.slice(0, copy.s5.features.length);
  const aOut = gallery.length ? between(B - 0.25, B + 0.2, easeIn) : 0;
  const gScale = (V ? 0.95 : 0.8) * u;
  const gx = L.stage.x;
  const gy = V ? L.H * 0.42 : L.H * 0.5;
  const chipsOut = aOut;
  const card = V ? {x: L.W / 2, y: L.H * 0.465, w: 720 * u, h: 900 * u} : {x: L.W * 0.3, y: L.H * 0.53, w: 620 * u, h: 860 * u};
  const capX = V ? 0 : L.W * 0.55;
  const capW = V ? L.W : L.W * 0.38;
  const capY = V ? L.H * 0.745 : L.H * 0.46;
  const startOf = (k: number) => B + k * SLOT;

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
          <circle cx={gx} cy={gy} r={520 * u} fill="url(#s5-glow)" opacity={1 - aOut * 0.6} />
          <g transform={`translate(${gx} ${gy}) scale(${(0.96 + 0.04 * popS) * (1 - aOut * 0.08)}) translate(${-gx} ${-gy})`} opacity={1 - aOut}>
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
              sheen={-1}
            />
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

        {/* part B: showcase of real HEYDAY pieces */}
        {gallery.length > 0 && t > B - 0.05 && (
          <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
            <defs>
              <linearGradient id="s5-shadow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
              </linearGradient>
            </defs>
            {gallery.map((ph, k) => {
              const s0 = startOf(k);
              const next = k < gallery.length - 1 ? startOf(k + 1) : Infinity;
              if (t < s0 - 0.02 || t > next + XF + 0.05) return null;
              const pin = interpolate(t, [s0, s0 + XF], [0, 1], {...clamp, easing: easeOut});
              const sc = 1.035 - 0.035 * pin;
              const dy = (1 - pin) * 24 * u;
              return (
                <g key={ph.file} opacity={pin} transform={`translate(${card.x} ${card.y + dy}) scale(${sc}) translate(${-card.x} ${-card.y})`}>
                  <rect x={card.x - card.w / 2 + 14 * u} y={card.y - card.h / 2 + 40 * u} width={card.w - 28 * u} height={card.h} rx={40 * u} fill="url(#s5-shadow)" />
                  <PhotoSlot id={`s5-g${k}`} photo={ph} x={card.x} y={card.y} w={card.w} h={card.h} shape="rounded" zoom={1.02 + Math.max(0, t - s0) * 0.03} />
                  <rect x={card.x - card.w / 2} y={card.y - card.h / 2} width={card.w} height={card.h} rx={Math.min(card.w, card.h) * 0.06} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2 * u} />
                </g>
              );
            })}
          </svg>
        )}
        {gallery.map((ph, k) => {
          const s0 = startOf(k);
          const exit = k < gallery.length - 1 ? startOf(k + 1) - 0.3 : undefined;
          const lp = interpolate(t, [s0 + 0.25, s0 + 0.6], [0, 1], clamp) * (exit === undefined ? 1 : interpolate(t, [exit, exit + 0.25], [1, 0], clamp));
          return (
            <div key={ph.file} style={{position: 'absolute', left: capX, width: capW, top: capY, display: 'flex', flexDirection: 'column', alignItems: V ? 'center' : 'flex-start', gap: 14 * u}}>
              <KineticText text={copy.s5.features[k]} start={s0 + 0.1} exit={exit} size={(V ? 56 : 52) * u} weight={300} align={V ? 'center' : 'left'} width={capW - (V ? 120 * u : 0)} stagger={0.05} />
              <div style={{fontFamily: fonts.sans, fontWeight: 600, fontSize: 22 * u, letterSpacing: '0.3em', textTransform: 'uppercase', color: colors.gold, opacity: lp}}>
                {ph.label}
              </div>
            </div>
          );
        })}
        {gallery.length > 0 && (
          <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
            {gallery.map((_, k) => {
              const on = t >= startOf(k) ? 1 : 0;
              const fillP = interpolate(t, [startOf(k), startOf(k) + SLOT], [0, 1], clamp);
              const bw = 54 * u;
              const gap = 12 * u;
              const total = gallery.length * bw + (gallery.length - 1) * gap;
              const x0 = (V ? L.W / 2 - total / 2 : capX) + k * (bw + gap);
              const y0 = V ? L.H * 0.87 : L.H * 0.72;
              return (
                <g key={k} opacity={between(B, B + 0.4)}>
                  <rect x={x0} y={y0} width={bw} height={4 * u} rx={2 * u} fill={rgba(colors.ink, 0.12)} />
                  <rect x={x0} y={y0} width={bw * fillP * on} height={4 * u} rx={2 * u} fill={colors.gold} />
                </g>
              );
            })}
          </svg>
        )}
      </AbsoluteFill>
    </SceneIn>
  );
};
