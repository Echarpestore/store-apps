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
// WhatsApp and e-mail were confirmed by HEYDAY's side on 2026-10-13.
// ---------------------------------------------------------------------------
export const contact = {
  whatsapp: {
    verified: true,
    display: '(47) 9275-2823',
    placeholder: 'WhatsApp a confirmar',
  },
  email: {
    verified: true,
    display: 'heydaybrazil@gmail.com',
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
    clientsCaption: 'Projetos desenvolvidos pela HEYDAY',
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
// Verified clients. Add a brand ONLY after confirming that HEYDAY completed
// a project for it. Logo files go in /public/logos (SVG, original artwork
// and colours, never stretched). `aspect` (width / height of the logo
// artwork) is used for optical sizing. Without a `logo`, the brand name is
// typeset in neutral type instead — send the official file to replace it.
//
// The list below was confirmed by HEYDAY on 2026-10-13.
// ---------------------------------------------------------------------------
export type Client = {
  name: string;
  logo?: string; // e.g. 'logos/brand.svg'
  aspect?: number;
  scale?: number; // optical size correction (1 = default), never changes proportions
  evidence: string; // where the project is documented
  project?: Photo;
};

const CONFIRMED = 'Confirmed by HEYDAY, 2026-10-13';

export const clients: Client[] = [
  {name: 'Samsung', logo: 'logos/samsung.svg', aspect: 5.9, evidence: CONFIRMED},
  {name: 'Google', logo: 'logos/google.svg', aspect: 2.93, evidence: CONFIRMED},
  {name: 'Apple TV+', logo: 'logos/appletvplus.png', aspect: 2.65, scale: 0.9, evidence: CONFIRMED},
  {name: 'Disney', logo: 'logos/disney.svg', aspect: 2.35, evidence: CONFIRMED},
  {name: 'Universal', logo: 'logos/universal.png', aspect: 1.82, scale: 1.4, evidence: CONFIRMED},
  {name: 'Nike', logo: 'logos/nike.svg', aspect: 2.76, evidence: CONFIRMED},
  {name: 'Coca-Cola', logo: 'logos/cocacola.svg', aspect: 3.06, evidence: CONFIRMED},
  {name: 'Riachuelo', logo: 'logos/riachuelo.png', aspect: 2.62, scale: 1.2, evidence: CONFIRMED},
  {name: 'Sicredi', logo: 'logos/sicredi.png', aspect: 3.68, evidence: CONFIRMED},
  {name: 'Kiwify', logo: 'logos/kiwify.png', aspect: 1.0, evidence: CONFIRMED},
  {name: 'Fairmont', evidence: CONFIRMED},
];

// Official logo file. When present (SVG or PNG with transparency) it replaces
// the typeset wordmark everywhere. Leave undefined to use the wordmark.
// Supplied by HEYDAY (2026-10-13): white serif wordmark with cyan glow.
export const officialLogo: string | undefined = 'brand/heyday-logo.png';
export const officialLogoAspect = 3.85; // width / height of the file
