import {useVideoConfig} from 'remotion';

/**
 * Responsive layout for the 9:16 master and the 16:9 cut-down.
 * Scenes position everything through this hook, never with raw numbers,
 * so both formats come out of the same animation code.
 */
export const useLayout = () => {
  const {width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const u = Math.min(W, H) / 1080; // 1 unit = 1px on the 1080 short edge
  return {
    W,
    H,
    vertical,
    u,
    cx: W / 2,
    cy: H / 2,
    // main visual (globe / device) anchor
    stage: vertical ? {x: W / 2, y: H * 0.4, r: 330 * u} : {x: W * 0.3, y: H * 0.52, r: 300 * u},
    // text block anchor
    text: vertical
      ? {x: W / 2, y: H * 0.74, w: W - 160 * u, align: 'center' as const}
      : {x: W * 0.62, y: H * 0.5, w: W * 0.33, align: 'left' as const},
    safe: 80 * u,
  };
};

export type Layout = ReturnType<typeof useLayout>;
