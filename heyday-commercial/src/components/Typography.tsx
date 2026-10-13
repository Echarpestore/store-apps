import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../config/brand';
import {clamp, easeIn, easeOut} from '../lib/motion';

/**
 * Word-by-word masked reveal. Words rise out of an invisible slot,
 * de-blur and settle; optional exit lifts them away.
 */
export const KineticText: React.FC<{
  text: string;
  start: number; // seconds (sequence-relative)
  exit?: number; // seconds when the exit starts
  size: number;
  color?: string;
  font?: 'display' | 'sans';
  weight?: number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: number;
  stagger?: number;
  lineHeight?: number;
  letterSpacing?: string;
  uppercase?: boolean;
  highlight?: string[]; // words rendered in the accent colour (italic display)
  style?: React.CSSProperties;
}> = ({
  text,
  start,
  exit,
  size,
  color = colors.ink,
  font = 'display',
  weight = 400,
  italic = false,
  align = 'center',
  width,
  stagger = 0.06,
  lineHeight = 1.12,
  letterSpacing = '-0.01em',
  uppercase = false,
  highlight = [],
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const words = text.replace(/\n/g, ' \n ').split(' ').filter((w) => w !== '');
  return (
    <div
      style={{
        width,
        textAlign: align,
        fontFamily: font === 'display' ? fonts.display : fonts.sans,
        fontWeight: weight,
        fontStyle: italic ? 'italic' : 'normal',
        fontSize: size,
        lineHeight,
        letterSpacing,
        color,
        textTransform: uppercase ? 'uppercase' : 'none',
        fontVariationSettings: font === 'display' ? '"opsz" 144, "SOFT" 50' : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        if (w === '\n') return <br key={i} />;
        const s = start + i * stagger;
        const p = interpolate(t, [s, s + 0.7], [0, 1], {...clamp, easing: easeOut});
        const e = exit !== undefined ? interpolate(t, [exit + i * stagger * 0.5, exit + 0.45 + i * stagger * 0.5], [0, 1], {...clamp, easing: easeIn}) : 0;
        const hl = highlight.includes(w.replace(/[.,!?]/g, ''));
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.08em 0.02em 0.14em', margin: '-0.08em 0 -0.14em'}}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - p) * 105 - e * 60}%)`,
                opacity: Math.min(p * 1.4, 1) * (1 - e),
                filter: `blur(${(1 - p) * 8 + e * 6}px)`,
                color: hl ? colors.gold : undefined,
                fontStyle: hl && font === 'display' ? 'italic' : undefined,
              }}
            >
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Small uppercase label that slides in with a hairline rule. */
export const Eyebrow: React.FC<{text: string; start: number; exit?: number; size: number; color?: string; align?: 'left' | 'center'; rule?: boolean}> = ({
  text,
  start,
  exit,
  size,
  color = colors.gold,
  align = 'center',
  rule = true,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const p = interpolate(t, [start, start + 0.8], [0, 1], {...clamp, easing: easeOut});
  const e = exit !== undefined ? interpolate(t, [exit, exit + 0.4], [0, 1], clamp) : 0;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: size * 0.8, justifyContent: align === 'center' ? 'center' : 'flex-start', opacity: p * (1 - e)}}>
      {rule && <div style={{width: size * 3 * p, height: Math.max(1, size * 0.08), background: color}} />}
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 600,
          fontSize: size,
          letterSpacing: `${0.28 + (1 - p) * 0.3}em`,
          textTransform: 'uppercase',
          color,
          transform: `translateX(${(1 - p) * 20}px)`,
        }}
      >
        {text}
      </div>
      {rule && align === 'center' && <div style={{width: size * 3 * p, height: Math.max(1, size * 0.08), background: color}} />}
    </div>
  );
};
