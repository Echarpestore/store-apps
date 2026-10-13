import React from 'react';
import {colors} from '../config/brand';

/**
 * Animated line icons on a 100×100 grid. `draw` (0..1) strokes the outline,
 * `fill` (0..1) brings in the solid version. Every icon is plain SVG so it
 * can be edited or swapped.
 */
type IconProps = {x: number; y: number; size: number; draw?: number; fill?: number; color?: string; bg?: string; opacity?: number};

const stroke = (draw: number, color: string, w = 5) => ({
  fill: 'none',
  stroke: color,
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  pathLength: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1 - draw,
});

const Frame: React.FC<IconProps & {children: React.ReactNode}> = ({x, y, size, opacity = 1, children}) => (
  <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`} opacity={opacity}>
    {children}
  </g>
);

export const WhatsAppIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, fill = 1, color = colors.whatsapp} = p;
  const bubble = 'M 50 12 A 38 38 0 1 1 25.5 79 L 12 88 L 17 72 A 38 38 0 0 1 50 12 Z';
  const phone =
    'M 37 32 C 34 32 31 35 31 39 C 31 52 48 69 61 69 C 65 69 68 66 68 63 L 68 59 L 59 55 L 55 59 C 49 57 43 51 41 45 L 45 41 L 41 32 Z';
  return (
    <Frame {...p}>
      <path d={bubble} fill={color} opacity={fill} />
      <path d={phone} fill="#fff" opacity={fill} />
      <path d={bubble} {...stroke(draw, fill > 0.5 ? '#fff' : color, 4)} opacity={1 - fill * 0.6} />
      <path d={phone} {...stroke(draw, fill > 0.5 ? color : color, 3.5)} opacity={1 - fill} />
    </Frame>
  );
};

export const MailIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, fill = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <rect x={12} y={24} width={76} height={54} rx={8} fill={color} opacity={fill} />
      <path d="M 16 30 L 50 56 L 84 30" {...stroke(Math.min(1, draw * 1.2), fill > 0.5 ? '#fff' : color, 5)} />
      <rect x={12} y={24} width={76} height={54} rx={8} {...stroke(draw, color, 5)} opacity={1 - fill} />
    </Frame>
  );
};

export const WebIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <circle cx={50} cy={50} r={36} {...stroke(draw, color, 5)} />
      <ellipse cx={50} cy={50} rx={15} ry={36} {...stroke(draw, color, 4)} />
      <path d="M 16 38 H 84 M 16 62 H 84" {...stroke(draw, color, 4)} />
    </Frame>
  );
};

export const InstagramIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <rect x={16} y={16} width={68} height={68} rx={20} {...stroke(draw, color, 5)} />
      <circle cx={50} cy={50} r={16} {...stroke(draw, color, 5)} />
      <circle cx={70} cy={30} r={3.5} fill={color} opacity={draw} />
    </Frame>
  );
};

export const CheckIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, fill = 1, color = colors.gold} = p;
  return (
    <Frame {...p}>
      <circle cx={50} cy={50} r={40} fill={color} opacity={fill} />
      <path d="M 31 51 L 45 64 L 70 37" {...stroke(draw, fill > 0.5 ? '#fff' : color, 8)} />
    </Frame>
  );
};

export const PencilIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 22 78 L 26 60 L 66 20 L 80 34 L 40 74 Z M 58 28 L 72 42 M 22 78 L 38 74" {...stroke(draw, color, 5)} />
    </Frame>
  );
};

export const ImageIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <rect x={14} y={20} width={72} height={60} rx={8} {...stroke(draw, color, 5)} />
      <path d="M 14 70 L 38 48 L 54 62 L 66 52 L 86 70" {...stroke(draw, color, 5)} />
      <circle cx={64} cy={36} r={6} {...stroke(draw, color, 4)} />
    </Frame>
  );
};

export const TextIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 20 28 H 80 M 20 44 H 72 M 20 60 H 80 M 20 76 H 56" {...stroke(draw, color, 5)} />
    </Frame>
  );
};

export const BrushIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 78 16 L 46 52 M 46 52 C 34 50 26 58 26 68 C 26 76 20 80 16 82 C 32 88 50 82 52 66 Z" {...stroke(draw, color, 5)} />
    </Frame>
  );
};

export const CubeIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 50 14 L 84 32 L 84 70 L 50 88 L 16 70 L 16 32 Z M 16 32 L 50 50 L 84 32 M 50 50 L 50 88" {...stroke(draw, color, 5)} />
    </Frame>
  );
};

export const HandIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path
        d="M 34 86 C 26 76 18 64 16 54 C 14 46 22 44 26 50 L 32 58 L 32 22 C 32 16 40 16 40 22 L 40 46 L 40 16 C 40 10 48 10 48 16 L 48 46 L 48 20 C 48 14 56 14 56 20 L 56 48 L 56 28 C 56 22 64 22 64 28 L 64 62 C 64 74 58 82 54 86 Z"
        {...stroke(draw, color, 4.5)}
      />
    </Frame>
  );
};

export const SparkleIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 50 12 Q 54 46 88 50 Q 54 54 50 88 Q 46 54 12 50 Q 46 46 50 12 Z" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};

export const BuildingIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 22 86 V 18 H 62 V 86 M 62 40 H 80 V 86 M 14 86 H 88 M 32 30 H 38 M 46 30 H 52 M 32 44 H 38 M 46 44 H 52 M 32 58 H 38 M 46 58 H 52 M 38 86 V 72 H 46 V 86" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};

export const MegaphoneIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 16 42 V 60 H 30 L 70 80 V 22 L 30 42 Z M 30 60 L 36 82 H 46 L 42 62 M 80 40 C 86 46 86 56 80 62" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};

export const StarIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 50 14 L 60 38 L 86 40 L 66 57 L 72 83 L 50 69 L 28 83 L 34 57 L 14 40 L 40 38 Z" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};

export const BoxesIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <path d="M 14 54 H 48 V 86 H 14 Z M 52 54 H 86 V 86 H 52 Z M 33 20 H 67 V 52 H 33 Z M 26 54 V 64 M 64 54 V 64 M 45 20 V 30" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};

export const FlagBRIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <rect x={12} y={24} width={76} height={52} rx={6} {...stroke(draw, color, 4.5)} />
      <path d="M 50 32 L 78 50 L 50 68 L 22 50 Z" {...stroke(draw, color, 4.5)} />
      <circle cx={50} cy={50} r={9} {...stroke(draw, color, 4)} />
    </Frame>
  );
};

export const CalendarIcon: React.FC<IconProps> = (p) => {
  const {draw = 1, color = colors.ink} = p;
  return (
    <Frame {...p}>
      <rect x={16} y={22} width={68} height={62} rx={8} {...stroke(draw, color, 4.5)} />
      <path d="M 16 40 H 84 M 34 14 V 30 M 66 14 V 30 M 30 54 H 38 M 46 54 H 54 M 62 54 H 70 M 30 68 H 38 M 46 68 H 54" {...stroke(draw, color, 4.5)} />
    </Frame>
  );
};
