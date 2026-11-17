(function () {
  'use strict';
  var root = document.documentElement;
  var WA = '554792752823';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); };

  /* ---------- languages ---------- */
  var T = {
    pt: {
      skip: 'Pular para o conteúdo', cta: 'Encomendar um globo',
      'hero.eyebrow': 'Feito à mão no Brasil · Desde 2014',
      'hero.h': 'Um mundo inteiro, feito à mão, para uma única ocasião.',
      'hero.p': 'A Heyday cria globos de neve sob medida — pensados a partir da sua história e finalizados um a um, para pessoas e marcas que querem um presente que ninguém mais tem.',
      'hero.cta2': 'Ver trabalhos entregues', 'hero.hint': 'Role — a neve acompanha você',
      's1.h': 'A base, na cor que você escolher.', 's1.p': 'Marfim, preto, o vermelho exato da sua marca. A base é finalizada na cor que você pedir.',
      's2.h': 'O mundo interno, feito para a sua história.', 's2.p': 'Um produto, um prédio, um personagem, uma lembrança. Cada elemento dentro do vidro é feito para o seu globo.',
      's3.h': 'As suas palavras e o seu logo.', 's3.p': 'Um nome, uma data, uma mensagem, uma marca — aplicados na base para que a peça seja inconfundivelmente sua.',
      's4.h': 'Neve, ou glitter na sua cor.', 's4.p': 'Flocos de neve clássicos ou glitter colorido. Vire o globo e veja cair.',
      'globe.aria': 'Globo de neve animado. A cor da base, a cena interna, a mensagem e a neve mudam conforme você rola a página.',
      'clients.h': 'Quem já encomendou',
      'work.eyebrow': 'Trabalhos entregues', 'work.h': 'Nenhuma encomenda é igual à outra.', 'work.batch': 'Um pedido completo, pronto para envio',
      'film.eyebrow': 'Direto do ateliê', 'film.h': 'Feitos um a um. Mesmo quando são centenas.',
      'film.l1': 'Feito à mão desde 2014.', 'film.l2': 'Todas as etapas de produção, no Brasil.', 'film.l3': 'Cada unidade tem uma história.',
      'film.aria': 'Uma mão gira um globo de neve pronto no ateliê Heyday; glitter dourado cai dentro dele enquanto fileiras de globos aguardam atrás.',
      'value.eyebrow': 'O preço de uma peça única', 'value.h': 'Por que um globo Heyday custa o que custa.',
      'v1.h': 'Ele não existe até você pedir.', 'v1.p': 'Nada sai de uma prateleira. A cor da base, os elementos internos, a mensagem, o logo e a neve são decididos com você.',
      'v2.h': 'Mãos, não linha de produção.', 'v2.p': 'Criamos produtos feitos à mão desde 2014. O artesanato, para nós, é mais do que um trabalho: é dedicação, paciência e arte em cada peça.',
      'v3.h': 'Feito inteiramente no Brasil.', 'v3.p': 'Todas as etapas de produção são realizadas no Brasil, com materiais de alta qualidade e cuidado artesanal.',
      'value.note': 'Cada encomenda recebe um orçamento individual. Respondemos em até 24 horas úteis.',
      'corp.eyebrow': 'Para marcas e eventos', 'corp.h': 'O presente que fica em cima da mesa.',
      'corp.p': 'Atendemos ações promocionais, brindes de final de ano, lançamentos de produtos e eventos corporativos — com condições especiais para pedidos a partir de 50 unidades.',
      'corp.cta': 'Pedir orçamento corporativo',
      'corp.l1': 'Ações promocionais', 'corp.l2': 'Brindes de final de ano', 'corp.l3': 'Lançamentos de produtos', 'corp.l4': 'Eventos corporativos',
      'faq.h': 'Antes de nos escrever.',
      q1: 'O que posso personalizar?', a1: 'Cada globo é único: escolha a cor da base, os elementos internos, as mensagens, os logos e o efeito especial — flocos de neve ou glitter colorido. Tudo feito sob medida.',
      q2: 'Quanto tempo leva para receber uma resposta?', a2: 'Respondemos em até 24 horas úteis após o seu contato.',
      q3: 'Vocês fazem projetos para campanhas e eventos?', a3: 'Sim. Ações promocionais, brindes de final de ano, lançamentos de produtos e eventos corporativos, com descontos especiais para pedidos a partir de 50 unidades.',
      q4: 'O produto é mesmo fabricado no Brasil?', a4: 'Sim. Todas as etapas de produção são realizadas no Brasil. Nossos globos são 100% nacionais, feitos com materiais de alta qualidade e cuidado artesanal.',
      'final.h': 'A sua ocasião merece um globo só dela.', 'final.p': 'Conte a ideia. Respondemos em até 24 horas úteis com um orçamento feito para ela.',
      'final.cta': 'Começar pelo WhatsApp', 'final.mail': 'Escrever por e-mail',
      'foot.portfolio': 'Portfólio', 'foot.made': 'Feito à mão no Brasil',
      engrave: 'SUA MENSAGEM',
      'wa.general': 'Olá, Heyday! Quero encomendar um globo de neve personalizado.',
      'wa.corp': 'Olá, Heyday! Quero um orçamento de globos de neve personalizados para a minha empresa.',
      title: 'Heyday — Globos de neve sob medida, feitos à mão no Brasil'
    },
    ar: {
      skip: 'انتقل إلى المحتوى', cta: 'اطلب كرتك الثلجية',
      'hero.eyebrow': 'صناعة يدوية في البرازيل · منذ 2014',
      'hero.h': 'عالم كامل، مصنوع باليد، لمناسبة واحدة.',
      'hero.p': 'هايداي تصنع كرات ثلجية حسب الطلب — تُصمَّم حول قصتك وتُنجَز قطعةً قطعة، لأشخاص وعلامات تجارية يريدون هدية لا يملكها أحد غيرهم.',
      'hero.cta2': 'شاهد أعمالنا المسلَّمة', 'hero.hint': 'مرِّر للأسفل — الثلج يتحرك معك',
      's1.h': 'القاعدة، باللون الذي تختاره.', 's1.p': 'عاجي، أسود، أو أحمر علامتك التجارية بالضبط. تُنفَّذ القاعدة باللون الذي تطلبه.',
      's2.h': 'العالم الداخلي، مصنوع لقصتك.', 's2.p': 'منتج، مبنى، شخصية، أو ذكرى. كل عنصر داخل الزجاج يُصنع خصيصًا لكرتك.',
      's3.h': 'كلماتك وشعارك.', 's3.p': 'اسم، تاريخ، رسالة، أو شعار — على القاعدة، لتكون القطعة لك وحدك.',
      's4.h': 'ثلج، أو لمعان بلونك.', 's4.p': 'ندف ثلج بيضاء كلاسيكية أو جليتر ملوّن. اقلب الكرة وشاهده يتساقط.',
      'globe.aria': 'كرة ثلجية متحركة. يتغير لون القاعدة والمشهد الداخلي والرسالة والثلج مع التمرير.',
      'clients.h': 'صنعنا لهم',
      'work.eyebrow': 'أعمال مسلَّمة', 'work.h': 'لا يتشابه طلبان.', 'work.batch': 'طلبية كاملة جاهزة للشحن',
      'film.eyebrow': 'من داخل الورشة', 'film.h': 'تُصنع واحدة واحدة. حتى لو كانت بالمئات.',
      'film.l1': 'صناعة يدوية منذ 2014.', 'film.l2': 'كل مراحل الإنتاج في البرازيل.', 'film.l3': 'لكل قطعة قصة.',
      'film.aria': 'يد تدير كرة ثلجية جاهزة في ورشة هايداي؛ يتساقط جليتر ذهبي بداخلها وخلفها صفوف من الكرات.',
      'value.eyebrow': 'ثمن القطعة الفريدة', 'value.h': 'لماذا تستحق كرة هايداي ثمنها.',
      'v1.h': 'لا وجود لها قبل أن تطلبها.', 'v1.p': 'لا شيء يؤخذ من على الرف. لون القاعدة، العناصر الداخلية، الرسالة، الشعار ونوع الثلج — كلها تُحدَّد معك.',
      'v2.h': 'أيادٍ، لا خط إنتاج.', 'v2.p': 'نصنع بأيدينا منذ 2014. الحِرفة عندنا أكثر من عمل: إخلاص وصبر وفن في كل قطعة.',
      'v3.h': 'صُنعت بالكامل في البرازيل.', 'v3.p': 'كل مراحل الإنتاج تتم في البرازيل، بخامات عالية الجودة وعناية حِرفية.',
      'value.note': 'لكل طلب عرض سعر خاص به. نرد خلال 24 ساعة عمل.',
      'corp.eyebrow': 'للعلامات التجارية والفعاليات', 'corp.h': 'الهدية التي تبقى على المكتب.',
      'corp.p': 'ننفّذ للحملات الترويجية، هدايا نهاية العام، إطلاق المنتجات وفعاليات الشركات — بشروط خاصة للطلبات من 50 قطعة فأكثر.',
      'corp.cta': 'اطلب عرض سعر للشركات',
      'corp.l1': 'حملات ترويجية', 'corp.l2': 'هدايا نهاية العام', 'corp.l3': 'إطلاق منتجات', 'corp.l4': 'فعاليات الشركات',
      'faq.h': 'قبل أن تراسلنا.',
      q1: 'ما الذي يمكنني تخصيصه؟', a1: 'كل كرة فريدة: تختار لون القاعدة، العناصر الداخلية، الرسائل، الشعارات والتأثير — ندف ثلج أو جليتر ملوّن. كل شيء حسب طلبك.',
      q2: 'متى أحصل على رد؟', a2: 'نرد خلال 24 ساعة عمل من تواصلك معنا.',
      q3: 'هل تنفّذون مشاريع للحملات والفعاليات؟', a3: 'نعم. حملات ترويجية، هدايا نهاية العام، إطلاق منتجات وفعاليات شركات، مع خصومات خاصة للطلبات من 50 قطعة فأكثر.',
      q4: 'هل المنتج مصنوع فعلًا في البرازيل؟', a4: 'نعم. كل مراحل الإنتاج تتم في البرازيل. كراتنا برازيلية 100٪، بخامات عالية الجودة وعناية حِرفية.',
      'final.h': 'مناسبتك تستحق كرة خاصة بها.', 'final.p': 'احكِ لنا الفكرة. نرد خلال 24 ساعة عمل بعرض سعر مخصص لها.',
      'final.cta': 'ابدأ على واتساب', 'final.mail': 'راسلنا بالبريد',
      'foot.portfolio': 'الأعمال', 'foot.made': 'صناعة يدوية في البرازيل',
      engrave: 'رسالتك هنا',
      'wa.general': 'مرحبًا هايداي! أريد طلب كرة ثلجية مخصصة.',
      'wa.corp': 'مرحبًا هايداي! أريد عرض سعر لكرات ثلجية مخصصة لشركتي.',
      title: 'هايداي — كرات ثلجية حسب الطلب، صناعة يدوية في البرازيل'
    }
  };
  var EN = {
    engrave: 'YOUR MESSAGE',
    'wa.general': 'Hello Heyday! I would like to commission a custom snow globe.',
    'wa.corp': 'Hello Heyday! I would like a quote for custom snow globes for my company.',
    title: document.title
  };
  var nodes = [].slice.call(document.querySelectorAll('[data-i18n]'));
  var arias = [].slice.call(document.querySelectorAll('[data-i18n-aria]'));
  nodes.forEach(function (n) { EN[n.getAttribute('data-i18n')] = n.textContent; });
  arias.forEach(function (n) { EN[n.getAttribute('data-i18n-aria')] = n.getAttribute('aria-label'); });
  T.en = EN;
  var lang = 'en';
  function t(k) { return (T[lang] && T[lang][k]) || EN[k] || ''; }

  function setLang(l, save) {
    if (!T[l]) l = 'en';
    lang = l;
    root.lang = l; root.dir = l === 'ar' ? 'rtl' : 'ltr';
    nodes.forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    arias.forEach(function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria'))); });
    document.title = t('title');
    [].forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === l));
    });
    [].forEach.call(document.querySelectorAll('[data-wa]'), function (a) {
      a.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(t('wa.' + a.getAttribute('data-wa')));
    });
    if (save) { try { localStorage.setItem('heyday-lang', l); } catch (e) {} }
    layout(); dirty = true;
  }

  /* ---------- pinned scenes ---------- */
  var pinned = !reduce;
  if (pinned) root.classList.add('pinned');

  var stage = document.getElementById('stage');
  var panels = [].slice.call(document.querySelectorAll('.panel'));
  var markEl = document.querySelector('.stage-mark');
  var work = document.getElementById('work');
  var track = document.querySelector('.work-track');
  var film = document.getElementById('film');
  var filmLines = [].slice.call(document.querySelectorAll('.film-lines li'));
  var video = document.getElementById('film-video');
  var dock = document.querySelector('.dock');
  var trackRun = 0;

  function layout() {
    if (!pinned) return;
    track.removeAttribute('tabindex');
    trackRun = Math.max(0, track.scrollWidth - window.innerWidth);
    work.style.height = (window.innerHeight + trackRun) + 'px';
  }
  function progress(el) {
    var r = el.getBoundingClientRect();
    var run = r.height - window.innerHeight;
    return run > 0 ? clamp(-r.top / run) : 0;
  }

  /* ---------- globe ---------- */
  var cv = document.getElementById('globe');
  var ctx = cv.getContext('2d');
  var CX = 500, CY = 420, R = 290;
  var BASES = [[239, 230, 210], [22, 22, 22], [214, 69, 122], [156, 31, 43]];
  var state = { base: BASES[0], scene: [1, 0, 0], engrave: 0, glitter: 0 };
  var lastIdx = 0, energy = 0, tilt = 0, tiltV = 0, dirty = true, stageVisible = true;
  var N = window.innerWidth < 760 ? 110 : 170;
  var P = [];
  function groundY(x) { return 0.966 - 0.448 * Math.sqrt(Math.max(0, 1 - x * x * 0.934)); }
  for (var i = 0; i < N; i++) {
    var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 0.9;
    var px = Math.cos(a) * r, py = Math.sin(a) * r;
    P.push({ x: px, y: Math.min(py, groundY(px)), vx: 0, vy: 0, s: 2 + Math.random() * 3.2, k: Math.random(), rest: false });
  }
  var GLIT = ['#f6e3a1', '#e8c66a', '#c99a3a', '#fff4cf'];

  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function rgb(c, al) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (al === undefined ? 1 : al) + ')'; }

  function setFromProgress(p) {
    var t1 = clamp((p - 0.2) / 0.16) * (BASES.length - 1);
    var bi = Math.min(BASES.length - 2, Math.floor(t1));
    state.base = mix(BASES[bi], BASES[bi + 1], t1 - bi);
    var t2 = clamp((p - 0.42) / 0.16);
    var ab = clamp(t2 / 0.4), bc = clamp((t2 - 0.6) / 0.4);
    state.scene = [1 - ab, ab * (1 - bc), bc];
    state.engrave = clamp((p - 0.63) / 0.08);
    state.glitter = clamp((p - 0.82) / 0.1);
    var idx = p < 0.18 ? 0 : p < 0.4 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 3 : 4;
    if (idx !== lastIdx) { lastIdx = idx; energy = Math.max(energy, 0.85); }
    panels.forEach(function (el, n) { el.classList.toggle('is-on', n === idx); });
    if (markEl) markEl.style.transform = 'translate3d(' + (-p * 38) + '%,0,0)';
    dirty = true;
  }

  var IV = '#f4eedd', GD = '#d9b56a';
  function tri(x, y1, y2, hw, fill) { ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + hw, y2); ctx.lineTo(x - hw, y2); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  function box(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function sceneTree() {
    box(488, 555, 24, 40, '#b08a45');
    tri(500, 452, 572, 122, '#e4dcc6'); tri(500, 388, 502, 97, '#ece5d1'); tri(500, 330, 432, 72, IV);
    ctx.fillStyle = GD; ctx.beginPath(); ctx.arc(500, 326, 13, 0, 6.283); ctx.fill();
    [[462, 545], [540, 520], [478, 478], [526, 455], [500, 410]].forEach(function (o) { ctx.beginPath(); ctx.arc(o[0], o[1], 6, 0, 6.283); ctx.fill(); });
  }
  function sceneHouse() {
    box(552, 392, 22, 50, '#e4dcc6');
    box(420, 468, 160, 122, IV);
    ctx.beginPath(); ctx.moveTo(398, 472); ctx.lineTo(500, 382); ctx.lineTo(602, 472); ctx.closePath(); ctx.fillStyle = GD; ctx.fill();
    box(485, 528, 30, 62, '#0b4031');
    box(438, 492, 30, 30, '#f3d78d'); box(532, 492, 30, 30, '#f3d78d');
  }
  function sceneGifts() {
    box(410, 522, 180, 68, IV); box(489, 522, 22, 68, GD);
    box(440, 456, 120, 66, GD); box(489, 456, 22, 66, IV);
    box(465, 400, 70, 56, IV); box(489, 400, 22, 56, GD);
    ctx.fillStyle = GD; ctx.beginPath(); ctx.arc(486, 392, 13, 0, 6.283); ctx.arc(514, 392, 13, 0, 6.283); ctx.fill();
  }
  var SCENES = [sceneTree, sceneHouse, sceneGifts];

  function draw() {
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.save();
    ctx.translate(500, 900); ctx.rotate(tilt); ctx.translate(-500, -900);

    // floor shadow
    var sh = ctx.createRadialGradient(500, 905, 10, 500, 905, 330);
    sh.addColorStop(0, 'rgba(0,0,0,.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(0, 905); ctx.scale(1, 0.16); ctx.translate(0, -905);
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(500, 905, 330, 0, 6.283); ctx.fill(); ctx.restore();

    // base
    ctx.beginPath();
    ctx.moveTo(285, 690); ctx.quadraticCurveTo(500, 730, 715, 690);
    ctx.lineTo(735, 870); ctx.quadraticCurveTo(500, 925, 265, 870); ctx.closePath();
    ctx.fillStyle = rgb(state.base); ctx.fill();
    var bs = ctx.createLinearGradient(265, 0, 735, 0);
    bs.addColorStop(0, 'rgba(0,0,0,.45)'); bs.addColorStop(0.28, 'rgba(255,255,255,.10)');
    bs.addColorStop(0.55, 'rgba(0,0,0,0)'); bs.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = bs; ctx.fill();
    ctx.beginPath(); ctx.ellipse(500, 690, 215, 26, 0, 0, 6.283); ctx.fillStyle = rgb(mix(state.base, [0, 0, 0], 0.35)); ctx.fill();
    if (state.engrave > 0.01) {
      var lum = state.base[0] * 0.3 + state.base[1] * 0.6 + state.base[2] * 0.1;
      ctx.globalAlpha = state.engrave;
      ctx.fillStyle = lum > 150 ? '#1a1304' : '#f3ecdc';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = (lang === 'ar' ? '500 40px "Readex Pro"' : '500 34px Fraunces') + ', serif';
      try { ctx.letterSpacing = lang === 'ar' ? '0px' : '7px'; } catch (e) {}
      ctx.fillText(t('engrave'), 500, 806 + (1 - state.engrave) * 10);
      try { ctx.letterSpacing = '0px'; } catch (e) {}
      ctx.globalAlpha = 1;
    }

    // glass interior
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 6.283); ctx.clip();
    var gl = ctx.createRadialGradient(CX - 60, CY - 80, 40, CX, CY, R);
    gl.addColorStop(0, 'rgba(255,255,255,.03)'); gl.addColorStop(0.75, 'rgba(255,255,255,.07)'); gl.addColorStop(1, 'rgba(255,255,255,.24)');
    ctx.fillStyle = gl; ctx.fillRect(CX - R, CY - R, 2 * R, 2 * R);
    // snow mound
    ctx.beginPath(); ctx.ellipse(500, 700, 300, 130, 0, 0, 6.283);
    var gm = ctx.createLinearGradient(0, 570, 0, 720); gm.addColorStop(0, '#fbf8ef'); gm.addColorStop(1, '#c9cfc4');
    ctx.fillStyle = gm; ctx.fill();
    // scenes
    for (var s = 0; s < 3; s++) {
      var al = state.scene[s];
      if (al > 0.01) { ctx.save(); ctx.globalAlpha = al; ctx.translate(0, (1 - al) * 26); SCENES[s](); ctx.restore(); }
    }
    // particles
    for (var i = 0; i < P.length; i++) {
      var p = P[i], g = p.k < state.glitter;
      ctx.fillStyle = g ? GLIT[i % 4] : 'rgba(255,255,255,.92)';
      var sz = g ? p.s * 0.85 : p.s;
      if (g) { ctx.fillRect(CX + p.x * R - sz, CY + p.y * R - sz, sz * 2, sz * 2); }
      else { ctx.beginPath(); ctx.arc(CX + p.x * R, CY + p.y * R, sz, 0, 6.283); ctx.fill(); }
    }
    ctx.restore();

    // glass rim + highlights
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 6.283); ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.beginPath(); ctx.arc(CX, CY, R - 34, 3.5, 4.35); ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.arc(CX, CY, R - 30, 0.35, 0.95); ctx.stroke();
    ctx.restore();
  }

  function physics(dt) {
    var moving = false, e = energy;
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      if (e > 0.02) {
        p.rest = false;
        p.vx += (Math.random() - 0.5) * 0.016 * e * dt;
        p.vy += ((Math.random() - 0.5) * 0.016 - 0.0022) * e * dt;
      } else if (p.rest) {
        if (Math.random() < 0.008 * dt) { p.rest = false; p.x = (Math.random() - 0.5) * 1.1; p.y = -0.72 + Math.random() * 0.2; p.vx = 0; p.vy = 0; }
        else continue;
      }
      moving = true;
      p.vy += 0.00042 * dt;
      p.vx += Math.sin((p.y + p.k) * 9) * 0.00006 * dt;
      var d = Math.pow(0.965, dt); p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      var rr = Math.sqrt(p.x * p.x + p.y * p.y);
      if (rr > 0.94) { p.x *= 0.94 / rr; p.y *= 0.94 / rr; p.vx = p.vx * -0.3 - p.x * 0.006; p.vy = p.vy * -0.3 - p.y * 0.006; }
      var gy = groundY(p.x);
      if (p.y >= gy && p.vy >= 0) { p.y = gy; if (e < 0.05) { p.rest = true; p.vx = 0; p.vy = 0; } }
    }
    return moving;
  }

  function staticSnow() { P.forEach(function (p, i) { if (i % 3) { p.y = groundY(p.x); } }); }

  /* ---------- film ---------- */
  var filmT = 0, filmTarget = 0, filmReady = false;
  if (video) {
    if (reduce) { video.controls = true; }
    video.addEventListener('loadedmetadata', function () { filmReady = true; });
    if (video.readyState >= 1) filmReady = true;
    var prime = function () {
      window.removeEventListener('touchstart', prime);
      var pr = video.play(); if (pr && pr.then) pr.then(function () { video.pause(); }).catch(function () {});
    };
    if (!reduce) window.addEventListener('touchstart', prime, { passive: true });
    // Load the clip fully into memory so scroll-scrubbing is instant and works on hosts without byte-range support.
    if (!reduce && window.fetch && window.URL) {
      fetch(video.currentSrc || video.querySelector('source').src).then(function (r) { return r.ok ? r.blob() : null; }).then(function (bl) {
        if (bl) { video.src = URL.createObjectURL(bl); video.load(); }
      }).catch(function () {});
    }
  }

  /* ---------- main loop ---------- */
  var lastY = window.scrollY, lastT = 0, raf = 0;
  function onScroll() {
    var y = window.scrollY, dy = y - lastY; lastY = y;
    if (pinned) {
      energy = Math.min(1, energy + Math.abs(dy) / 90);
      tiltV += clamp(dy, -60, 60) * 0.00035;
      setFromProgress(progress(stage));
      var wp = progress(work);
      track.style.transform = 'translate3d(' + (-wp * trackRun) + 'px,0,0)';
      var fp = progress(film);
      filmTarget = fp;
      var li = fp < 0.34 ? 0 : fp < 0.67 ? 1 : 2;
      filmLines.forEach(function (el, n) { el.classList.toggle('is-on', n === li); });
    }
    if (dock) dock.classList.toggle('show', y > window.innerHeight * 0.6 && y < document.documentElement.scrollHeight - window.innerHeight * 1.6);
    kick();
  }
  function frame(ts) {
    raf = 0;
    var dt = lastT ? Math.min(3, (ts - lastT) / 16.7) : 1; lastT = ts;
    var again = false;
    if (stageVisible) {
      energy *= Math.pow(0.93, dt); if (energy < 0.01) energy = 0;
      tiltV += -tilt * 0.06 * dt; tiltV *= Math.pow(0.86, dt); tilt += tiltV * dt;
      var moving = physics(dt);
      if (moving || dirty || Math.abs(tilt) > 0.0005 || energy > 0) { draw(); dirty = false; }
      again = true; // gentle ambient snowfall keeps the loop alive while the globe is on screen
    }
    if (filmReady && video.duration && Math.abs(filmTarget - filmT) > 0.002) {
      filmT += (filmTarget - filmT) * Math.min(1, 0.22 * dt);
      try { video.currentTime = filmT * (video.duration - 0.05); } catch (e) {}
      again = true;
    }
    if (again) kick();
  }
  function kick() { if (!raf && !reduce) raf = requestAnimationFrame(frame); }

  cv.addEventListener('pointerdown', function () { energy = 1; tiltV += 0.02; kick(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { stageVisible = es[0].isIntersecting; lastT = 0; kick(); }).observe(stage);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px' });
    [].forEach.call(document.querySelectorAll('.reveal'), function (el) { io.observe(el); });
  } else {
    [].forEach.call(document.querySelectorAll('.reveal'), function (el) { el.classList.add('in'); });
  }

  [].forEach.call(document.querySelectorAll('.lang button'), function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-lang'), true); if (reduce) draw(); onScroll(); });
  });

  var saved = null;
  try { saved = localStorage.getItem('heyday-lang'); } catch (e) {}
  if (!saved) { var nl = (navigator.language || 'en').slice(0, 2).toLowerCase(); saved = T[nl] ? nl : 'en'; }
  setLang(saved, false);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { layout(); onScroll(); });
  window.addEventListener('load', function () { layout(); onScroll(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); dirty = true; if (reduce) draw(); else kick(); });

  if (reduce) {
    state.base = BASES[3]; state.scene = [0, 0, 1]; state.engrave = 1; state.glitter = 1;
    staticSnow(); draw();
  }
  layout(); onScroll();
})();
