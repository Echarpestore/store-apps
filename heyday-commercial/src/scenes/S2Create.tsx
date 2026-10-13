import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, copy, fonts, photos} from '../config/brand';
import {PaperBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {InnerLogo, InnerMascot, InnerProduct, InnerVenue} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoSlot} from '../components/PhotoSlot';
import {SceneIn} from '../components/Transition';
import {Eyebrow, KineticText} from '../components/Typography';
import {mix, rgba} from '../lib/color';
import {useLayout} from '../lib/layout';
import {clamp, easeInOut, easeOut} from '../lib/motion';

/** One card per use case. `what` explains what gets turned into a globe. */
const CARDS = [
  {use: copy.s2.uses[0], what: 'Seu logotipo', Inner: InnerLogo, base: colors.ink, tint: colors.ice, plaque: 'SUA MARCA'},
  {use: copy.s2.uses[1], what: 'Seu produto', Inner: InnerProduct, base: '#7A2638', tint: '#E8C9C9', plaque: 'LANÇAMENTO'},
  {use: copy.s2.uses[2], what: 'Seu evento', Inner: InnerVenue, base: '#1F3A5F', tint: colors.goldLight, plaque: 'EVENTO 2026'},
  {use: copy.s2.uses[3], what: 'Seu personagem', Inner: InnerMascot, base: '#2F5D50', tint: '#CFE0D6', plaque: 'OBRIGADO'},
];

const FIRST = 1.15; // first card fully in
const HOLD = 1.5; // seconds per card
const MOVE = 0.55; // card change duration

