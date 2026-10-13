import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {colors} from './config/brand';
import {OVERLAP, sec, TIMELINE} from './config/timeline';
import {S1Reveal} from './scenes/S1Reveal';
import {S2Create} from './scenes/S2Create';
import {S3Trust} from './scenes/S3Trust';
import {S4Process} from './scenes/S4Process';
import {S5Special} from './scenes/S5Special';
import {S6CTA} from './scenes/S6CTA';

type SceneKey = keyof typeof TIMELINE;

const SCENES: {key: SceneKey; Comp: React.FC}[] = [
  {key: 's1', Comp: S1Reveal},
  {key: 's2', Comp: S2Create},
  {key: 's3', Comp: S3Trust},
  {key: 's4', Comp: S4Process},
  {key: 's5', Comp: S5Special},
  {key: 's6', Comp: S6CTA},
];

export const Commercial: React.FC<{music?: boolean}> = ({music = true}) => (
  <AbsoluteFill style={{background: colors.night}}>
    {SCENES.map(({key, Comp}, i) => {
      const T = TIMELINE[key];
      const from = i === 0 ? 0 : T.from - OVERLAP;
      const dur = (i === 0 ? T.dur : T.dur + OVERLAP) + (i === SCENES.length - 1 ? 0 : OVERLAP);
      return (
        <Sequence key={key} name={key.toUpperCase()} from={sec(from)} durationInFrames={sec(dur)}>
          <Comp />
        </Sequence>
      );
    })}
    {music && <Audio src={staticFile('audio/heyday-score.wav')} />}
  </AbsoluteFill>
);
