// Fonts are bundled from npm (@fontsource) so renders are fully offline and reproducible.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/fraunces/300.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/300-italic.css';
import '@fontsource/fraunces/400-italic.css';
import {useEffect, useState} from 'react';
import {continueRender, delayRender} from 'remotion';

const FAMILIES = ['300 20px Inter', '400 20px Inter', '500 20px Inter', '600 20px Inter', '300 20px Fraunces', '400 20px Fraunces', 'italic 300 20px Fraunces', 'italic 400 20px Fraunces'];

/** Holds the frame until the bundled fonts are ready (Remotion's recommended per-mount pattern). */
export const useFontsReady = () => {
  const [handle] = useState(() => delayRender('Loading fonts', {timeoutInMilliseconds: 60000}));
  useEffect(() => {
    Promise.all(FAMILIES.map((f) => document.fonts.load(f)))
      .catch(() => undefined)
      .then(() => continueRender(handle));
  }, [handle]);
};
