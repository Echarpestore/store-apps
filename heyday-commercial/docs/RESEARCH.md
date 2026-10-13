# Brand research — what was verified, what is missing

Research date: 2026-10-13.

## Access limits in this build environment

The build ran in a sandboxed cloud container whose network policy **blocked direct access** to:

| Host | Result |
|---|---|
| `heyday.com.br`, `www.heyday.com.br` | proxy CONNECT refused (403) / DNS not resolvable from the fetch tool |
| `www.instagram.com/heydaybr` | blocked |
| `web.archive.org`, `elo7.com.br`, `heydaybrasil.com.br`, `cnpj.biz` | blocked |

The only research channel available was a **web search engine** (titles + text snippets of indexed pages). No image, logo or file could be downloaded.

## Facts confirmed from indexed HEYDAY pages (used in the video)

| Fact | Source (indexed) | Where it is used |
|---|---|---|
| HEYDAY creates custom snow globes for **companies, agencies and events since 2014** | heyday.com.br home page | Scene 3 headline + "2014" card |
| **All production stages are carried out in Brazil**; national product, artisanal care | heyday.com.br home page | Scene 3 "100%" card, Scene 4 "Feito à mão · no Brasil", Scene 5 feature list |
| Serves **promotional campaigns, year-end gifts, product launches, corporate events** | heyday.com.br home page | Scene 2 use cases |
| **Special discounts for orders from 50 units** | heyday.com.br home page | Scene 3 "50+ unidades com condições especiais" |
| Customisation: **base colour, internal elements, messages, logos, snowflakes or coloured glitter** | heyday.com.br home page | Scene 5 option chips + live demo |
| Website `heyday.com.br`, Instagram `@heydaybr` | search results | Scene 6 |
| Instagram bio mentions "📩 Orçamentos WhatsApp", Joinville SC | search snippet of instagram.com/heydaybr | supports WhatsApp as quote channel |
| Legal entity: HEYDAY GLOBO DE NEVE PERSONALIZADO LTDA, CNPJ 46.031.081/0001-98, Joinville/SC | serasaexperian / cnpj.biz snippets | not shown in the video |

## Contact details — confirmed

Search snippets of the **HEYDAY Brasil storefront** (`heydaybrasil.com.br`, "Fale conosco") listed:

* WhatsApp **(47) 9275-2823**
* e-mail **heydaybrazil@gmail.com**

These could not be opened from the build environment, but both were **confirmed by the client on 2026-10-13** as the WhatsApp line and business e-mail, and are shown in Scene 6 (`contact.*.verified = true` in `src/config/brand.ts`).

## Client brands — none verified

No HEYDAY page or post naming a client could be read. None of the candidate brands in the brief (Coca-Cola, Samsung, Nike, McDonald's, Porsche, Disney+, Sicredi, Schutz, Google, Apple TV+, Banco do Brasil, Bauducco, Novo Nordisk, Rosewood) could be confirmed, so **no client logo appears in the video**. Scene 3 instead shows verified company facts. The client grid is fully built: add entries to `clients` in `src/config/brand.ts` (with the evidence URL) and Scene 3 switches automatically to the "Marcas que já fizeram parte da nossa história." logo grid.

## Logo and photography — missing

* **Official logo**: not downloadable. The video uses a typeset monoline "HEYDAY" wordmark drawn in SVG as a stand-in. Put the official file in `public/brand/` and set `officialLogo`.
* **Product photos**: not downloadable. The video uses original, editable SVG globe illustrations (clearly illustrative — generic "SUA MARCA" content, no third-party brands). They are not presented as HEYDAY portfolio pieces. Every photo slot is wired: see `docs/ASSET_MANIFEST.md`.
* **Palette**: HEYDAY's official colours could not be sampled. A restrained white / ink / warm-gold palette is used; change the hex values in `colors`.

Products seen in search listings (Dr Who, Taylor Swift "Lover", Up, Friends, O Pequeno Príncipe, Olaf) are licensed entertainment properties and were deliberately **not** illustrated.
