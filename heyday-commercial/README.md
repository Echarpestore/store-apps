# HEYDAY — motion graphics commercial

A 55-second commercial in Brazilian Portuguese for HEYDAY (custom snow globes, Joinville/SC). It is built entirely in code: React + SVG compositions rendered by [Remotion](https://www.remotion.dev/), with an original synthesised score.

| Deliverable | Path |
|---|---|
| 9:16 master, 1080×1920, 60 fps, H.264/AAC | `out/heyday-vertical-1080x1920.mp4` |
| 16:9 version, 1920×1080, 60 fps | `out/heyday-horizontal-1920x1080.mp4` |
| Browser preview (live composition + controls + chapters) | `preview/` → `npm run preview` |
| Storyboard / timeline | `docs/STORYBOARD.md` |
| Research, what was verified, what is missing | `docs/RESEARCH.md` |
| Asset manifest + photo/logo slots | `docs/ASSET_MANIFEST.md` |

> **Read `docs/RESEARCH.md` before publishing.** The build environment could not open heyday.com.br or Instagram, so HEYDAY supplied the official logo, the product photos and the confirmed list of 10 clients directly. Fairmont is still shown as a name until its logo file is added. Each of these is one config change away from the real asset. WhatsApp and e-mail were confirmed by the client and appear in the final scene.

## Second film: "Presentes que ficam" (luxury)

A 34-second brand film about why a HEYDAY globe is a gift people never forget: black and gold, one slow continuous camera move, ordinary giveaways turning to dust, the globe shaken back to life, then the real work. Storyboard: `docs/STORYBOARD-LUXURY.md`.

| Deliverable | Path |
|---|---|
| 9:16, 1080×1920, 60 fps | `out/heyday-luxury-vertical-1080x1920.mp4` |
| 16:9, 1920×1080, 60 fps | `out/heyday-luxury-horizontal-1920x1080.mp4` |

`npm run render:luxury` renders both · copy and beat times in `src/luxury/timeline.ts` · score: `npm run music:luxury`.

## Quick start

```bash
cd heyday-commercial
npm install
npm run studio            # Remotion Studio: timeline, scrubbing, every scene, both formats
npm run preview           # standalone player at http://localhost:4173
npm run render:all        # renders both MP4s into out/
```

Rendering needs Chrome Headless Shell (Remotion downloads it automatically) or an existing one passed with `--browser-executable=/path/to/headless_shell`. ffmpeg ships with Remotion. A 60 fps vertical render takes about 15–20 min on 4 CPU cores.

## Changing things without touching the animation

Everything editable is in **`src/config/brand.ts`**:

| To change | Edit |
|---|---|
| WhatsApp / e-mail | `contact.whatsapp` / `contact.email` (`verified: false` shows a labelled placeholder instead) |
| Any on-screen text | `copy` |
| Colours | `colors` |
| Official logo | put the file in `public/brand/`, set `officialLogo` |
| Real product photos | put files in `public/photos/`, fill `photos.hero / montage / process / beauty / cta`. Each slot replaces the SVG illustration in that scene, masked and animated the same way |
| Client brands | put logos in `public/logos/`, add `{name, logo, evidence, project?}` to `clients`. Scene 3 switches to the logo grid by itself. Only add brands with a verified HEYDAY project |
| Frame rate | `FPS` |
| Scene durations | `src/config/timeline.ts` |
| Music | `tools/make_music.py` (hit points listed at the top), then `npm run music` |

After any change: `npm run typecheck`, check in the Studio, then `npm run render:all`. `npm run stills` renders a contact sheet of key frames into `out/stills/`.

## Structure

```
src/
  config/brand.ts        copy, contact, colours, photo & client slots  ← edit here
  config/timeline.ts     scene timing
  Commercial.tsx         scene sequencing with overlapping transitions + music
  Root.tsx               HeydayVertical (1080×1920) and HeydayHorizontal (1920×1080)
  scenes/                S1Reveal · S2Create · S3Trust · S4Process · S5Special · S6CTA
  components/
    Globe.tsx            SVG snow globe: glass, highlights, base, plaque, snow, glitter, liquid, line-art draw-on, sheen
    Inner.tsx            globe interiors (logo, product, venue, gift, character)
    Particles.tsx        deterministic 3-depth snow + glitter field
    Typography.tsx       word-by-word masked kinetic type, eyebrow labels
    Wordmark.tsx         official logo animation (stroke-drawn fallback wordmark)
    Icons.tsx            animated line icons
    Phone.tsx            smartphone + chat UI
    PhotoSlot.tsx        authentic photo masked in SVG with Ken Burns + reveal
    Transition.tsx       iris / wipe / slide scene entrances
    Background.tsx       white studio and night backgrounds
  lib/                   easing/springs, responsive layout, colour utils, fonts
public/audio/            heyday-score.wav (original, synthesised)
tools/                   make_music.py · stills.mjs · build-preview.mjs
preview/                 browser player (index.html + main.tsx)
```

The 9:16 and 16:9 versions come from the same scene code. `src/lib/layout.ts` switches between a stacked and a side-by-side composition.

## Notes

* Animation: Remotion `interpolate`/`spring` with custom bezier curves (expo-out, ease-in-out). GSAP was not used because Remotion renders frame by frame and needs every frame to be a pure function of time. GSAP timelines are wall-clock driven and would need a seek adapter.
* Fonts: Inter + Fraunces (SIL OFL), bundled from npm so renders work offline.
* Remotion is free for individuals and companies with up to 3 employees; larger companies need a [Remotion company license](https://www.remotion.dev/license).
* No voice-over is included (optional in the brief). The text is written to work without sound.
