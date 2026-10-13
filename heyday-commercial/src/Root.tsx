import React from 'react';
import {Composition} from 'remotion';
import './lib/fonts';
import {FPS} from './config/brand';
import {TOTAL_FRAMES} from './config/timeline';
import {Commercial} from './Commercial';
import {LuxuryFilm} from './luxury/LuxuryFilm';
import {LUX} from './luxury/timeline';
import {BrandsFilm} from './brands/BrandsFilm';
import {BR} from './brands/timeline';

export const RemotionRoot: React.FC = () => (
  <>
    {/* Master: 9:16 for Reels, Stories, WhatsApp Status */}
    <Composition id="HeydayVertical" component={Commercial} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
    {/* Cut-down: 16:9 for LinkedIn, YouTube, presentations */}
    <Composition id="HeydayHorizontal" component={Commercial} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    {/* Second film: "Presentes que ficam" — luxury brand film */}
    <Composition id="HeydayLuxuryVertical" component={LuxuryFilm} durationInFrames={Math.round(LUX.total * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="HeydayLuxuryHorizontal" component={LuxuryFilm} durationInFrames={Math.round(LUX.total * FPS)} fps={FPS} width={1920} height={1080} />
    {/* Third film: "A próxima pode ser a sua marca" — the big brands */}
    <Composition id="HeydayBrandsVertical" component={BrandsFilm} durationInFrames={Math.round(BR.total * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="HeydayBrandsHorizontal" component={BrandsFilm} durationInFrames={Math.round(BR.total * FPS)} fps={FPS} width={1920} height={1080} />
  </>
);