export const S2Create: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;

  // continuous carousel index
  let idx = 0;
  for (let k = 1; k < CARDS.length; k++) {
    const s = FIRST + k * HOLD - MOVE;
    idx += interpolate(t, [s, s + MOVE], [0, 1], {...clamp, easing: easeInOut});
  }
  const activeAt = (k: number) => (k === 0 ? 0.6 : FIRST + k * HOLD - MOVE * 0.4);

  const enter = interpolate(t, [0.4, 1.3], [0, 1], {...clamp, easing: easeOut});
  const cardW = (L.vertical ? 600 : 520) * u;
  const cardH = (L.vertical ? 820 : 760) * u;
  const cy = L.vertical ? L.H * 0.5 : L.H * 0.5;
  const ccx = L.vertical ? L.W / 2 : L.W * 0.32;
  const spacing = L.vertical ? L.W * 0.66 : cardW * 1.3;

  const cards = CARDS.map((c, i) => {
    const d = i - idx;
    const ad = Math.min(1.6, Math.abs(d));
    const x = ccx + d * spacing;
    const y = cy + (1 - enter) * 300 * u + ad * 30 * u;
    const s = (1 - 0.2 * Math.min(1, ad)) * (0.92 + 0.08 * enter);
    const op = (1 - 0.55 * Math.min(1, ad)) * enter;
    const local = t - activeAt(i);
    const draw = interpolate(local, [0, 0.7], [0, 1], {...clamp, easing: easeOut});
    const fill = interpolate(local, [0.45, 0.95], [0, 1], clamp);
    const photo = photos.montage[i];
    const w = cardW;
    const h = cardH;
    const arch = `M ${-w / 2} ${h / 2} V ${-h / 2 + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${w / 2} ${-h / 2 + w / 2} V ${h / 2} Z`;
    return (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`} opacity={op}>
        <defs>
          <linearGradient id={`s2-card${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mix(c.tint, '#ffffff', 0.35)} />
            <stop offset="100%" stopColor={mix(c.tint, colors.paperDeep, 0.5)} />
          </linearGradient>
          <clipPath id={`s2-clip${i}`}>
            <path d={arch} />
          </clipPath>
        </defs>
        <path d={arch} fill={`url(#s2-card${i})`} />
        <g clipPath={`url(#s2-clip${i})`}>
          {/* concentric light rings behind the globe */}
          {[1, 2, 3].map((r) => (
            <circle key={r} cx={0} cy={-40 * u} r={(120 + r * 90) * u} fill="none" stroke="#fff" strokeOpacity={0.35 / r} strokeWidth={2 * u} />
          ))}
          {photo ? (
            <PhotoSlot id={`s2-photo${i}`} photo={photo} x={0} y={0} w={w} h={h} shape="arch" zoom={1.04 + Math.max(0, local) * 0.03} reveal={draw} />
          ) : (
            <Globe
              id={`s2-g${i}`}
              x={0}
              y={-70 * u}
              scale={(L.vertical ? 0.78 : 0.7) * u}
              t={t + i * 3}
              baseColor={c.base}
              plaque={c.plaque}
              inner={<c.Inner draw={draw} fill={fill} />}
              snow={fill}
              sheen={interpolate(local, [0.6, 1.6], [0, 1], clamp)}
            />
          )}
        </g>
        <path d={arch} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={2 * u} />
        {/* index */}
        <text x={-w / 2 + 34 * u} y={h / 2 - 36 * u} fontFamily={fonts.sans} fontWeight={600} fontSize={22 * u} letterSpacing={4 * u} fill={rgba(colors.ink, 0.55)}>
          {`0${i + 1} / 04`}
        </text>
        <text x={w / 2 - 34 * u} y={h / 2 - 36 * u} textAnchor="end" fontFamily={fonts.display} fontStyle="italic" fontSize={30 * u} fill={colors.ink}>
          {photo?.label ?? c.what}
        </text>
      </g>
    );
  });

  // label under the carousel (one per card)
  const labelY = L.vertical ? cy + cardH / 2 + 60 * u : L.H * 0.66;
  return (
    <SceneIn type="iris" originX={L.stage.x} originY={L.stage.y}>
      <AbsoluteFill>
        <PaperBackground />
        <SnowField seed="s2bg" count={40} color={colors.ice} glitterColor={colors.gold} opacity={0.6} speed={0.4} drift={12} />
        <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
          <defs>
            <linearGradient id="s2-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="12%" stopColor="#fff" stopOpacity="1" />
              <stop offset="88%" stopColor="#fff" stopOpacity="1" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="s2-mask">
              <rect x={L.vertical ? 0 : 0} y={0} width={L.vertical ? L.W : L.W * 0.56} height={L.H} fill={L.vertical ? '#fff' : 'url(#s2-fade)'} />
            </mask>
          </defs>
          <g mask="url(#s2-mask)">{cards}</g>
        </svg>
        <div style={{position: 'absolute', left: L.vertical ? 80 * u : L.W * 0.6, top: L.vertical ? L.H * 0.06 : L.H * 0.2, width: L.vertical ? L.W - 160 * u : L.W * 0.34}}>
          <Eyebrow text="O que criamos" start={0.4} size={24 * u} align={L.vertical ? 'center' : 'left'} />
          <div style={{height: 26 * u}} />
          <KineticText
            text={copy.s2.headline}
            start={0.55}
            size={(L.vertical ? 68 : 66) * u}
            align={L.vertical ? 'center' : 'left'}
            width={L.vertical ? L.W - 160 * u : L.W * 0.34}
            highlight={['inesquecíveis']}
            weight={300}
          />
        </div>
        {CARDS.map((c, i) => {
          const s = activeAt(i) + 0.1;
          const e = i < CARDS.length - 1 ? activeAt(i + 1) - 0.5 : undefined;
          return (
            <div
              key={i}
              style={{position: 'absolute', left: L.vertical ? 0 : L.W * 0.6, width: L.vertical ? L.W : L.W * 0.34, top: labelY, display: 'flex', justifyContent: L.vertical ? 'center' : 'flex-start'}}
            >
              <KineticText text={c.use} start={s} exit={e} size={(L.vertical ? 50 : 52) * u} font="sans" weight={500} letterSpacing="-0.02em" align={L.vertical ? 'center' : 'left'} />
            </div>
          );
        })}
        {/* progress dots */}
        <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
          {CARDS.map((_, i) => {
            const on = Math.max(0, 1 - Math.abs(i - idx));
            const x0 = L.vertical ? L.W / 2 - 54 * u + i * 36 * u : L.W * 0.6 + i * 36 * u + 6 * u;
            const y0 = labelY + 110 * u;
            return <rect key={i} x={x0 - 6 * u} y={y0} width={(12 + on * 18) * u} height={6 * u} rx={3 * u} fill={on > 0.5 ? colors.gold : rgba(colors.ink, 0.2)} opacity={enter} />;
          })}
        </svg>
      </AbsoluteFill>
    </SceneIn>
  );
};
