/**
 * HEYDAY commercial — single source of truth.
 *
 * Everything a non-developer may need to change lives in this file:
 * copy, contact details, colours, product photos and client logos.
 * Change a value, re-run `npm run render:vertical`, done.
 *
 * Facts used here and where they come from are listed in docs/RESEARCH.md.
 */

export const FPS = 60;

// ---------------------------------------------------------------------------
// Palette. HEYDAY's official brand guide could not be downloaded (see
// docs/RESEARCH.md). This is a restrained "white glass + ink + warm gold"
// palette; swap the hex values for the official ones when available.
// ---------------------------------------------------------------------------
export const colors = {
  paper: '#FAF8F4', // clean warm white surface
  paperDeep: '#EFEBE4',
  ink: '#121419', // primary text / night background
  night: '#0B0F17',
  nightSoft: '#162033',
  muted: '#6B7280',
  gold: '#C9A465', // controlled accent
  goldLight: '#E9D3A6',
  ice: '#A9CBE0', // glass / snow tint
  iceDeep: '#5E8DB0',
  whatsapp: '#25D366',
};

export const fonts = {
  display: '"Fraunces", Georgia, serif',
  sans: '"Inter", Helvetica, Arial, sans-serif',
};

// ---------------------------------------------------------------------------
// Contact. NOTHING here may be invented.
//
// `verified: false` renders a clearly labelled placeholder in the video.
// The candidate values below were found in public search results for the
// HEYDAY Brasil storefront ("Fale conosco"), but could NOT be confirmed on
// heyday.com.br or the @heydaybr Instagram from this environment, so they
// are not shown until someone at HEYDAY confirms them and flips the flag.
// ---------------------------------------------------------------------------
export const contact = {
  whatsapp: {
    verified: false,
    display: '(47) 9275-2823', // candidate — confirm (and whether it is the WhatsApp line)
    placeholder: 'WhatsApp a confirmar',
  },
  email: {
    verified: false,
    display: 'heydaybrazil@gmail.com', // candidate — confirm it is the business address
    placeholder: 'e-mail a confirmar',
  },
  website: 'heyday.com.br',
  instagram: '@heydaybr',
};

export const contactText = (c: {verified: boolean; display: string; placeholder: string}) =>
  c.verified ? c.display : c.placeholder;

// ---------------------------------------------------------------------------
// Copy (pt-BR). Kept short so it reads without sound.
// ---------------------------------------------------------------------------
export const copy = {
  s1: {
    line1: 'Sua marca merece algo extraordinário.',
    brand: 'HEYDAY',
    tagline: 'Globos de Neve Personalizados',
  },
  s2: {
    headline: 'Transformamos ideias em experiências inesquecíveis.',
    uses: ['Brindes corporativos', 'Campanhas promocionais', 'Eventos especiais', 'Presentes exclusivos'],
  },
  s3: {
    // Used only when at least one verified client is listed in `clients`.
    clientsHeadline: 'Marcas que já fizeram parte da nossa história.',
    // Used while the verified client list is empty (current state).
    factsHeadline: 'Desde 2014 criando para empresas, agências e eventos.',
    facts: [
      {value: '2014', label: 'criando globos de neve personalizados'},
      {value: '100%', label: 'das etapas de produção no Brasil'},
      {value: '50+', label: 'unidades com condições especiais'},
    ],
    audiences: ['Empresas', 'Agências', 'Eventos'],
  },
  s4: {
    steps: [
      {n: '01', title: 'Entre em contato', text: 'Conte sua ideia pelo WhatsApp ou e-mail.'},
      {n: '02', title: 'Compartilhe sua ideia', text: 'Envie sua ideia, logotipo ou referência.'},
      {n: '03', title: 'Criamos seu projeto', text: 'Nós desenvolvemos a proposta visual para você.'},
      {n: '04', title: 'Aprovação e produção', text: 'Após a aprovação, damos vida ao seu projeto.'},
      {n: '05', title: 'Seu projeto ganha vida', text: 'Uma ideia única. Um presente inesquecível.'},
    ],
    no3d: 'Não precisa de projeto 3D.',
  },
  s5: {
    headline: 'Cada detalhe, feito para a sua marca.',
    features: [
      'Personalização exclusiva',
      'Produção artesanal no Brasil',
      'Atenção aos detalhes',
      'Projetos corporativos',
      'Soluções para diferentes quantidades',
    ],
    // Verified customisation options (heyday.com.br home page).
    options: ['Cor da base', 'Elementos internos', 'Mensagens', 'Logos', 'Neve ou glitter colorido'],
  },
  s6: {
    headline: 'Sua ideia. Nossa criação.',
    sub: 'Conte seu projeto para a HEYDAY.',
    whatsappLabel: 'Envie sua ideia',
    emailLabel: 'Solicite seu orçamento',
    closing: 'HEYDAY — Transformando ideias em lembranças inesquecíveis.',
  },
};

// ---------------------------------------------------------------------------
// Authentic product photography.
//
// Drop the downloaded HEYDAY photos in /public/photos and list them here
// (see docs/ASSET_MANIFEST.md for the source URL of every file). While the
// list is empty the commercial uses the in-house SVG globe illustrations,
// which are presented as illustrations, never as HEYDAY portfolio pieces.
//
// Slots: hero (S1 reveal), montage (S2, 4 photos), process (S4 step 04/05),
// beauty (S5 close-ups), cta (S6).
// ---------------------------------------------------------------------------
export type Photo = {
  file: string; // path inside /public, e.g. 'photos/globo-banco.jpg'
  alt: string;
  source: string; // original URL
  focus?: {x: number; y: number}; // 0..1 crop focus
};

export const photos: {
  hero?: Photo;
  montage: Photo[];
  process?: Photo;
  beauty: Photo[];
  cta?: Photo;
} = {
  hero: undefined,
  montage: [],
  process: undefined,
  beauty: [],
  cta: undefined,
};

// ---------------------------------------------------------------------------
// Verified clients. Add a brand ONLY after confirming, in genuine HEYDAY
// material, that HEYDAY completed a project for it. Logo files go in
// /public/logos (SVG preferred, original proportions). `project` is an
// optional photo of that brand's HEYDAY globe.
//
// None of the candidate brands in the brief could be verified from this
// environment, so the list is intentionally empty and Scene 3 shows
// verified company facts instead.
// ---------------------------------------------------------------------------
export type Client = {
  name: string;
  logo: string; // e.g. 'logos/brand.svg'
  evidence: string; // URL of the HEYDAY post/page that proves the project
  project?: Photo;
};

export const clients: Client[] = [];

// Official logo file. When present (SVG or PNG with transparency) it replaces
// the typeset wordmark everywhere. Leave undefined to use the wordmark.
export const officialLogo: string | undefined = undefined; // e.g. 'brand/heyday-logo.svg'
