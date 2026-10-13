import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {clients, contact, contactText, fonts, officialLogo, photos} from '../config/brand';
import {Globe} from '../components/Globe';
import {InnerLogo} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoSlot} from '../components/PhotoSlot';
import {KineticText} from '../components/Typography';
import {Wordmark} from '../components/Wordmark';
import {rgba} from '../lib/color';
import {useFontsReady, usePhotosReady} from '../lib/fonts';
import {useLayout} from '../lib/layout';
import {clamp, easeIn, easeInOut, easeOut, lerp} from '../lib/motion';
import {BR, BR_BRANDS, BR_COPY} from './timeline';

const BG = '#F5F5F7';
const INK = '#1D1D1F';
const GREY = '#86868B';

const BRANDS = BR_BRANDS.map((b) => ({...b, client: clients.find((c) => c.name === b.name)})).filter((b) => b.client?.logo);
const PROOF = ['Coca-Cola', 'Nike'].map((n) => photos.beauty.find((p) => p.label === n)).filter((p): p is NonNullable<typeof p> => Boolean(p));

/** The client's logo standing on a small white plaque (sphere-local coords, ground ≈ y 175). */
const LogoPlaque: React.FC<{logo: string; aspect: number; scale?: number}> = ({logo, aspect, scale = 1}) => {
  const A = 30000 * scale;
  let lw = Math.sqrt(A * aspect);
  let lh = lw / aspect;
  const k = Math.min(1, 380 / lw, 150 / lh);
  lw *= k;
  lh *= k;
  const pw = lw + 70;
  const ph = lh + 60;
  const cy = 150 - ph / 2;
  return (
    <g>
      <ellipse cx={0} cy={176} rx={pw * 0.55} ry={14} fill="#000" opacity={0.12} />
      <rect x={-22} y={150} width={44} height={22} rx={4} fill="#D9DCE1" />
      <rect x={-pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={16} fill="#FFFFFF" stroke="#E3E5E9" strokeWidth={2} />
      <rect x={-pw / 2} y={cy - ph / 2} width={pw} height={ph * 0.45} rx={16} fill="#fff" opacity={0.6} />
      <image href={staticFile(logo)} x={-lw / 2} y={cy - lh / 2} width={lw} height={lh} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
};

export const BrandsFilm: React.FC<{music?: boolean}> = ({music = true}) => {
  useFontsReady();
  usePhotosReady([...BRANDS.map((b) => staticFile(b.client!.logo!)), ...PROOF.map((p) => staticFile(p.file)), ...(officialLogo ? [staticFile(officialLogo)] : [])]);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const V = L.vertical;
  const W = L.W;
  const H = L.H;
  const between = (a: number, b: number, e = easeInOut) => interpolate(t, [a, b], [0, 1], {...clamp, easing: e});
  const n = BRANDS.length;
  const arrive = (k: number) => BR.trackStart + k * BR.step;

  // ---------------- track position (continuous index with eased steps)
  let idx = -(1 - between(BR.trackStart - 0.6, BR.trackStart, easeOut));
  for (let k = 1; k < n; k++) idx += between(arrive(k) - 0.62, arrive(k), easeInOut);
  const spacing = V ? W * 0.95 : W * 0.48;
  const trackY = V ? H * 0.45 : H * 0.47;
  const trackS = (V ? 0.95 : 0.78) * u;

  // ---------------- shelf grid
  const gridPos = (k: number) => {
    if (V) {
      const row = k < 4 ? 0 : 1;
      const col = row === 0 ? k : k - 4;
      const xs = row === 0 ? [0.14, 0.38, 0.62, 0.86] : [0.26, 0.5, 0.74];
      return {x: W * xs[col], y: H * (row === 0 ? 0.42 : 0.67), s: 0.36 * u};
    }
    return {x: W * (0.09 + (k * 0.82) / (n - 1)), y: H * 0.52, s: 0.34 * u};
  };
  const shelfOut = between(BR.proof - 0.4, BR.proof + 0.1, easeIn);

  // ---------------- proof + CTA
  const proofIn = between(BR.proof, BR.proof + 0.7, easeOut);
  const proofOut = between(BR.cta - 0.4, BR.cta, easeIn);
  const ctaIn = between(BR.cta, BR.cta + 0.6);
  const ctaGlobeY = V ? H * 0.3 : H * 0.36;

  return (
    <AbsoluteFill style={{background: BG}}>
      <AbsoluteFill style={{background: `radial-gradient(ellipse 70% 50% at 50% 40%, #FFFFFF, transparent 75%)`}} />
      <SnowField seed="br-bg" count={40} color="#C9D3DF" glitterColor="#C9A465" glitterRatio={0.1} opacity={0.6} speed={0.35} drift={6} />

      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {/* brand globes: track → shelf */}
        {t < BR.proof + 0.2 &&
          BRANDS.map((b, k) => {
            const tx = W / 2 + (k - idx) * spacing;
            const g = gridPos(k);
            const p = between(BR.shelf + k * 0.06, BR.shelf + 1.1 + k * 0.06, easeInOut);
            const x = lerp(tx, g.x, p);
            const y = lerp(trackY, g.y, p) + (1 - p) * 0;
            const s = lerp(trackS, g.s, p) * (1 - shelfOut * 0.2);
            if (x < -400 * s * 2 || x > W + 400 * s * 2) return null;
            const a = arrive(k);
            const outline = between(a - 0.55, a + 0.05);
            const solid = Math.max(between(a - 0.15, a + 0.35), p);
            const land = interpolate(t, [a, a + 0.15, a + 0.32, a + 0.5, a + 0.7], [0, -4, 3, -1.5, 0], clamp);
            const shake = interpolate(t, [BR.shake + k * 0.03, BR.shake + 0.15 + k * 0.03, BR.shake + 0.3 + k * 0.03, BR.shake + 0.45 + k * 0.03, BR.shake + 0.6 + k * 0.03], [0, -6, 5, -3, 0], clamp);
            const swirl = Math.max(interpolate(t, [a, a + 0.2, a + 1.3], [0, 0.55, 0.1], clamp), interpolate(t, [BR.shake, BR.shake + 0.4, BR.proof], [0, 0.9, 0.2], clamp));
            const plaque = <LogoPlaque logo={b.client!.logo!} aspect={b.client!.aspect ?? 3} scale={b.client!.scale} />;
            return (
              <g key={b.name} opacity={1 - shelfOut}>
                {/* the logo stands alone first… */}
                {solid < 1 && (
                  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={1 - solid}>
                    {plaque}
                  </g>
                )}
                {/* …then the globe forms around it */}
                <Globe id={`br-${k}`} x={x} y={y} scale={s} t={t + k * 2} baseColor={b.base} plaque={b.plaque} inner={plaque} outline={outline} solid={solid} swirl={swirl} rotate={land + shake} sheen={interpolate(t, [a + 0.2, a + 1.3], [0, 1], clamp)} />
              </g>
            );
          })}

        {/* proof: real pieces */}
        {proofIn > 0 && proofOut < 1 &&
          PROOF.map((ph, i) => {
            const cw = (V ? 440 : 420) * u;
            const ch = (V ? 600 : 560) * u;
            const cx = V ? W * (i === 0 ? 0.285 : 0.715) : W * (i === 0 ? 0.37 : 0.63);
            const cy = V ? H * 0.47 : H * 0.53;
            const pi = between(BR.proof + i * 0.2, BR.proof + 0.8 + i * 0.2, easeOut);
            return (
              <g key={ph.file} opacity={pi * (1 - proofOut)} transform={`translate(0 ${(1 - pi) * 40 * u})`}>
                <rect x={cx - cw / 2 + 10 * u} y={cy - ch / 2 + 30 * u} width={cw - 20 * u} height={ch} rx={36 * u} fill="#000" opacity={0.1} />
                <PhotoSlot id={`br-p${i}`} photo={ph} x={cx} y={cy} w={cw} h={ch} shape="rounded" zoom={1.03 + Math.max(0, t - BR.proof) * 0.02} />
                <text x={cx} y={cy + ch / 2 + 54 * u} textAnchor="middle" fontFamily={fonts.sans} fontWeight={600} fontSize={22 * u} letterSpacing={6 * u} fill={GREY}>
                  {(ph.label ?? '').toUpperCase()}
                </text>
              </g>
            );
          })}

        {/* CTA globe: the next one is yours */}
        {ctaIn > 0 && (
          <Globe
            id="br-cta"
            x={W / 2}
            y={ctaGlobeY}
            scale={(V ? 0.62 : 0.5) * u}
            t={t}
            baseColor={INK}
            plaque="SUA MARCA"
            inner={<InnerLogo label="SUA MARCA" />}
            outline={between(BR.cta + 0.1, BR.cta + 1.0)}
            solid={between(BR.cta + 0.8, BR.cta + 1.4)}
            sheen={interpolate(t, [BR.cta + 1.4, BR.cta + 2.4], [0, 1], clamp)}
            opacity={ctaIn}
          />
        )}
      </svg>

      {/* intro */}
      <div style={{position: 'absolute', left: 80 * u, width: W - 160 * u, top: V ? H * 0.42 : H * 0.4}}>
        <KineticText text={BR_COPY.intro} start={0.5} exit={2.15} size={(V ? 92 : 84) * u} font="sans" weight={600} letterSpacing="-0.035em" color={INK} align="center" width={W - 160 * u} lineHeight={1.05} />
      </div>

      {/* track: eyebrow + counter */}
      {t > BR.trackStart - 0.6 && t < BR.shelf + 0.5 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: W,
              top: V ? H * 0.1 : H * 0.07,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontWeight: 600,
              fontSize: 24 * u,
              letterSpacing: '0.32em',
              color: GREY,
              opacity: between(BR.trackStart - 0.6, BR.trackStart) * (1 - between(BR.shelf - 0.2, BR.shelf + 0.3)),
            }}
          >
            PROJETOS HEYDAY
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: W,
              top: V ? H * 0.8 : H * 0.88,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontWeight: 600,
              fontSize: (V ? 44 : 38) * u,
              letterSpacing: '-0.02em',
              color: INK,
              opacity: between(BR.trackStart - 0.3, BR.trackStart + 0.2) * (1 - between(BR.shelf - 0.2, BR.shelf + 0.3)),
            }}
          >
            {BRANDS[Math.max(0, Math.min(n - 1, Math.round(idx)))]?.name}
            <span style={{color: GREY, fontWeight: 500, marginLeft: 18 * u, fontSize: (V ? 28 : 24) * u}}>
              {String(Math.max(0, Math.min(n - 1, Math.round(idx))) + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
            </span>
          </div>
        </>
      )}

      {/* shelf headline */}
      <div style={{position: 'absolute', left: 80 * u, width: W - 160 * u, top: V ? H * 0.12 : H * 0.14}}>
        <KineticText text={BR_COPY.shelf} start={BR.shelf + 0.5} exit={BR.proof - 0.45} size={(V ? 76 : 70) * u} font="sans" weight={600} letterSpacing="-0.035em" color={INK} align="center" width={W - 160 * u} lineHeight={1.05} />
      </div>

      {/* proof headline */}
      <div style={{position: 'absolute', left: 80 * u, width: W - 160 * u, top: V ? H * 0.12 : H * 0.07}}>
        <KineticText text={BR_COPY.proof} start={BR.proof + 0.2} exit={BR.cta - 0.45} size={(V ? 72 : 60) * u} font="sans" weight={600} letterSpacing="-0.035em" color={INK} align="center" width={W - 160 * u} lineHeight={1.05} />
      </div>

      {/* CTA */}
      {t > BR.cta && (
        <>
          <div style={{position: 'absolute', left: 80 * u, width: W - 160 * u, top: V ? H * 0.53 : H * 0.62}}>
            <KineticText text={BR_COPY.cta} start={BR.cta + 0.9} size={(V ? 84 : 72) * u} font="sans" weight={600} letterSpacing="-0.035em" color={INK} align="center" width={W - 160 * u} lineHeight={1.05} highlight={['sua', 'marca']} />
          </div>
          <Wordmark x={W / 2} y={V ? H * 0.72 : H * 0.8} height={(V ? 70 : 56) * u} start={BR.cta + 1.8} color={INK} shimmer={interpolate(t, [BR.cta + 3.4, BR.cta + 4.4], [0, 1.15], clamp)} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: W,
              top: V ? H * 0.785 : H * 0.875,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontSize: (V ? 32 : 26) * u,
              fontWeight: 500,
              color: INK,
              lineHeight: 1.6,
              opacity: between(BR.cta + 2.4, BR.cta + 3.0),
            }}
          >
            WhatsApp {contactText(contact.whatsapp)}
            <span style={{color: GREY}}>{'   ·   '}</span>
            {contact.website}
            <br />
            <span style={{color: GREY}}>{contactText(contact.email)}{'   ·   '}{contact.instagram}</span>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 60 * u,
              width: W - 120 * u,
              top: V ? H * 0.93 : H * 0.955,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontSize: (V ? 18 : 15) * u,
              color: rgba(GREY, 0.9),
              opacity: between(BR.cta + 2.8, BR.cta + 3.4),
            }}
          >
            {BR_COPY.legal}
          </div>
        </>
      )}

      <AbsoluteFill style={{background: '#fff', opacity: 1 - between(0, 0.4)}} />
      {music && <Audio src={staticFile('audio/heyday-brands.wav')} />}
    </AbsoluteFill>
  );
};
