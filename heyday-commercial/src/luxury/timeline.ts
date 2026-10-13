/**
 * "Presentes que ficam" — HEYDAY luxury brand film. Beat times in seconds.
 * Edit here; the film and the score (tools/make_music_luxury.py) follow these beats.
 */
export const LUX = {
  land: 4.5, // the falling flake lands → ring of light, macro glass
  pull: 8, // camera starts pulling back
  reveal: 13.5, // full globe on screen
  contrast: 14, // ordinary gifts appear
  dissolve: 16.2, // ordinary gifts turn to dust
  stays: 17.6, // "Um HEYDAY fica na mesa."
  shake: 18.6, // the globe is shaken, glitter swirls
  gallery: 20.5, // real HEYDAY work
  end: 27.5, // logo + contact
  total: 34,
} as const;

export const LUX_COPY = {
  opened: 'Alguns presentes são abertos.',
  remembered: 'Outros são lembrados para sempre.',
  handmade: 'Feito à mão, peça por peça.',
  forgotten: 'Brindes comuns acabam esquecidos.',
  stays: 'Um HEYDAY fica na mesa.',
  memory: 'E volta à memória a cada movimento.',
  galleryEyebrow: 'Projetos HEYDAY',
  gallery: 'Escolhido por marcas extraordinárias.',
  tagline: 'Presentes que ficam para sempre.',
};
