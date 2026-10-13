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
| Music "HEYDAY score" (54.5 s, 48 kHz) | `public/audio/heyday-score.wav` | synthesised by `tools/make_music.py` (no samples) | project-owned |
| Client logos: Samsung, Google, Disney, Nike, Coca-Cola | `public/logos/*.svg` | npm `@thesvg/icons@3.3.13` (see docs/RESEARCH.md); viewBox cropped | trademarks of their owners |
| Client logos: Apple TV+, Universal, Riachuelo, Sicredi, Kiwify | `public/logos/*.png` | supplied by HEYDAY (2026-10-13); trimmed, white background made transparent | trademarks of their owners |
| Fonts: Inter, Fraunces | `node_modules/@fontsource/*` | Google Fonts via npm | SIL Open Font License 1.1 |

## Slots for authentic HEYDAY material (currently empty)

Download the files, put them in the folder shown, and register them in `src/config/brand.ts`. Record the original URL in the table so the source is documented.

| Slot | Folder | Config key | Used in | Recommended |
|---|---|---|---|---|
| Hero product photo | `public/photos/` | `photos.hero` | S1 reveal (circle mask) | ≥1600 px, globe centred |
| Montage (4 photos) | `public/photos/` | `photos.montage[0..3]` | S2 arch cards (corporate gift, campaign, event, exclusive gift) | portrait ≥1200×1600 |
| Production / finished product | `public/photos/` | `photos.process` | S4 step 04→05 | globe on clean background |
| Beauty close-up(s) | `public/photos/` | `photos.beauty[0]` | S5 outline → photo moment | square, dramatic light |
| CTA product | `public/photos/` | `photos.cta` | S6 | globe on dark background |
| Client logo still missing: Fairmont | `public/logos/` | `clients[].logo` + `aspect` | S3 grid (shown as typeset name until added) | official SVG, unmodified |
| Client project photos | `public/photos/` | `clients[].project` | S3 grid inset | square |

### Source log (fill in when assets are added)

| File | Original URL | Downloaded on | Notes |
|---|---|---|---|
| — | — | — | no authentic asset could be downloaded from this environment (see RESEARCH.md) |

Example registration:

```ts
export const photos = {
  hero: {file: 'photos/heyday-hero.jpg', alt: 'Globo de neve corporativo HEYDAY', source: 'https://www.instagram.com/p/XXXX/', focus: {x: 0.5, y: 0.45}},
  montage: [ /* four entries */ ],
  ...
};
```
