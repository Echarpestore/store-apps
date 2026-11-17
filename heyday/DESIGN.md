# Heyday — design system

Bespoke handmade snow globes, made in Brazil since 2014. The page must feel
like a jeweller's window: dark, quiet, one object lit in the middle.
Direction chosen from the brand's own material (emerald gift boxes with gold
foil, glass, white snow) — not from a comparison with other sites.

Single theme (dark emerald). No light mode.

## Color

| Token | Value | Role |
|---|---|---|
| `--bg` | `#04241b` | page background |
| `--bg-2` | `#07382a` | raised bands, cards |
| `--line` | `rgba(243,236,220,.16)` | hairlines, borders |
| `--ink` | `#f3ecdc` | headings and body text (ivory) |
| `--ink-2` | `#b4c2b4` | secondary text |
| `--gold` | `#d9b56a` | the only accent: primary button, numerals, focus ring |
| `--gold-ink` | `#1a1304` | text on gold |

Client photos are the only other colour on the page.

## Typography

- Display: **Fraunces** (serif, weight 300–500), tight leading, sentence case.
- Text: **Instrument Sans** 400/500/600.
- Arabic: **Readex Pro** for both roles.
- Scale: 13 / 15 / 17 (body) / 21 / 30 / 48 / 84, large sizes fluid with `clamp()`.
- Eyebrows: 13px, uppercase, letter-spacing .18em, gold.

## Spacing and shape

- 8px scale: 8 16 24 32 48 72 112. Sections: 112px desktop, 72px phone.
- Content width 1200px, text measure max 34rem, side gutter 24px (16px phone).
- Radius: 2px for buttons and images (sharp, not friendly); 999px for the language pills only.
- No shadows except under the globe.

## Components

- **Primary button**: gold fill, dark text, uppercase 13px, letter-spaced; hover lightens; focus 2px gold outline, 3px offset.
- **Quiet button**: 1px ivory hairline border, ivory text.
- **Link**: ivory with gold underline.
- **Header**: wordmark, language switch (EN / PT / عربي), one CTA.
- **FAQ**: native `<details>`, hairline separated.

## Motion

- Everything is driven by scroll, nothing loops for attention.
- The globe's snow reacts to scroll speed; four scroll steps change base colour, scene, message and snow type.
- Workshop film is scrubbed by scroll.
- `prefers-reduced-motion`: pinned scenes become plain stacked content, film gets normal controls.

## Imagery

- Only real Heyday work and workshop footage. No stock, no invented products.
- Video slots (`media/*.mp4`) are filmed or generated on the same emerald so they sit flush on the page.
