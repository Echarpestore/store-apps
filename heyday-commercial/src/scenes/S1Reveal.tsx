import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, copy, photos} from '../config/brand';
import {NightBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {InnerLogo} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoGlobe} from '../components/PhotoSlot';
import {Eyebrow, KineticText} from '../components/Typography';
import {Wordmark, wordmarkWidth} from '../components/Wordmark';
import {useLayout} from '../lib/layout';
import {clamp, easeInOut, easeOut, springAt} from '../lib/motion';

/** Points along the globe silhouette (sphere-local coords) for the particle formation. */
const silhouette = (n: number) => {
  const pts: [number, number][] = [];
  const onSphere = Math.round(n * 0.7);
  for (let i = 0; i < onSphere; i++) {
    const a = (i / onSphere) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(a) * 300, Math.sin(a) * 300]);
  }
  const base: [number, number][] = [
    [-232, 268],
    [-268, 384],
    [-220, 412],
    [220, 412],
    [268, 384],
    [232, 268],
  ];
  const rest = n - onSphere;
  for (let i = 0; i < rest; i++) {
    const f = (i / rest) * (base.length - 1);
    const k = Math.floor(f);
    const r = f - k;
    const [ax, ay] = base[k];
    const [bx, by] = base[Math.min(k + 1, base.length - 1)];
    pts.push([ax + (bx - ax) * r, ay + (by - ay) * r]);
  }
  return pts;
};
const PTS = silhouette(170);

export const S1Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;

  const push = interpolate(t, [2.2, 5.6], [1, 1.07], {...clamp, easing: easeInOut});
  const scale = (L.stage.r / 300) * push;
  const gx = L.stage.x;
  const gy = L.stage.y - 50 * u;

  const outline = interpolate(t, [1.5, 2.7], [0, 1], {...clamp, easing: easeInOut});
  const iris = interpolate(t, [2.35, 3.3], [0, 1], {...clamp, easing: easeOut});
  const particlesOut = interpolate(t, [2.2, 3.0], [1, 0], clamp);
  const bgIn = interpolate(t, [0, 1.2], [0, 1], clamp);

  // forming particles
  const forming = PTS.map(([px, py], i) => {
    const sx = random(`s1x${i}`) * L.W;
    const sy = random(`s1y${i}`) * L.H;
    const s = springAt(frame, fps, 0.25 + random(`s1d${i}`) * 0.9, {damping: 20, stiffness: 50});
    const tx = gx + px * scale;
    const ty = gy + py * scale;
    const x = sx + (tx - sx) * s + Math.sin(t * 2 + i) * 6 * u * (1 - s);
    const y = sy + (ty - sy) * s;
    const tw = 0.6 + 0.4 * Math.sin(t * 6 + i * 2.3);
    const r = (2 + random(`s1r${i}`) * 2.5) * u;
    const gold = i % 3 === 0;
    return <circle key={i} cx={x} cy={y} r={r * (gold ? 1.2 : 1)} fill={gold ? colors.goldLight : '#fff'} opacity={tw * particlesOut * Math.min(1, s * 3 + 0.2)} />;
  });

  const hero = photos.hero;
  const irisR = iris * (hero ? 720 : 470) * scale;

  return (
    <AbsoluteFill>
      <NightBackground glowX={(gx / L.W) * 100} glowY={(gy / L.H) * 100} glow={bgIn} />
      <SnowField seed="s1bg" count={110} opacity={0.55 * bgIn} speed={0.6} drift={6} />
      <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <clipPath id="s1-iris">
            <circle cx={gx} cy={gy + 40 * scale} r={irisR} />
          </clipPath>
          <radialGradient id="s1-flare">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* line art drawn after the particles settle */}
        <Globe id="s1-line" x={gx} y={gy} scale={scale} t={t} outline={outline} solid={0} shadow={false} opacity={particlesOut * 0.9 + 0.1 * (1 - iris)} />
        {/* revealed product */}
        <g clipPath="url(#s1-iris)">
          {hero ? (
            <PhotoGlobe id="s1-photo" photo={hero} cx={gx} cy={gy} r={300 * scale} mode="card" reveal={iris} border="rgba(233,211,166,0.45)" drift={push} sheen={interpolate(t, [2.8, 4.2], [0, 1], clamp)} />
          ) : (
            <Globe
              id="s1-globe"
              x={gx}
              y={gy}
              scale={scale}
              t={t}
              baseColor={colors.ink}
              inner={<InnerLogo label="SUA MARCA" />}
              sheen={interpolate(t, [2.8, 4.2], [0, 1], clamp)}
            />
          )}
        </g>
        {forming}
        {/* lens flare on reveal */}
        <ellipse
          cx={gx - 160 * scale + iris * 320 * scale}
          cy={gy - 180 * scale}
          rx={220 * u}
          ry={10 * u}
          fill="url(#s1-flare)"
          opacity={interpolate(t, [2.4, 2.8, 3.6], [0, 0.8, 0], clamp)}
        />
      </svg>

      {/* copy */}
      <div style={{position: 'absolute', left: L.text.x - L.text.w / 2, top: L.vertical ? L.H * 0.71 : L.H * 0.38, width: L.text.w, ...(L.vertical ? {} : {left: L.text.x - 40 * u})}}>
        <KineticText
          text={copy.s1.line1}
          start={0.8}
          exit={2.55}
          size={(L.vertical ? 76 : 70) * u}
          color={colors.paper}
          weight={300}
          align={L.text.align}
          width={L.text.w}
          highlight={['extraordinário']}
        />
      </div>
      <Wordmark
        x={L.vertical ? L.W / 2 : L.text.x - 40 * u + wordmarkWidth(80 * u) / 2}
        y={L.vertical ? L.H * 0.77 : L.H * 0.47}
        height={(L.vertical ? 88 : 80) * u}
        start={3.05}
        color={colors.paper}
        shimmer={interpolate(t, [4.1, 5.2], [0, 1.15], clamp)}
      />
      <div
        style={{
          position: 'absolute',
          left: L.vertical ? 0 : L.text.x - 40 * u,
          width: L.vertical ? L.W : 560 * u,
          top: L.vertical ? L.H * 0.83 : L.H * 0.56,
        }}
      >
        <Eyebrow text={copy.s1.tagline} start={3.7} size={(L.vertical ? 30 : 26) * u} color={colors.goldLight} align={L.vertical ? 'center' : 'left'} />
      </div>
    </AbsoluteFill>
  );
};
