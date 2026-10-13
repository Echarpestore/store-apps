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
import {continueRender, delayRender} from 'remotion';

if (typeof document !== 'undefined') {
  const handle = delayRender('Loading fonts', {timeoutInMilliseconds: 60000});
  const families = ['300 20px Inter', '400 20px Inter', '600 20px Inter', '300 20px Fraunces', '400 20px Fraunces', 'italic 400 20px Fraunces'];
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      continueRender(handle);
    }
  };
  // document.fonts.ready can stall in a busy headless tab; the explicit loads are what matter.
  Promise.all(families.map((f) => document.fonts.load(f))).then(finish, finish);
  setTimeout(finish, 20000);
}
