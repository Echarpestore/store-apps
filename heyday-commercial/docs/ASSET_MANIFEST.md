# Asset manifest

Every asset in the project, where it comes from, and the slots waiting for authentic HEYDAY material.

## Included assets (all original to this project)

| Asset | File | Origin | License |
|---|---|---|---|
| Snow globe illustration (glass, base, collar, plaque, internal snow, liquid, line-art mode) | `src/components/Globe.tsx` | drawn in SVG for this project | project-owned |
| Globe interiors: logo monolith, product bottle, event pavilion, gift box, character, pines | `src/components/Inner.tsx` | drawn in SVG for this project | project-owned |
| Icon set (WhatsApp-style bubble, e-mail, web, Instagram-style, check, pencil, image, text, brush, cube, hand, sparkle, building, megaphone, star, boxes, BR flag, calendar) | `src/components/Icons.tsx` | drawn in SVG for this project | project-owned |
| Smartphone + chat UI | `src/components/Phone.tsx` | drawn in SVG | project-owned |
| Official HEYDAY logo | `public/brand/heyday-logo.png` | supplied by HEYDAY (2026-10-13), trimmed | HEYDAY |
| Fallback wordmark (only used if `officialLogo` is unset) | `src/components/Wordmark.tsx` | monoline SVG letters drawn for this project | project-owned |
| Music "HEYDAY score" (55 s, 48 kHz) | `public/audio/heyday-score.wav` | synthesised by `tools/make_music.py` (no samples) | project-owned |
| Client logos: Samsung, Google, Disney, Nike, Coca-Cola | `public/logos/*.svg` | npm `@thesvg/icons@3.3.13` (see docs/RESEARCH.md); viewBox cropped | trademarks of their owners |
| Client logos: Apple TV+, Universal, Sicredi, Kiwify | `public/logos/*.png` | supplied by HEYDAY (2026-10-13); trimmed, white background made transparent | trademarks of their owners |
| Fonts: Inter, Fraunces | `node_modules/@fontsource/*` | Google Fonts via npm | SIL Open Font License 1.1 |

## HEYDAY product photography (supplied 2026-10-13)

The story is told with illustrations. The real work is shown on its own, unaltered, in the Scene 5 showcase (no drawing → photo morphs). All photos were supplied by HEYDAY. They were only cropped, resized and EXIF-rotated, with no retouching. Registered in `src/config/brand.ts → photos`.

| File | Project | Original upload | Edit | Used in |
|---|---|---|---|---|
| `photos/coca-cola-hero.jpg` | Coca-Cola truck globe | single photo, 800×982 | none | S5 showcase 1: Personalização exclusiva |
| `photos/coca-cola-femsa-hand.jpg` | Coca-Cola FEMSA Brasil, in a gloved hand | single photo, 489×869 | none | S5 showcase 2: Produção artesanal no Brasil |
| `photos/nike-sneaker.jpg` | Nike sneaker + pine | single photo, 800×1422 | none | S5 showcase 3: Atenção aos detalhes |
| `photos/sicredi-staircase.jpg` | Sicredi cooperative staircase | single photo, 720×1280 | none | S5 showcase 4: Projetos corporativos |
| `photos/bauducco-mickey.jpg` | Bauducco "Lado a Lado Missão Orlando" | 4000×1848 JPEG (EXIF-rotated portrait) | rotated, cropped to the front row, resized to 1100 px | S5 showcase 5: Soluções para diferentes quantidades |
| `photos/porsche-ice-experience.jpg` | Porsche Ice Experience Finlândia 2025 | single photo, 800×450 | none | alternate (too low-res for a full card) |
| `photos/samsung-tv-plus.jpg` | Samsung TV Plus popcorn | left tile of a 3-photo collage | cropped to the tile | alternate (too low-res for a full card) |

Not used, and why: Riachuelo (removed at HEYDAY's request); Schutz, Marvel and Disney+ "Paradise" (Instagram stories, where the interface and caption overlays cover the globe); the green "Celebrate special moments" collage (play-button overlay); the duplicate Nike, Coca-Cola FEMSA and Bauducco group shots (kept as alternates).

The photo components (`PhotoSlot`, `PhotoGlobe`) use each photo's `sphere` coordinates so the drawn globe lines up with the real glass in outline → photo transitions.

## Remaining slots

| Slot | Folder | Config key | Used in | Recommended |
|---|---|---|---|---|
| Client logo still missing: Fairmont | `public/logos/` | `clients[].logo` + `aspect` | S3 grid (shown as typeset name until added) | official SVG, unmodified |
| Client project photos (optional) | `public/photos/` | `clients[].project` | S3 grid inset | square |
