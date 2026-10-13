import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, contact, contactText, copy, fonts, photos} from '../config/brand';
import {NightBackground} from '../components/Background';
import {Globe} from '../components/Globe';
import {InstagramIcon, MailIcon, WebIcon, WhatsAppIcon} from '../components/Icons';
import {InnerLogo} from '../components/Inner';
import {SnowField} from '../components/Particles';
import {PhotoSlot} from '../components/PhotoSlot';
import {SceneIn} from '../components/Transition';
import {KineticText} from '../components/Typography';
import {Wordmark} from '../components/Wordmark';
import {rgba} from '../lib/color';
import {useLayout} from '../lib/layout';
import {clamp, easeInOut, easeOut, springAt} from '../lib/motion';

const ContactCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  verified: boolean;
  start: number;
  width: number;
  u: number;
}> = ({icon, label, value, verified, start, width, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = springAt(frame, fps, start, {damping: 18});
  return (
    <div
      style={{
        width,
        display: 'flex',
        alignItems: 'center',
        gap: 26 * u,
        padding: `${22 * u}px ${30 * u}px`,
        borderRadius: 30 * u,
        background: 'rgba(255,255,255,0.06)',
        border: `${1.5 * u}px solid rgba(255,255,255,0.14)`,
        opacity: s,
        transform: `translateY(${(1 - s) * 60 * u}px)`,
      }}
    >
      <svg width={84 * u} height={84 * u} style={{flex: 'none'}}>
        {icon}
      </svg>
      <div style={{display: 'flex', flexDirection: 'column', gap: 6 * u, minWidth: 0}}>
        <div style={{fontFamily: fonts.sans, fontSize: 24 * u, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.goldLight}}>{label}</div>
        {verified ? (
          <div style={{fontFamily: fonts.sans, fontSize: 44 * u, fontWeight: 500, color: '#fff', letterSpacing: '-0.01em'}}>{value}</div>
        ) : (
          // clearly labelled placeholder — real value pending confirmation
          <div
            style={{
              alignSelf: 'flex-start',
              fontFamily: fonts.sans,
              fontSize: 34 * u,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.75)',
              border: `${2 * u}px dashed rgba(255,255,255,0.45)`,
              borderRadius: 12 * u,
              padding: `${4 * u}px ${16 * u}px`,
            }}
          >
            [{value}]
          </div>
        )}
      </div>
    </div>
  );
};

