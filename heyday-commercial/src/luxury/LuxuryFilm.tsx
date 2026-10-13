import React from 'react';
import {AbsoluteFill, Audio, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {clients, colors, contact, contactText, fonts, officialLogo, photos} from '../config/brand';
import {Globe} from '../components/Globe';
import {InnerGift} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoSlot} from '../components/PhotoSlot';
import {Wordmark} from '../components/Wordmark';
import {rgba} from '../lib/color';
import {useFontsReady, usePhotosReady} from '../lib/fonts';
import {useLayout} from '../lib/layout';
import {clamp, easeIn, easeInOut, easeOut, lerp} from '../lib/motion';
import {LUX, LUX_COPY} from './timeline';

const GOLD = '#D8B878';
const CHAMPAGNE = '#F1E2C2';
const BLACK = '#050507';

/** Real pieces for the gallery beat: the strongest dark-background shots first. */
const GALLERY = photos.beauty.filter((p) => ['Coca-Cola', 'Nike', 'Bauducco', 'Sicredi'].includes(p.label ?? ''));

// ------------------------------------------------------------------ helpers

/** Luxury type: slow fade, tracking opens up, slight de-blur. No sliding. */
const LuxText: React.FC<{
  text: string;
  start: number;
  end: number;
  y: number;
  size: number;
  italic?: boolean;
  color?: string;
  width: number;
  x: number;
  font?: 'display' | 'sans';
  weight?: number;
  tracking?: number; // em
  upper?: boolean;
}> = ({text, start, end, y, size, italic, color = CHAMPAGNE, width, x, font = 'display', weight = 200, tracking = 0.01, upper}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const pin = interpolate(t, [start, start + 1.1], [0, 1], {...clamp, easing: easeOut});
  const pout = interpolate(t, [end - 0.7, end], [0, 1], {...clamp, easing: easeIn});
  const o = pin * (1 - pout);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - width / 2,
        width,
        top: y,
        textAlign: 'center',
        fontFamily: font === 'display' ? fonts.display : fonts.sans,
        fontStyle: italic ? 'italic' : 'normal',
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.18,
        color,
        opacity: o,
        letterSpacing: `${tracking + (1 - pin) * 0.08 + pout * 0.04}em`,
        filter: `blur(${(1 - pin) * 6 + pout * 4}px)`,
        textTransform: upper ? 'uppercase' : 'none',
        fontVariationSettings: font === 'display' ? '"opsz" 144, "SOFT" 100' : undefined,
      }}
    >
      {text}
    </div>
  );
};

/** Out-of-focus gold lights drifting behind everything. */
const Bokeh: React.FC<{opacity: number}> = ({opacity}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = frame / fps;
  const u = Math.min(W, H) / 1080;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity}}>
      <defs>
        <radialGradient id="lux-bokeh">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.55" />
          <stop offset="70%" stopColor={GOLD} stopOpacity="0.18" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({length: 16}, (_, i) => {
        const a = random(`bk-a${i}`);
        const b = random(`bk-b${i}`);
        const c = random(`bk-c${i}`);
        const r = (40 + c * 120) * u;
        const x = ((a * W + t * (6 + b * 10) * u) % (W + 2 * r)) - r;
        const y = b * H + Math.sin(t * 0.3 + i) * 30 * u;
        return <circle key={i} cx={x} cy={y} r={r} fill="url(#lux-bokeh)" opacity={0.25 + 0.5 * c * (0.6 + 0.4 * Math.sin(t * 0.8 + i))} />;
      })}
    </svg>
  );
};

/** Animated film grain from a tiled noise texture. */
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const x = Math.floor(random(`gx${frame}`) * 256);
  const y = Math.floor(random(`gy${frame}`) * 256);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('fx/grain.png')})`,
        backgroundPosition: `${x}px ${y}px`,
        opacity: 0.07,
        mixBlendMode: 'overlay',
      }}
    />
  );
};

/** Anamorphic light streak. */
const Streak: React.FC<{x: number; y: number; w: number; o: number}> = ({x, y, w, o}) =>
  o <= 0 ? null : (
    <g opacity={o}>
      <defs>
        <linearGradient id={`st-${Math.round(y)}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={CHAMPAGNE} stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor={CHAMPAGNE} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={x - w / 2} y={y - 1.5} width={w} height={3} fill={`url(#st-${Math.round(y)})`} />
      <ellipse cx={x} cy={y} rx={w * 0.06} ry={10} fill="#fff" opacity={0.35} />
    </g>
  );

