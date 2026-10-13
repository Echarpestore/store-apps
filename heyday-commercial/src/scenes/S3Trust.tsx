import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {clients, colors, copy, fonts} from '../config/brand';
import {PaperBackground} from '../components/Background';
import {BoxesIcon, BuildingIcon, CalendarIcon, FlagBRIcon, MegaphoneIcon, StarIcon} from '../components/Icons';
import {SnowField} from '../components/Particles';
import {SceneIn} from '../components/Transition';
import {Eyebrow, KineticText} from '../components/Typography';
import {rgba} from '../lib/color';
import {useLayout} from '../lib/layout';
import {clamp, easeOut, springAt} from '../lib/motion';

/** Odometer: each digit rolls up into place. */
const Odometer: React.FC<{value: string; start: number; size: number}> = ({value, start, size}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <span style={{display: 'inline-flex', fontFamily: fonts.display, fontSize: size, fontWeight: 300, lineHeight: 1, color: colors.ink, fontVariantNumeric: 'tabular-nums'}}>
      {value.split('').map((ch, i) => {
        const p = interpolate(t, [start + i * 0.08, start + 0.9 + i * 0.12], [0, 1], {...clamp, easing: easeOut});
        const isDigit = /\d/.test(ch);
        if (!isDigit) {
          return (
            <span key={i} style={{opacity: p, color: colors.gold}}>
              {ch}
            </span>
          );
        }
        const target = Number(ch);
        const roll = target + 10; // roll through one full cycle
        const pos = roll * p;
        return (
          <span key={i} style={{display: 'inline-block', height: size, overflow: 'hidden', position: 'relative'}}>
            <span style={{display: 'flex', flexDirection: 'column', transform: `translateY(${-pos * size}px)`}}>
              {Array.from({length: roll + 1}, (_, k) => (
                <span key={k} style={{height: size, display: 'block'}}>
                  {k % 10}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

const FACT_ICONS = [CalendarIcon, FlagBRIcon, BoxesIcon];
const AUD_ICONS = [BuildingIcon, MegaphoneIcon, StarIcon];

export const S3Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const hasClients = clients.length > 0;
  const headline = hasClients ? copy.s3.clientsHeadline : copy.s3.factsHeadline;

  // ---- verified client grid (used only when clients are configured) ----
  const clientGrid = () => {
    const cols = L.vertical ? 2 : 4;
    const cellW = L.vertical ? (L.W - 200 * u) / 2 : (L.W * 0.86) / 4;
    const cellH = cellW * 0.62;
    const x0 = L.vertical ? 80 * u : L.W * 0.07;
    const y0 = L.vertical ? L.H * 0.3 : L.H * 0.38;
    return clients.slice(0, L.vertical ? 8 : 8).map((c, i) => {
      const s = springAt(frame, fps, 1.0 + i * 0.12);
      const col = i % cols;
      const row = Math.floor(i / cols);
      return (
        <div
          key={c.name}
          style={{
            position: 'absolute',
            left: x0 + col * (cellW + 40 * u),
            top: y0 + row * (cellH + 40 * u),
            width: cellW,
            height: cellH,
            background: '#fff',
            borderRadius: 24 * u,
            boxShadow: `0 ${20 * u}px ${50 * u}px ${rgba(colors.ink, 0.08)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: s,
            transform: `translateY(${(1 - s) * 60 * u}px) scale(${0.9 + 0.1 * s})`,
            overflow: 'hidden',
          }}
        >
          {/* logo kept in original proportions: contain, never stretched */}
          <Img src={staticFile(c.logo)} style={{maxWidth: '62%', maxHeight: '48%', objectFit: 'contain'}} />
          {c.project && (
            <Img
              src={staticFile(c.project.file)}
              style={{position: 'absolute', right: 12 * u, bottom: 12 * u, width: cellH * 0.38, height: cellH * 0.38, borderRadius: '50%', objectFit: 'cover'}}
            />
          )}
        </div>
      );
    });
  };

  // ---- verified facts (current state) ----
  const factCards = () => {
    const n = copy.s3.facts.length;
    return copy.s3.facts.map((f, i) => {
      const s = springAt(frame, fps, 1.1 + i * 0.35, {damping: 16});
      const draw = interpolate(t, [1.1 + i * 0.35, 2.0 + i * 0.35], [0, 1], {...clamp, easing: easeOut});
      const Icon = FACT_ICONS[i];
      const w = L.vertical ? L.W - 160 * u : (L.W * 0.84 - 2 * 40 * u) / n;
      const h = L.vertical ? 250 * u : 330 * u;
      const left = L.vertical ? 80 * u : L.W * 0.08 + i * (w + 40 * u);
      const top = L.vertical ? L.H * 0.33 + i * (h + 44 * u) : L.H * 0.4;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left,
            top,
            width: w,
            height: h,
            opacity: Math.min(1, s * 1.3),
            transform: `translateY(${(1 - s) * 80 * u}px)`,
          }}
        >
          <svg width={w} height={h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <rect x={0} y={0} width={w} height={h} rx={28 * u} fill="#fff" opacity={0.9} />
            <rect x={0} y={0} width={w} height={h} rx={28 * u} fill="none" stroke={colors.gold} strokeWidth={2 * u} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
            <Icon x={L.vertical ? 100 * u : 80 * u} y={L.vertical ? h / 2 : 80 * u} size={L.vertical ? 92 * u : 80 * u} draw={draw} color={colors.gold} />
          </svg>
          <div
            style={{
              position: 'absolute',
              left: L.vertical ? 190 * u : 40 * u,
              top: L.vertical ? 0 : 140 * u,
              height: L.vertical ? h : undefined,
              right: 30 * u,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 8 * u,
            }}
          >
            <Odometer value={f.value} start={1.3 + i * 0.35} size={(L.vertical ? 96 : 96) * u} />
            <div style={{fontFamily: fonts.sans, fontSize: (L.vertical ? 32 : 28) * u, color: colors.muted, opacity: draw, lineHeight: 1.25}}>{f.label}</div>
          </div>
        </div>
      );
    });
  };

  const audTop = L.vertical ? L.H * 0.33 + 3 * (294 * u) + 60 * u : L.H * 0.8;
  return (
    <SceneIn type="wipeUp">
      <AbsoluteFill style={{transform: `scale(${1 + t * 0.005})`}}>
        <PaperBackground tint={colors.goldLight} warmth={0.8} />
        <SnowField seed="s3bg" count={30} color={colors.ice} glitterColor={colors.gold} opacity={0.5} speed={0.35} drift={-10} />
        <div style={{position: 'absolute', left: 80 * u, top: L.vertical ? L.H * 0.075 : L.H * 0.1, width: L.W - 160 * u}}>
          <Eyebrow text={hasClients ? 'Projetos realizados' : 'Nossa trajetória'} start={0.45} size={24 * u} align={L.vertical ? 'center' : 'left'} />
          <div style={{height: 26 * u}} />
          <KineticText
            text={headline}
            start={0.6}
            size={(L.vertical ? 68 : 64) * u}
            weight={300}
            align={L.vertical ? 'center' : 'left'}
            width={L.vertical ? L.W - 160 * u : L.W * 0.6}
            highlight={['2014', 'história']}
          />
        </div>
        {hasClients ? clientGrid() : factCards()}
        {!hasClients && (
          <div style={{position: 'absolute', left: L.vertical ? 0 : L.W * 0.08, width: L.vertical ? L.W : undefined, top: audTop, display: 'flex', justifyContent: L.vertical ? 'center' : 'flex-start', gap: 24 * u}}>
            {copy.s3.audiences.map((a, i) => {
              const s = springAt(frame, fps, 3.0 + i * 0.18);
              const Icon = AUD_ICONS[i];
              return (
                <div
                  key={a}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12 * u,
                    padding: `${16 * u}px ${28 * u}px ${16 * u}px ${18 * u}px`,
                    borderRadius: 999,
                    background: colors.ink,
                    color: colors.paper,
                    fontFamily: fonts.sans,
                    fontWeight: 500,
                    fontSize: 30 * u,
                    opacity: s,
                    transform: `translateY(${(1 - s) * 30 * u}px) scale(${0.85 + 0.15 * s})`,
                  }}
                >
                  <svg width={44 * u} height={44 * u}>
                    <Icon x={22 * u} y={22 * u} size={40 * u} color={colors.goldLight} draw={interpolate(t, [3.1 + i * 0.18, 3.9 + i * 0.18], [0, 1], clamp)} />
                  </svg>
                  {a}
                </div>
              );
            })}
          </div>
        )}
      </AbsoluteFill>
    </SceneIn>
  );
};
