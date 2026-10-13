/**
 * "A próxima pode ser a sua marca" — HEYDAY brands film. Beat times in seconds.
 * The score (tools/make_music_brands.py) follows the same beats.
 */
export const BR = {
  trackStart: 3.2, // first brand globe arrives
  step: 1.9, // seconds per brand
  shelf: 16.6, // all globes gather
  shake: 19.4, // all shake together
  proof: 21, // real photos
  cta: 25.5, // "A próxima pode ser a sua marca."
  total: 32,
} as const;

/** Brands featured, in order. Names must match `clients` in config/brand.ts. */
export const BR_BRANDS: {name: string; base: string; plaque: string}[] = [
  {name: 'Apple TV+', base: '#111214', plaque: 'APPLE TV+'},
  {name: 'Google', base: '#F1F3F4', plaque: 'GOOGLE'},
  {name: 'Samsung', base: '#1428A0', plaque: 'SAMSUNG'},
  {name: 'Disney', base: '#0F2A66', plaque: 'DISNEY'},
  {name: 'Universal', base: '#1B1C20', plaque: 'UNIVERSAL'},
  {name: 'Nike', base: '#111111', plaque: 'NIKE'},
  {name: 'Coca-Cola', base: '#C8102E', plaque: 'COCA-COLA'},
];

export const BR_COPY = {
  intro: 'Algumas marcas dispensam apresentação.',
  shelf: 'Marcas globais. Uma escolha em comum.',
  proof: 'Projetos reais, feitos à mão no Brasil.',
  cta: 'A próxima pode ser a sua marca.',
  legal: 'Projetos realizados pela HEYDAY. As marcas exibidas pertencem aos seus respectivos titulares.',
};
