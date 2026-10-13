import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, copy, fonts, photos} from '../config/brand';
import {PaperBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {
  BrushIcon,
  CheckIcon,
  CubeIcon,
  HandIcon,
  ImageIcon,
  MailIcon,
  PencilIcon,
  SparkleIcon,
  TextIcon,
  WhatsAppIcon,
} from '../components/Icons';
import {InnerLogo} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {Bubble, ChatHeader, Phone, PHONE_W} from '../components/Phone';
import {PhotoGlobe} from '../components/PhotoSlot';
import {SceneIn} from '../components/Transition';
import {KineticText} from '../components/Typography';
import {mix, mixList, rgba} from '../lib/color';
import {useLayout} from '../lib/layout';
import {clamp, easeIn, easeInOut, easeOut, lerp, springAt} from '../lib/motion';

const B = 0.4; // first step starts after the entrance wipe
const STEP = [B, B + 3.2, B + 6.4, B + 9.6, B + 12.8, B + 16.2];

const sans = '"Inter", sans-serif';

/** Hand-drawn looking globe sketch (sphere-local coords). */
const sketchPath = (() => {
  const pts: string[] = [];
  const n = 48;
  for (let i = 0; i <= n + 3; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 300 + Math.sin(i * 1.7) * 6 + (random(`sk${i}`) - 0.5) * 10 + (i > n ? 16 : 0);
    pts.push(`${i === 0 ? 'M' : 'L'} ${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
})();
const sketchBase = 'M -236 262 L -272 390 Q -268 414 -222 412 L 224 414 Q 266 410 270 386 L 230 264 M -226 236 L 228 230';

export const S4Process: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const V = L.vertical;

  const between = (a: number, b: number, e = easeInOut) => interpolate(t, [a, b], [0, 1], {...clamp, easing: e});

  // ------------------------------------------------------------------ phone
  const stageX = L.stage.x;
  const stageY = V ? L.H * 0.47 : L.H * 0.54;
  const phoneIn = springAt(frame, fps, B + 0.05, {damping: 20, stiffness: 70});
  const toCorner = between(STEP[2] + 0.1, STEP[2] + 0.9);
  const phoneOut = between(STEP[3] - 0.1, STEP[3] + 0.4, easeIn);
  const phoneScaleBase = (V ? 0.92 : 0.78) * u;
  const cornerX = V ? L.W * 0.79 : L.W * 0.47;
  const cornerY = V ? L.H * 0.6 : L.H * 0.62;
  const phoneX = lerp(stageX, cornerX, toCorner);
  const phoneY = lerp(stageY + (1 - phoneIn) * 900 * u, cornerY, toCorner) + phoneOut * 600 * u;
  const phoneScale = lerp(phoneScaleBase, 0.44 * u, toCorner);
  const phoneRot = lerp(-8 * (1 - phoneIn) - 2, 4, toCorner);

  const pop = (s: number) => springAt(frame, fps, s, {damping: 14, stiffness: 140});

  // chat content timings
  const m1 = pop(STEP[0] + 1.1);
  const typing = t > STEP[0] + 1.9 && t < STEP[0] + 2.5;
  const m2 = pop(STEP[0] + 2.5);
  const m3 = pop(STEP[1] + 1.95);
  const m4 = pop(STEP[2] + 1.95);
  const approved = between(STEP[2] + 2.55, STEP[2] + 2.85);

  const screen = (
    <g>
      <ChatHeader title="HEYDAY" subtitle={typing ? 'digitando…' : 'online'} />
      <Bubble x={PHONE_W - 300} y={150} w={276} h={96} side="right" p={m1}>
        <text x={PHONE_W - 284} y={186} fontFamily={sans} fontSize={18} fill={colors.ink}>
          Olá! Queremos um globo
        </text>
        <text x={PHONE_W - 284} y={212} fontFamily={sans} fontSize={18} fill={colors.ink}>
          de neve com a nossa marca.
        </text>
        <text x={PHONE_W - 40} y={236} fontFamily={sans} fontSize={12} fill={colors.muted}>
          09:41
        </text>
      </Bubble>
      {typing && (
        <g>
          <rect x={22} y={262} width={86} height={46} rx={18} fill="#fff" />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={46 + i * 18} cy={285} r={5} fill={colors.muted} opacity={0.4 + 0.6 * Math.abs(Math.sin(t * 8 + i))} />
          ))}
        </g>
      )}
      <Bubble x={22} y={262} w={232} h={58} side="left" p={m2}>
        <text x={40} y={298} fontFamily={sans} fontSize={18} fill={colors.ink}>
          Claro! Conte sua ideia.
        </text>
      </Bubble>
      <Bubble x={PHONE_W - 300} y={338} w={276} h={176} side="right" p={m3}>
        {[0, 1, 2, 3].map((i) => {
          const x = PHONE_W - 288 + (i % 2) * 128;
          const y = 350 + Math.floor(i / 2) * 64;
          return <rect key={i} x={x} y={y} width={120} height={56} rx={10} fill="#fff" />;
        })}
        <circle cx={PHONE_W - 228} cy={378} r={14} fill="none" stroke={colors.iceDeep} strokeWidth={5} />
        <g transform={`translate(${PHONE_W - 160 + 60} 378) scale(0.42) translate(-50 -50)`}>
          <path d="M 14 70 L 38 48 L 54 62 L 66 52 L 86 70" fill="none" stroke={colors.ink} strokeWidth={6} />
        </g>
        <path d={`M ${PHONE_W - 270} 450 q 20 -24 40 0 t 40 0`} fill="none" stroke={colors.gold} strokeWidth={4} />
        <text x={PHONE_W - 100} y={450} textAnchor="middle" fontFamily={sans} fontSize={15} fontWeight={600} fill={colors.ink}>
          ideia.txt
        </text>
        <text x={PHONE_W - 284} y={500} fontFamily={sans} fontSize={17} fill={colors.ink}>
          Segue nossa ideia!
        </text>
      </Bubble>
      <Bubble x={22} y={532} w={250} h={208} side="left" p={m4}>
        <rect x={34} y={544} width={226} height={128} rx={12} fill={mix(colors.ice, '#fff', 0.5)} />
        <Globe id="s4-mini" x={147} y={600} scale={0.14} t={t} baseColor={colors.ink} inner={<InnerLogo />} shadow={false} />
        <text x={40} y={694} fontFamily={sans} fontSize={15} fontWeight={600} fill={colors.ink}>
          Proposta visual
        </text>
        <rect x={150} y={700} width={110} height={32} rx={16} fill={approved > 0.5 ? colors.whatsapp : colors.ink} />
        <text x={205} y={721} textAnchor="middle" fontFamily={sans} fontSize={14} fontWeight={600} fill="#fff">
          {approved > 0.5 ? 'Aprovado ✓' : 'Aprovar'}
        </text>
      </Bubble>
    </g>
  );

  // ------------------------------------------------- step 1: channel icons
  const icons1 = between(STEP[0] + 0.5, STEP[0] + 1.3, easeOut);
  const icons1Out = between(STEP[1] - 0.2, STEP[1] + 0.3, easeIn);
  const bob = Math.sin(t * 2) * 8 * u;
  const iconOffset = (V ? 330 : 300) * u;

  // ------------------------------------------------ step 2: attachments
  const chips = [
    {label: 'Logotipo', Icon: CubeIcon, dx: -1, dy: -0.95},
    {label: 'Fotografia', Icon: ImageIcon, dx: 1, dy: -0.6},
    {label: 'Esboço', Icon: PencilIcon, dx: -1.05, dy: 0.05},
    {label: 'Referência', Icon: SparkleIcon, dx: 1.05, dy: 0.35},
    {label: 'Só um texto', Icon: TextIcon, dx: -0.95, dy: 0.95},
  ];
  const fly = between(STEP[1] + 1.55, STEP[1] + 2.05, easeIn);
  const no3d = pop(STEP[1] + 2.2);
  const no3dOut = between(STEP[2] - 0.3, STEP[2], easeIn);

  // ---------------------------------------------- step 3: design board
  const boardIn = springAt(frame, fps, STEP[2] + 0.2, {damping: 20});
  const boardOut = between(STEP[3] - 0.1, STEP[3] + 0.5);
  const sketch = between(STEP[2] + 0.4, STEP[2] + 1.3);
  const guides = between(STEP[2] + 1.0, STEP[2] + 1.6);
  const render = between(STEP[2] + 1.5, STEP[2] + 2.2);
  const boardS = (V ? 640 : 560) * u;

  // ------------------------------------------ step 4/5: production → product
  const stages = [
    {label: 'Modelagem', Icon: CubeIcon},
    {label: 'Pintura à mão', Icon: BrushIcon},
    {label: 'Montagem', Icon: HandIcon},
    {label: 'Acabamento', Icon: SparkleIcon},
  ];
  const ringStart = STEP[3] + 0.3;
  const ringP = between(ringStart, STEP[4] - 0.2, (x) => x);
  const ringIn = between(STEP[3] + 0.2, STEP[3] + 0.8, easeOut);
  const ringOut = between(STEP[4], STEP[4] + 0.5, easeIn);
  const st = (k: number) => interpolate(ringP, [k / 4, k / 4 + 0.18], [0, 1], clamp);
  const gOutline = st(0);
  const gSolid = interpolate(ringP, [0.12, 0.25], [0, 1], clamp);
  const gPaint = st(1);
  const gLiquid = st(2);
  const gSnow = st(3);
  const hero = between(STEP[4], STEP[4] + 1.0);
  const shake = interpolate(t, [STEP[4] + 0.6, STEP[4] + 0.8, STEP[4] + 1.0, STEP[4] + 1.2, STEP[4] + 1.4], [0, -5, 4, -2, 0], clamp);
  const swirl = interpolate(t, [STEP[4] + 0.7, STEP[4] + 1.2, STEP[4] + 3.4], [0, 1, 0.1], clamp);
  const showGlobe4 = t > STEP[3] - 0.2;
  const g4Scale = lerp((V ? 0.82 : 0.66) * u, (V ? 1.02 : 0.82) * u, hero);
  const g4Y = lerp(stageY - 30 * u, stageY - 60 * u, hero) + Math.sin(t * 1.4) * 6 * u * hero;
  const ringR = (V ? 410 : 360) * u;
  const productPhoto = photos.process;
  // after the shake, the produced globe hands over to a real finished piece
  const photoIn = productPhoto ? between(STEP[4] + 1.3, STEP[4] + 2.1) : 0;

  // ------------------------------------------------------ progress header
  const prog = interpolate(t, [STEP[0], STEP[5] - 0.6], [0, 1], clamp);
  const headerIn = between(0.3, 1.0, easeOut);
  const px0 = V ? L.W * 0.16 : L.W * 0.06;
  const px1 = V ? L.W * 0.84 : L.W * 0.36;
  const py = V ? L.H * 0.065 : L.H * 0.09;

  return (
    <SceneIn type="slide">
      <AbsoluteFill>
        <PaperBackground tint={colors.ice} />
        <SnowField seed="s4bg" count={26} color={colors.ice} glitterColor={colors.gold} opacity={0.45} speed={0.35} drift={8} />

        <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
          {/* progress indicator */}
          <g opacity={headerIn}>
            <line x1={px0} y1={py} x2={px1} y2={py} stroke={rgba(colors.ink, 0.12)} strokeWidth={3 * u} strokeLinecap="round" />
            <line x1={px0} y1={py} x2={lerp(px0, px1, prog)} y2={py} stroke={colors.gold} strokeWidth={3 * u} strokeLinecap="round" />
            {copy.s4.steps.map((s, i) => {
              const x = lerp(px0, px1, i / 4);
              const on = t >= STEP[i];
              const a = springAt(frame, fps, STEP[i]);
              return (
                <g key={i}>
                  <circle cx={x} cy={py} r={(on ? 22 + 4 * a : 18) * u} fill={on ? colors.gold : colors.paper} stroke={on ? colors.gold : rgba(colors.ink, 0.2)} strokeWidth={2 * u} />
                  <text x={x} y={py + 7 * u} textAnchor="middle" fontFamily={sans} fontWeight={600} fontSize={18 * u} fill={on ? '#fff' : rgba(colors.ink, 0.45)}>
                    {s.n}
                  </text>
                </g>
              );
            })}
          </g>

          {/* step 3 — design board */}
          {t > STEP[2] && t < STEP[3] + 0.6 && (
            <g transform={`translate(${stageX} ${stageY - 20 * u}) scale(${(0.85 + 0.15 * boardIn) * (1 - boardOut * 0.2)})`} opacity={Math.min(1, boardIn * 1.5) * (1 - boardOut)}>
              <defs>
                <pattern id="s4-dots" width={28 * u} height={28 * u} patternUnits="userSpaceOnUse">
                  <circle cx={2 * u} cy={2 * u} r={1.6 * u} fill={rgba(colors.ink, 0.14)} />
                </pattern>
                <clipPath id="s4-wipe">
                  {/* sphere-local units (inside the scaled group) */}
                  <rect x={-330} y={-470} width={660 * render} height={960} />
                </clipPath>
              </defs>
              <rect x={-boardS / 2 + 10 * u} y={-boardS / 2 + 24 * u} width={boardS} height={boardS} rx={32 * u} fill={rgba(colors.ink, 0.06)} />
              <rect x={-boardS / 2} y={-boardS / 2} width={boardS} height={boardS} rx={32 * u} fill="#fff" />
              <rect x={-boardS / 2} y={-boardS / 2} width={boardS} height={boardS} rx={32 * u} fill="url(#s4-dots)" />
              <text x={-boardS / 2 + 32 * u} y={-boardS / 2 + 50 * u} fontFamily={sans} fontWeight={600} fontSize={20 * u} letterSpacing={3 * u} fill={rgba(colors.ink, 0.5)}>
                PROPOSTA VISUAL · V1
              </text>
              <g transform={`translate(0 ${-40 * u}) scale(${0.62 * u})`}>
                {/* construction guides */}
                <g opacity={guides * (1 - render * 0.7)} stroke={colors.iceDeep} strokeWidth={2} fill="none" strokeDasharray="8 8">
                  <circle cx={0} cy={0} r={300 * guides} />
                  <line x1={-380} y1={0} x2={380} y2={0} />
                  <line x1={0} y1={-380} x2={0} y2={460} />
                  <line x1={-300} y1={-300} x2={300} y2={300} opacity={0.5} />
                </g>
                {[
                  [0, -300],
                  [300, 0],
                  [-300, 0],
                  [-270, 390],
                  [270, 390],
                ].map(([hx, hy], i) => (
                  <g key={i} opacity={guides * (1 - render)}>
                    <rect x={hx - 9} y={hy - 9} width={18} height={18} fill="#fff" stroke={colors.iceDeep} strokeWidth={3} />
                    <line x1={hx - 70} y1={hy} x2={hx + 70} y2={hy} stroke={colors.iceDeep} strokeWidth={2} opacity={i < 3 ? 1 : 0} />
                  </g>
                ))}
                {/* sketch */}
                <g fill="none" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" opacity={1 - render * 0.8}>
                  <path d={sketchPath} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sketch} />
                  <path d={sketchBase} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sketch} />
                  <path d="M -96 170 L -86 -30 L 86 -30 L 96 170" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sketch} />
                </g>
                {/* polished render wipes in */}
                <g clipPath="url(#s4-wipe)">
                  <Globe id="s4-board" x={0} y={0} scale={1} t={t} baseColor={colors.ink} plaque="SUA MARCA" inner={<InnerLogo />} shadow={false} />
                </g>
                <line x1={-330 + 660 * render} y1={-420} x2={-330 + 660 * render} y2={460} stroke={colors.gold} strokeWidth={4} opacity={render > 0 && render < 1 ? 1 : 0} />
              </g>
            </g>
          )}

          {/* step 4/5 — production ring + product */}
          {showGlobe4 && (
            <g>
              <g opacity={ringIn * (1 - ringOut)}>
                <circle cx={stageX} cy={g4Y + 40 * u} r={ringR} fill="none" stroke={rgba(colors.ink, 0.08)} strokeWidth={4 * u} />
                <circle
                  cx={stageX}
                  cy={g4Y + 40 * u}
                  r={ringR}
                  fill="none"
                  stroke={colors.gold}
                  strokeWidth={4 * u}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - ringP}
                  transform={`rotate(-135 ${stageX} ${g4Y + 40 * u})`}
                />
                {stages.map((s, k) => {
                  const ang = ((-135 + k * 90) * Math.PI) / 180;
                  const ix = stageX + Math.cos(ang) * ringR;
                  const iy = g4Y + 40 * u + Math.sin(ang) * ringR;
                  const on = st(k);
                  const below = k === 2 || k === 3;
                  return (
                    <g key={k}>
                      <circle cx={ix} cy={iy} r={(50 + 6 * on) * u} fill={on > 0.5 ? colors.gold : '#fff'} stroke={colors.gold} strokeWidth={2 * u} />
                      <s.Icon x={ix} y={iy} size={56 * u} color={on > 0.5 ? '#fff' : colors.ink} draw={Math.max(0.35, on)} />
                      <text
                        x={ix}
                        y={iy + (below ? 92 : -74) * u}
                        textAnchor="middle"
                        fontFamily={sans}
                        fontWeight={600}
                        fontSize={24 * u}
                        fill={colors.ink}
                        opacity={0.35 + 0.65 * on}
                      >
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </g>
              {/* glow behind the hero */}
              <circle cx={stageX} cy={g4Y} r={480 * u} fill="url(#s4-glow)" opacity={hero} />
              <defs>
                <radialGradient id="s4-glow">
                  <stop offset="0%" stopColor={colors.goldLight} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={colors.goldLight} stopOpacity="0" />
                </radialGradient>
              </defs>
              <Globe
                id="s4-prod"
                x={stageX}
                y={g4Y}
                scale={g4Scale}
                rotate={shake}
                t={t}
                swirl={swirl}
                baseColor={mixList(['#C9C6C0', colors.ink], gPaint)}
                plaque={gPaint > 0.6 ? 'SUA MARCA' : undefined}
                inner={<InnerLogo draw={Math.max(gOutline, 0.001)} fill={gPaint} />}
                outline={gOutline}
                solid={gSolid}
                liquid={gLiquid}
                snow={gSnow}
                sheen={interpolate(t, [STEP[4] + 1.6, STEP[4] + 2.8], [0, 1], clamp)}
                opacity={1 - photoIn}
              />
              {productPhoto && (
                <PhotoGlobe id="s4-photo" photo={productPhoto} cx={stageX} cy={g4Y} r={300 * g4Scale} mode="feather" featherR={1.45} featherY={0.3} reveal={photoIn} opacity={photoIn} sheen={interpolate(t, [STEP[4] + 2.2, STEP[4] + 3.3], [0, 1], clamp)} />
              )}
              {/* glints */}
              {[
                [-0.62, -0.55, 0],
                [0.7, -0.2, 0.4],
                [0.45, 0.62, 0.8],
              ].map(([gx, gy, d], i) => {
                const k = interpolate(t, [STEP[4] + 1.8 + d, STEP[4] + 2.2 + d, STEP[4] + 2.7 + d], [0, 1, 0], clamp);
                const r = 300 * g4Scale;
                const x = stageX + gx * r;
                const y = g4Y + gy * r;
                const s = 34 * u * k;
                return (
                  <path key={i} d={`M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`} fill="#fff" opacity={k} />
                );
              })}
            </g>
          )}

          {/* phone (steps 1–3) */}
          {t < STEP[3] + 0.5 && (
            <Phone id="s4-phone" x={phoneX} y={phoneY} scale={phoneScale} rotate={phoneRot} opacity={Math.min(1, phoneIn * 2) * (1 - phoneOut)}>
              {screen}
            </Phone>
          )}

          {/* step 1 — WhatsApp + e-mail */}
          {t < STEP[1] + 0.4 && (
            <g opacity={icons1 * (1 - icons1Out)}>
              <g transform={`translate(${stageX - iconOffset} ${stageY - 120 * u + bob}) scale(${0.6 + 0.4 * icons1})`}>
                <circle r={84 * u} fill="#fff" />
                <WhatsAppIcon x={0} y={0} size={110 * u} draw={icons1} fill={between(STEP[0] + 0.9, STEP[0] + 1.4)} />
                <text y={124 * u} textAnchor="middle" fontFamily={sans} fontWeight={600} fontSize={26 * u} fill={colors.ink}>
                  WhatsApp
                </text>
              </g>
              <g transform={`translate(${stageX + iconOffset} ${stageY + 80 * u - bob}) scale(${0.6 + 0.4 * icons1})`}>
                <circle r={84 * u} fill="#fff" />
                <MailIcon x={0} y={0} size={100 * u} draw={icons1} fill={between(STEP[0] + 1.0, STEP[0] + 1.5)} color={colors.ink} />
                <text y={124 * u} textAnchor="middle" fontFamily={sans} fontWeight={600} fontSize={26 * u} fill={colors.ink}>
                  E-mail
                </text>
              </g>
            </g>
          )}

          {/* step 2 — attachment chips */}
          {t > STEP[1] && t < STEP[2] && (
            <g>
              {chips.map((c, i) => {
                const s = springAt(frame, fps, STEP[1] + 0.25 + i * 0.16, {damping: 14});
                const cw = 250 * u;
                const ch = 86 * u;
                const ox = stageX + c.dx * (V ? 300 : 330) * u;
                const oy = stageY + c.dy * 300 * u;
                const tx = phoneX + 60 * u;
                const ty = phoneY + 20 * u;
                const x = lerp(ox, tx, fly);
                const y = lerp(oy, ty, fly);
                const sc = (0.5 + 0.5 * s) * (1 - fly * 0.7);
                return (
                  <g key={i} transform={`translate(${x} ${y}) scale(${sc}) rotate(${(1 - s) * (i % 2 ? 12 : -12)})`} opacity={Math.min(1, s * 1.5) * (1 - fly)}>
                    <rect x={-cw / 2} y={-ch / 2 + 8 * u} width={cw} height={ch} rx={22 * u} fill={rgba(colors.ink, 0.08)} />
                    <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={22 * u} fill="#fff" />
                    <circle cx={-cw / 2 + 44 * u} cy={0} r={28 * u} fill={mix(colors.goldLight, '#fff', 0.4)} />
                    <c.Icon x={-cw / 2 + 44 * u} y={0} size={40 * u} color={colors.ink} draw={s} />
                    <text x={-cw / 2 + 86 * u} y={9 * u} fontFamily={sans} fontWeight={600} fontSize={26 * u} fill={colors.ink}>
                      {c.label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {/* step 2 badge: no 3D needed */}
        {t > STEP[1] + 1.8 && t < STEP[2] && (
          <div
            style={{
              position: 'absolute',
              left: V ? 0 : L.W * 0.08,
              width: V ? L.W : L.W * 0.44,
              top: V ? L.H * 0.665 : L.H * 0.86,
              display: 'flex',
              justifyContent: 'center',
              opacity: no3d * (1 - no3dOut),
              transform: `scale(${0.8 + 0.2 * no3d})`,
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 14 * u, background: colors.ink, color: '#fff', padding: `${14 * u}px ${28 * u}px ${14 * u}px ${16 * u}px`, borderRadius: 999, fontFamily: fonts.sans, fontSize: 28 * u, fontWeight: 500}}>
              <svg width={40 * u} height={40 * u}>
                <CheckIcon x={20 * u} y={20 * u} size={40 * u} draw={no3d} />
              </svg>
              {copy.s4.no3d}
            </div>
          </div>
        )}

        {/* step 3 approval check */}
        {t > STEP[2] + 2.5 && t < STEP[3] && (
          <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
            <CheckIcon
              x={cornerX - 150 * u}
              y={cornerY - 180 * u}
              size={110 * u * springAt(frame, fps, STEP[2] + 2.6, {damping: 10})}
              draw={between(STEP[2] + 2.7, STEP[2] + 3.0)}
              color={colors.whatsapp}
              opacity={1 - between(STEP[3] - 0.25, STEP[3])}
            />
          </svg>
        )}

        {/* step titles */}
        {copy.s4.steps.map((s, i) => {
          const start = STEP[i] + 0.15;
          const exit = i < 4 ? STEP[i + 1] - 0.3 : undefined;
          return (
            <div
              key={s.n}
              style={{
                position: 'absolute',
                left: V ? 0 : L.W * 0.57,
                width: V ? L.W : L.W * 0.38,
                top: V ? L.H * 0.1 : L.H * 0.3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: V ? 'center' : 'flex-start',
                gap: 6 * u,
              }}
            >
              <KineticText text={`Passo ${s.n}`} start={start} exit={exit} size={24 * u} font="sans" weight={600} letterSpacing="0.3em" uppercase color={colors.gold} align={V ? 'center' : 'left'} />
              <KineticText text={s.title} start={start + 0.1} exit={exit} size={(V ? 54 : 50) * u} weight={400} align={V ? 'center' : 'left'} />
            </div>
          );
        })}
        {/* step copy */}
        {copy.s4.steps.map((s, i) => {
          const start = STEP[i] + 0.45;
          const exit = i < 4 ? STEP[i + 1] - 0.35 : undefined;
          return (
            <div
              key={s.n + 'c'}
              style={{position: 'absolute', left: V ? 80 * u : L.W * 0.57, width: V ? L.W - 160 * u : L.W * 0.36, top: V ? L.H * 0.765 : L.H * 0.5}}
            >
              <KineticText
                text={s.text}
                start={start}
                exit={exit}
                size={(V ? 60 : 54) * u}
                weight={300}
                align={V ? 'center' : 'left'}
                width={V ? L.W - 160 * u : L.W * 0.36}
                highlight={['WhatsApp', 'e-mail', 'logotipo', 'referência', 'proposta', 'visual', 'vida', 'inesquecível']}
              />
            </div>
          );
        })}
        {/* handmade caption during production */}
        <div style={{position: 'absolute', left: V ? 0 : L.W * 0.57, width: V ? L.W : undefined, top: V ? L.H * 0.9 : L.H * 0.75, textAlign: V ? 'center' : 'left', fontFamily: fonts.sans, fontSize: 26 * u, letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 600, color: colors.muted, opacity: between(STEP[3] + 0.8, STEP[3] + 1.3) * (1 - between(STEP[4] - 0.3, STEP[4]))}}>
          Feito à mão · no Brasil
        </div>
      </AbsoluteFill>
    </SceneIn>
  );
};
