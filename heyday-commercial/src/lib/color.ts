const parse = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Mix two hex colours, t=0 → a, t=1 → b. Returns rgb(). */
export const mix = (a: string, b: string, t: number) => {
  const A = parse(a);
  const B = parse(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

export const shade = (hex: string, amt: number) => (amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt));

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Interpolate through a list of hex colours with t in [0, list.length-1]. */
export const mixList = (list: string[], t: number) => {
  const i = Math.max(0, Math.min(list.length - 2, Math.floor(t)));
  const f = Math.max(0, Math.min(1, t - i));
  const toHex = (rgb: string) => {
    const m = rgb.match(/\d+/g)!.map(Number);
    return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  return toHex(mix(list[i], list[i + 1], f));
};
