// Browser preview: renders the live Remotion composition (the same React/SVG
// code that produces the MP4) with playback controls and chapter jumps.
import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, PlayerRef} from '@remotion/player';
import '../src/lib/fonts';
import {Commercial} from '../src/Commercial';
import {FPS} from '../src/config/brand';
import {TIMELINE, TOTAL_FRAMES} from '../src/config/timeline';

const CHAPTERS: [keyof typeof TIMELINE, string][] = [
  ['s1', 'Revelação'],
  ['s2', 'O que criamos'],
  ['s3', 'Trajetória'],
  ['s4', 'Como pedir'],
  ['s5', 'Diferenciais'],
  ['s6', 'Contato'],
];

const App: React.FC = () => {
  const ref = useRef<PlayerRef>(null);
  const [vertical, setVertical] = useState(true);
  const w = vertical ? 1080 : 1920;
  const h = vertical ? 1920 : 1080;
  return (
    <div className="wrap">
      <header>
        <h1>HEYDAY — comercial</h1>
        <div className="row">
          <button className={vertical ? 'on' : ''} onClick={() => setVertical(true)}>9:16</button>
          <button className={!vertical ? 'on' : ''} onClick={() => setVertical(false)}>16:9</button>
        </div>
      </header>
      <div className={vertical ? 'stage v' : 'stage h'}>
        <Player
          key={String(vertical)}
          ref={ref}
          component={Commercial}
          durationInFrames={TOTAL_FRAMES}
          fps={FPS}
          compositionWidth={w}
          compositionHeight={h}
          controls
          loop
          showVolumeControls
          allowFullscreen
          clickToPlay
          style={{width: '100%', height: '100%'}}
        />
      </div>
      <nav>
        {CHAPTERS.map(([k, label]) => (
          <button key={k} onClick={() => { ref.current?.seekTo(Math.round(TIMELINE[k].from * FPS)); ref.current?.play(); }}>
            <b>{TIMELINE[k].from}s</b> {label}
          </button>
        ))}
      </nav>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