/** Six-armed snowflake in fine gold line. */
const Flake: React.FC<{x: number; y: number; size: number; rot: number; o: number}> = ({x, y, size, rot, o}) => {
  const arms = [];
  for (let i = 0; i < 6; i++) {
    arms.push(
      <g key={i} transform={`rotate(${i * 60})`}>
        <path d="M 0 0 L 0 -50 M 0 -18 L -10 -28 M 0 -18 L 10 -28 M 0 -33 L -8 -41 M 0 -33 L 8 -41" />
        <circle cx={0} cy={-50} r={2.4} fill={CHAMPAGNE} stroke="none" />
      </g>,
    );
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${size / 100})`} opacity={o} fill="none" stroke={CHAMPAGNE} strokeWidth={2.2} strokeLinecap="round">
      <circle r={70} fill="url(#lux-flake-glow)" stroke="none" />
      {arms}
      <circle r={5} fill={CHAMPAGNE} stroke="none" />
    </g>
  );
};

/** Ordinary giveaways in thin grey line (100×100 grid). */
const ORDINARY: string[] = [
  // mug
  'M 22 30 H 68 V 78 Q 68 88 58 88 H 32 Q 22 88 22 78 Z M 68 42 H 76 Q 86 42 86 54 Q 86 66 76 66 H 68 M 34 18 Q 38 12 34 6 M 46 18 Q 50 12 46 6',
  // pen
  'M 30 84 L 24 90 L 26 82 Z M 26 82 L 74 22 Q 80 16 86 22 Q 90 28 84 34 L 36 92 Z M 66 32 L 76 42',
  // notebook
  'M 26 12 H 78 Q 84 12 84 18 V 86 Q 84 92 78 92 H 26 Z M 26 12 V 92 M 18 24 H 32 M 18 40 H 32 M 18 56 H 32 M 18 72 H 32 M 44 32 H 72 M 44 44 H 66',
  // tote bag
  'M 18 36 H 82 L 76 90 H 24 Z M 36 36 Q 36 12 50 12 Q 64 12 64 36',
];

// ------------------------------------------------------------------ film

export const LuxuryFilm: React.FC<{music?: boolean}> = ({music = true}) => {
  useFontsReady();
  usePhotosReady([
    ...GALLERY.map((p) => staticFile(p.file)),
    staticFile('fx/grain.png'),
    ...(officialLogo ? [staticFile(officialLogo)] : []),
    ...clients.filter((c) => c.logo).map((c) => staticFile(c.logo!)),
  ]);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const V = L.vertical;
  const W = L.W;
  const H = L.H;
  const between = (a: number, b: number, e = easeInOut) => interpolate(t, [a, b], [0, 1], {...clamp, easing: e});
  const textY = V ? H * 0.72 : H * 0.84;
  const textW = V ? W - 160 * u : W * 0.7;
  const big = (V ? 74 : 64) * u;

  // ---------------- beat 1: the falling flake
  const fall = between(0.2, LUX.land, (x) => 1 - Math.pow(1 - x, 2.2));
  const flakeY = lerp(-120 * u, V ? H * 0.42 : H * 0.42, fall);
  const flakeO = between(0.2, 0.9) * (1 - between(LUX.land - 0.1, LUX.land + 0.35));
  const ring = between(LUX.land - 0.05, LUX.land + 1.2, easeOut);

  // ---------------- beats 2–4: the globe, one continuous camera move
  const gx = W / 2;
  const gy = V ? H * 0.4 : H * 0.39;
  const sF = (V ? 1.05 : 0.74) * u;
  const zoomIn = between(LUX.land, LUX.land + 0.9, easeOut);
  const pull = between(LUX.pull, LUX.reveal, easeInOut);
  const k = lerp(3.5, 3.15, between(LUX.land, LUX.pull, (x) => x)) * (1 - pull) + 1 * pull;
  // close-up on the gold bow and the floating glitter, then the full piece
  const fx = lerp(gx - 40 * sF, gx, pull);
  const fy = lerp(gy - 70 * sF, gy + 40 * sF, pull);
  // contrast beat: globe lifts and steps back, then returns
  const lift = between(LUX.contrast - 0.2, LUX.contrast + 0.8) * (1 - between(LUX.stays - 0.4, LUX.stays + 0.6));
  const liftY = lift * (V ? -H * 0.1 : -H * 0.14);
  const liftS = 1 - lift * 0.3;
  const shake = interpolate(t, [LUX.shake, LUX.shake + 0.15, LUX.shake + 0.3, LUX.shake + 0.45, LUX.shake + 0.6, LUX.shake + 0.75], [0, -7, 6, -4, 2, 0], clamp);
  const swirl = interpolate(t, [LUX.shake + 0.1, LUX.shake + 0.6, LUX.gallery], [0.15, 1.1, 0.25], clamp);
  const globeO = between(LUX.land - 0.05, LUX.land + 0.6) * (1 - between(LUX.gallery - 0.4, LUX.gallery + 0.2));
  const stayGlow = between(LUX.stays - 0.2, LUX.stays + 0.8) * (1 - between(LUX.gallery - 0.4, LUX.gallery));

  // ---------------- beat 4: ordinary gifts dissolve
  const ordIn = between(LUX.contrast + 0.3, LUX.contrast + 1.1, easeOut);
  const dust = between(LUX.dissolve, LUX.dissolve + 1.4, (x) => x);
  const iconSize = (V ? 175 : 140) * u;
  const iconY = V ? H * 0.6 : H * 0.66;
  const iconGap = (V ? 230 : 250) * u;

  // ---------------- beat 5: gallery
  const gIn = between(LUX.gallery - 0.1, LUX.gallery + 0.6);
  const gOut = between(LUX.end - 0.3, LUX.end + 0.3);
  const slot = (LUX.end - LUX.gallery - 0.5) / Math.max(1, GALLERY.length);
  const card = V ? {x: W / 2, y: H * 0.5, w: 820 * u, h: 1000 * u} : {x: W / 2, y: H * 0.52, w: 560 * u, h: 680 * u};

  // ---------------- beat 6: end card
  const endIn = between(LUX.end, LUX.end + 0.6);
  const gather = between(LUX.end + 0.1, LUX.end + 1.7, easeInOut);
  const logoY = V ? H * 0.43 : H * 0.4;

  return (
    <AbsoluteFill style={{background: BLACK}}>
      {/* deep stage light */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 45% at 50% ${(gy / H) * 100}%, ${rgba('#1a1c24', 0.9)}, transparent 72%), radial-gradient(ellipse 40% 22% at 50% ${(gy / H) * 100 + 22}%, ${rgba(GOLD, 0.07 + stayGlow * 0.08)}, transparent 70%)`,
        }}
      />
      <Bokeh opacity={0.35 + 0.35 * between(LUX.land, LUX.land + 1)} />

      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <radialGradient id="lux-flake-glow">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.35" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="lux-floor">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.16" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lux-bottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLACK} stopOpacity="0" />
            <stop offset="100%" stopColor={BLACK} stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* beat 1 — flake */}
        {t < LUX.land + 0.5 && <Flake x={W / 2 + Math.sin(t * 0.9) * 26 * u} y={flakeY} size={70 * u} rot={t * 18} o={flakeO} />}
        {ring > 0 && ring < 1 && (
          <circle cx={W / 2} cy={V ? H * 0.42 : H * 0.42} r={ring * Math.max(W, H) * 0.8} fill="none" stroke={CHAMPAGNE} strokeWidth={(1 - ring) * 6 * u} opacity={(1 - ring) * 0.8} />
        )}

        {/* beats 2–4 — the globe under one continuous camera */}
        {globeO > 0 && (
          <g opacity={globeO}>
            <ellipse cx={gx} cy={gy + 430 * sF * liftS + liftY} rx={520 * u} ry={70 * u} fill="url(#lux-floor)" opacity={stayGlow * 0.8 + 0.4} />
            <g transform={`translate(${W / 2} ${gy}) scale(${k * (0.97 + 0.03 * zoomIn)}) translate(${-fx} ${-fy})`}>
              <g transform={`translate(${gx} ${gy + liftY}) scale(${liftS}) translate(${-gx} ${-gy})`}>
                <Globe
                  id="lux-globe"
                  x={gx}
                  y={gy}
                  scale={sF}
                  t={t}
                  rotate={shake}
                  swirl={swirl}
                  baseColor="#0E0F13"
                  plaque="HEYDAY"
                  glitter={GOLD}
                  inner={<InnerGift accent="#14161B" pines={false} />}
                  sheen={interpolate(t, [11.8, 13.4], [0, 1], clamp)}
                />
              </g>
            </g>
          </g>
        )}
        <Streak x={gx} y={gy - 120 * sF} w={W * 1.2} o={interpolate(t, [11.9, 12.3, 13.2], [0, 0.85, 0], clamp)} />
        <Streak x={gx} y={gy - 40 * sF} w={W * 1.1} o={interpolate(t, [LUX.shake + 0.4, LUX.shake + 0.7, LUX.shake + 1.5], [0, 0.6, 0], clamp)} />

        {/* beat 4 — ordinary gifts, then dust */}
        {t > LUX.contrast && t < LUX.stays + 0.5 &&
          ORDINARY.map((d, i) => {
            const cx = W / 2 + (i - 1.5) * iconGap;
            const o = ordIn * (1 - Math.min(1, dust * 1.6));
            const parts = Array.from({length: 46}, (_, j) => {
              const a = random(`d${i}-${j}`);
              const b = random(`e${i}-${j}`);
              const c = random(`f${i}-${j}`);
              const local = Math.max(0, Math.min(1, dust * 1.4 - a * 0.4));
              const px = cx + (a - 0.5) * iconSize * 0.8 + local * (60 + b * 220) * u;
              const py = iconY + (b - 0.5) * iconSize * 0.8 - local * (40 + c * 160) * u;
              return <circle key={j} cx={px} cy={py} r={(1.2 + c * 2.4) * u} fill="#9AA0AA" opacity={local > 0 ? (1 - local) * 0.8 : 0} />;
            });
            return (
              <g key={i}>
                <g transform={`translate(${cx - iconSize / 2} ${iconY - iconSize / 2}) scale(${iconSize / 100})`} opacity={o}>
                  <path d={d} fill="none" stroke="#9AA0AA" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ordIn} />
                </g>
                {parts}
              </g>
            );
          })}

        <rect x={0} y={H * 0.55} width={W} height={H * 0.45} fill="url(#lux-bottom)" opacity={between(LUX.land, LUX.land + 0.5) * (1 - gIn)} />
      </svg>

      {/* gold dust inside the frame during the globe beats */}
      <SnowField seed="lux-dust" count={50} color={CHAMPAGNE} glitterColor={GOLD} glitterRatio={0.5} opacity={0.35 * globeO} speed={0.3} drift={4} />

      {/* beat 5 — gallery of real pieces */}
      {gIn > 0 && gOut < 1 && (
        <AbsoluteFill style={{opacity: gIn * (1 - gOut)}}>
          <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
            {GALLERY.map((ph, i) => {
              const s0 = LUX.gallery + 0.3 + i * slot;
              const s1 = s0 + slot;
              if (t < s0 - 0.05 || t > s1 + 0.9) return null;
              const pin = interpolate(t, [s0, s0 + 0.8], [0, 1], {...clamp, easing: easeOut});
              const zoom = 1.04 + (t - s0) * 0.025;
              return (
                <g key={ph.file} opacity={pin}>
                  <PhotoSlot id={`lux-g${i}`} photo={ph} x={card.x} y={card.y} w={card.w} h={card.h} shape="rounded" zoom={zoom} />
                  <rect x={card.x - card.w / 2} y={card.y - card.h / 2} width={card.w} height={card.h} rx={Math.min(card.w, card.h) * 0.06} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.5 * u} />
                </g>
              );
            })}
          </svg>
          {GALLERY.map((ph, i) => {
            const s0 = LUX.gallery + 0.3 + i * slot;
            return (
              <LuxText
                key={ph.file}
                text={ph.label ?? ''}
                start={s0 + 0.2}
                end={i < GALLERY.length - 1 ? s0 + slot + 0.1 : LUX.end + 0.2}
                x={W / 2}
                y={card.y + card.h / 2 + 34 * u}
                width={W}
                size={24 * u}
                font="sans"
                weight={600}
                tracking={0.4}
                upper
                color={GOLD}
              />
            );
          })}
        </AbsoluteFill>
      )}

      {/* beat 6 — gold particles gather into the logo */}
      {endIn > 0 && (
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {Array.from({length: 140}, (_, i) => {
            const sx = random(`gs${i}`) * W;
            const sy = random(`gt${i}`) * H;
            const tx = W / 2 + (random(`gu${i}`) - 0.5) * 520 * u;
            const ty = logoY + (random(`gv${i}`) - 0.5) * 90 * u;
            const p = Math.min(1, Math.max(0, gather * 1.25 - random(`gw${i}`) * 0.25));
            const o = endIn * (1 - between(LUX.end + 1.5, LUX.end + 2.4)) * (0.4 + 0.6 * random(`gz${i}`));
            return <circle key={i} cx={lerp(sx, tx, p)} cy={lerp(sy, ty, p)} r={(1 + random(`gr${i}`) * 2.2) * u} fill={i % 3 ? CHAMPAGNE : GOLD} opacity={o} />;
          })}
        </svg>
      )}
      {t > LUX.end && (
        <>
          <Wordmark x={W / 2} y={logoY} height={(V ? 92 : 80) * u} start={LUX.end + 1.2} color={CHAMPAGNE} shimmer={interpolate(t, [LUX.end + 3.6, LUX.end + 4.8], [0, 1.15], clamp)} />
          <LuxText text={LUX_COPY.tagline} start={LUX.end + 2.0} end={LUX.total + 5} x={W / 2} y={logoY + (V ? 120 : 100) * u} width={textW} size={(V ? 56 : 48) * u} italic />
          <div
            style={{
              position: 'absolute',
              left: W / 2 - 160 * u,
              width: 320 * u,
              top: logoY + (V ? 230 : 190) * u,
              height: 1.5 * u,
              background: GOLD,
              opacity: 0.6,
              transform: `scaleX(${between(LUX.end + 2.6, LUX.end + 3.6, easeOut)})`,
            }}
          />
          <LuxText
            text={`${contact.website}   ·   ${contact.instagram}`}
            start={LUX.end + 3.0}
            end={LUX.total + 5}
            x={W / 2}
            y={logoY + (V ? 268 : 220) * u}
            width={W}
            size={(V ? 32 : 28) * u}
            font="sans"
            weight={400}
            tracking={0.12}
            color={CHAMPAGNE}
          />
          <LuxText
            text={`WhatsApp ${contactText(contact.whatsapp)}`}
            start={LUX.end + 3.3}
            end={LUX.total + 5}
            x={W / 2}
            y={logoY + (V ? 320 : 264) * u}
            width={W}
            size={(V ? 32 : 28) * u}
            font="sans"
            weight={400}
            tracking={0.12}
            color={rgba(CHAMPAGNE, 0.8)}
          />
        </>
      )}

      {/* copy */}
      <LuxText text={LUX_COPY.opened} start={0.8} end={3.9} x={W / 2} y={textY} width={textW} size={big} />
      <LuxText text={LUX_COPY.remembered} start={5.0} end={7.8} x={W / 2} y={V ? H * 0.085 : H * 0.07} width={textW} size={big} italic color={CHAMPAGNE} />
      <LuxText text={LUX_COPY.handmade} start={10.6} end={13.7} x={W / 2} y={textY} width={textW} size={big} />
      <LuxText text={LUX_COPY.forgotten} start={LUX.contrast + 0.5} end={LUX.dissolve + 1.2} x={W / 2} y={V ? H * 0.74 : H * 0.85} width={textW} size={big * 0.85} color="#B9BEC7" />
      <LuxText text={LUX_COPY.stays} start={LUX.stays} end={LUX.shake + 0.3} x={W / 2} y={textY} width={textW} size={big} />
      <LuxText text={LUX_COPY.memory} start={LUX.shake + 0.4} end={LUX.gallery - 0.1} x={W / 2} y={textY} width={textW} size={big} italic />
      <LuxText text={LUX_COPY.galleryEyebrow} start={LUX.gallery} end={LUX.end - 0.1} x={W / 2} y={V ? H * 0.11 : H * 0.05} width={W} size={22 * u} font="sans" weight={600} tracking={0.42} upper color={GOLD} />
      <LuxText text={LUX_COPY.gallery} start={LUX.gallery + 0.15} end={LUX.end - 0.1} x={W / 2} y={V ? H * 0.135 : H * 0.085} width={textW} size={(V ? 54 : 44) * u} />

      <Grain />
      {/* vignette */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none'}} />
      {/* fade from / to black */}
      <AbsoluteFill style={{background: BLACK, opacity: 1 - between(0, 0.6)}} />
      {music && <Audio src={staticFile('audio/heyday-luxury.wav')} />}
    </AbsoluteFill>
  );
};
