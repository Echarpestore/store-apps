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
    const list = clients.slice(0, 12);
    const cols = L.vertical ? 2 : Math.ceil(list.length / 2);
    const gap = (L.vertical ? 24 : 24) * u;
    const gridW = L.vertical ? L.W - 160 * u : L.W * 0.86;
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const cellH = (L.vertical ? 150 : 180) * u;
    const x0 = (L.W - gridW) / 2;
    const y0 = L.vertical ? L.H * 0.27 : L.H * 0.36;
    const area = cellW * cellH * 0.13; // optical size: every logo gets the same visual area
    const sweep = interpolate(t, [2.6, 4.2], [-0.2, 1.2], clamp);
    return list.map((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(list.length / cols);
      const inRow = row === rows - 1 ? list.length - row * cols : cols;
      const rowShift = ((cols - inRow) * (cellW + gap)) / 2; // centre an incomplete last row
      const st = 1.0 + (row * cols + col) * 0.09;
      const s = springAt(frame, fps, st, {damping: 17});
      const reveal = interpolate(t, [st + 0.15, st + 0.8], [0, 1], {...clamp, easing: easeOut});
      const draw = interpolate(t, [st, st + 0.9], [0, 1], {...clamp, easing: easeOut});
      const a = c.aspect ?? 3;
      let lw = Math.sqrt(area * a) * (c.scale ?? 1);
      let lh = lw / a;
      const maxW = cellW * 0.72;
      const maxH = cellH * 0.56;
      const k = Math.min(1, maxW / lw, maxH / lh);
      lw *= k;
      lh *= k;
      const cx = x0 + rowShift + col * (cellW + gap);
      const cy = y0 + row * (cellH + gap);
      // gold light passing over the grid once everything is in
      const d = (col / cols + row * 0.12) - sweep;
      const glow = Math.max(0, 1 - Math.abs(d) * 6);
      return (
        <div
          key={c.name}
          style={{
            position: 'absolute',
            left: cx,
            top: cy,
            width: cellW,
            height: cellH,
            opacity: Math.min(1, s * 1.4),
            transform: `translateY(${(1 - s) * 50 * u}px) scale(${0.92 + 0.08 * s})`,
          }}
        >
          <svg width={cellW} height={cellH} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <rect x={0} y={0} width={cellW} height={cellH} rx={24 * u} fill="#fff" />
            <rect x={0} y={0} width={cellW} height={cellH} rx={24 * u} fill="none" stroke={rgba(colors.gold, 0.35 + glow * 0.65)} strokeWidth={(1.5 + glow * 1.5) * u} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
          </svg>
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: reveal, filter: `blur(${(1 - reveal) * 6}px)`}}>
            {c.logo ? (
              // original artwork and colours, aspect ratio preserved (contain)
              <Img src={staticFile(c.logo)} style={{width: lw, height: lh, objectFit: 'contain'}} />
            ) : (
              <span style={{fontFamily: fonts.sans, fontWeight: 600, fontSize: (L.vertical ? 34 : 30) * u, letterSpacing: '0.04em', color: colors.ink, textAlign: 'center', lineHeight: 1.1, padding: `0 ${14 * u}px`}}>
                {c.name}
              </span>
            )}
          </div>
          {c.project && (
            <Img
              src={staticFile(c.project.file)}
              style={{position: 'absolute', right: 10 * u, bottom: 10 * u, width: cellH * 0.36, height: cellH * 0.36, borderRadius: '50%', objectFit: 'cover', opacity: reveal}}
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
          <Eyebrow text={hasClients ? 'Projetos realizados' : 'Nossa trajetória'} start={0.45} size={24 * u} align={L.vertical || hasClients ? 'center' : 'left'} />
          <div style={{height: 26 * u}} />
          <KineticText
            text={headline}
            start={0.6}
            size={(L.vertical ? 68 : 64) * u}
            weight={300}
            align={L.vertical || hasClients ? 'center' : 'left'}
            width={L.vertical || hasClients ? L.W - 160 * u : L.W * 0.6}
            highlight={['2014', 'história']}
          />
        </div>
        {hasClients ? clientGrid() : factCards()}
        {hasClients && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: L.W,
              top: L.vertical ? L.H * 0.27 + Math.ceil(clients.length / 2) * (174 * u) + 44 * u : L.H * 0.36 + 2 * (204 * u) + 50 * u,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontSize: 26 * u,
              fontWeight: 600,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: colors.muted,
              opacity: interpolate(t, [2.4, 3.0], [0, 1], clamp),
            }}
          >
            {copy.s3.clientsCaption} · desde 2014
          </div>
        )}
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