export const S6CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const u = L.u;
  const V = L.vertical;
  const between = (a: number, b: number, e = easeInOut) => interpolate(t, [a, b], [0, 1], {...clamp, easing: e});

  const gIn = springAt(frame, fps, 0.5, {damping: 22, stiffness: 60});
  const gx = V ? L.W / 2 : L.W * 0.27;
  const gy = (V ? L.H * 0.265 : L.H * 0.5) + Math.sin(t * 1.2) * 8 * u + (1 - gIn) * 200 * u;
  const gScale = (V ? 0.58 : 0.72) * u * (0.85 + 0.15 * gIn);
  const cta = photos.cta;

  const colX = V ? 80 * u : L.W * 0.5;
  const colW = V ? L.W - 160 * u : L.W * 0.44;
  const contactW = V ? L.W - 160 * u : L.W * 0.44;

  return (
    <SceneIn type="iris" originX={L.stage.x} originY={L.H * 0.4}>
      <AbsoluteFill>
        <NightBackground glowX={(gx / L.W) * 100} glowY={(gy / L.H) * 100} />
        <SnowField seed="s6bg" count={120} opacity={0.8} speed={0.5} drift={5} />
        <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
          <defs>
            <radialGradient id="s6-halo">
              <stop offset="0%" stopColor={colors.gold} stopOpacity="0.35" />
              <stop offset="100%" stopColor={colors.gold} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={gx} cy={gy} r={420 * u} fill="url(#s6-halo)" opacity={gIn} />
          {cta ? (
            <PhotoSlot id="s6-photo" photo={cta} x={gx} y={gy + 60 * gScale} w={720 * gScale} h={760 * gScale} shape="circle" reveal={gIn} />
          ) : (
            <Globe
              id="s6-globe"
              x={gx}
              y={gy}
              scale={gScale}
              t={t + 5}
              baseColor={colors.ink}
              plaque="HEYDAY"
              inner={<InnerLogo label="SUA MARCA" />}
              opacity={gIn}
              sheen={interpolate(t, [1.4, 2.6], [0, 1], clamp)}
            />
          )}
        </svg>
        {/* foreground flakes for depth */}
        <SnowField seed="s6fg" count={14} opacity={0.5} speed={0.9} glitterRatio={0.3} />

        <Wordmark
          x={V ? L.W / 2 : L.W * 0.27}
          y={V ? L.H * 0.075 : L.H * 0.1}
          height={(V ? 58 : 50) * u}
          start={0.6}
          color={colors.paper}
          shimmer={interpolate(t, [8.6, 9.8], [0, 1.15], clamp)}
        />

        <div style={{position: 'absolute', left: colX, top: V ? L.H * 0.455 : L.H * 0.1, width: colW}}>
          <KineticText text={copy.s6.headline.replace('. ', '.\n')} start={1.0} size={(V ? 88 : 80) * u} weight={300} color={colors.paper} align={V ? 'center' : 'left'} width={colW} highlight={['criação']} />
          <div style={{height: 18 * u}} />
          <KineticText text={copy.s6.sub} start={1.8} size={(V ? 38 : 34) * u} font="sans" weight={300} color="rgba(255,255,255,0.75)" align={V ? 'center' : 'left'} width={colW} stagger={0.04} />
        </div>

        <div style={{position: 'absolute', left: colX, top: V ? L.H * 0.632 : L.H * 0.4, width: contactW, display: 'flex', flexDirection: 'column', gap: 22 * u}}>
          <ContactCard
            u={u}
            width={contactW}
            start={2.8}
            label={`WhatsApp — ${copy.s6.whatsappLabel}`}
            value={contactText(contact.whatsapp)}
            verified={contact.whatsapp.verified}
            icon={<WhatsAppIcon x={42 * u} y={42 * u} size={80 * u} draw={between(2.9, 3.6)} fill={between(3.3, 3.8)} />}
          />
          <ContactCard
            u={u}
            width={contactW}
            start={3.2}
            label={`E-mail — ${copy.s6.emailLabel}`}
            value={contactText(contact.email)}
            verified={contact.email.verified}
            icon={<MailIcon x={42 * u} y={42 * u} size={76 * u} draw={between(3.3, 4.0)} fill={between(3.7, 4.2)} color={colors.gold} />}
          />
          <div style={{display: 'flex', justifyContent: V ? 'center' : 'flex-start', gap: 50 * u, marginTop: 12 * u}}>
            {[
              {Icon: WebIcon, text: contact.website, s: 3.8},
              {Icon: InstagramIcon, text: contact.instagram, s: 4.0},
            ].map(({Icon, text, s}) => {
              const p = springAt(frame, fps, s);
              return (
                <div key={text} style={{display: 'flex', alignItems: 'center', gap: 14 * u, opacity: p, transform: `translateY(${(1 - p) * 30 * u}px)`}}>
                  <svg width={56 * u} height={56 * u}>
                    <Icon x={28 * u} y={28 * u} size={52 * u} color={colors.paper} draw={between(s, s + 0.7)} />
                  </svg>
                  <span style={{fontFamily: fonts.sans, fontSize: 36 * u, fontWeight: 500, color: colors.paper}}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* closing line */}
        <div style={{position: 'absolute', left: V ? 80 * u : L.W * 0.08, width: V ? L.W - 160 * u : L.W * 0.84, top: V ? L.H * 0.895 : L.H * 0.86}}>
          <div style={{height: 1.5 * u, background: rgba(colors.goldLight, 0.5), width: `${between(5.2, 6.2, easeOut) * 100}%`, margin: V ? '0 auto' : 0, marginBottom: 26 * u}} />
          <KineticText text={copy.s6.closing} start={5.6} size={(V ? 36 : 34) * u} italic weight={300} color={colors.goldLight} align="center" width={V ? L.W - 160 * u : L.W * 0.84} stagger={0.05} />
        </div>
      </AbsoluteFill>
    </SceneIn>
  );
};
