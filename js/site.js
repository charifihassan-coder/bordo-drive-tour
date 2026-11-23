/**
 * Bordo Drive Tour — socle commun aux deux pages : intro, défilement à inertie, ancres, navigation,
 * apparitions au défilement. Sans dépendance. Seuls transform, opacity et clip-path sont animés.
 */
export const root = document.documentElement;
export const $ = (selector, scope = document) => scope.querySelector(selector);
export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Réglages : mettre `smoothScroll: false` pour garder le défilement natif partout. */
export const SETTINGS = { smoothScroll: true, introMinCount: 800, introMaxWait: 4000, apertureDuration: 1100 };

/* ==========================================================================
   1. Intro : compteur de chargement réel, puis ouverture du cadre
   ========================================================================== */
function runIntro() {
  if (!root.classList.contains('intro-on')) { root.classList.add('intro-done'); return Promise.resolve(); }

  const curtain = $('#intro');
  const image = $('#hero-img');
  const count = $('#intro-count');
  const bar = $('#intro-bar');
  const skip = $('#intro-skip');
  let finished = false;
  let opening = false;
  let done;
  const whenDone = new Promise((resolve) => { done = resolve; });

  // La page est rendue sous le rideau dès le premier affichage. Une fois ce premier rendu passé,
  // l'interface est mise en attente pour pouvoir entrer en séquence à l'ouverture.
  requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(() => { if (!finished) root.classList.add('intro-armed'); }, 80)));

  // les ressources critiques : les deux polices et la photo d'ouverture, décodée
  const imageReady = () => (image.complete && image.naturalWidth
    ? Promise.resolve()
    : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })
  ).then(() => (image.decode ? image.decode().catch(() => {}) : undefined));
  const fontReady = (font) => (document.fonts && document.fonts.load ? document.fonts.load(font).catch(() => {}) : Promise.resolve());
  const critical = [fontReady('400 1em "Cormorant Garamond"'), fontReady('500 1em "Plus Jakarta Sans"'), imageReady()];
  let loaded = 0;
  critical.forEach((task) => task.then(() => { loaded += 1; }));

  const start = performance.now();
  let shown = 0;

  function tick(now) {
    if (finished || opening) return;
    const elapsed = now - start;
    const real = elapsed > SETTINGS.introMaxWait ? 1 : loaded / critical.length;   // au-delà de 4 s, on n'attend plus
    const target = Math.min(real, elapsed / SETTINGS.introMinCount);                // le compteur reste lisible
    shown += (target - shown) * 0.16;
    if (target - shown < 0.006) shown = target;
    count.textContent = pad2(Math.round(shown * 100));
    bar.style.transform = `scaleX(${shown.toFixed(4)})`;
    if (shown >= 1) { open(); return; }
    requestAnimationFrame(tick);
  }

  /** Le rideau, percé d'une fenêtre centrée : x et y sont les marges de la fenêtre, en % de l'écran. */
  const windowIn = (x, y) => `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x}% ${y}%, ${x}% ${100 - y}%, ${100 - x}% ${100 - y}%, ${100 - x}% ${y}%, ${x}% ${y}%)`;

  function open() {
    opening = true;
    root.classList.add('intro-armed', 'intro-open');
    const duration = SETTINGS.apertureDuration;
    // d'une fente, à un cadre resserré, au plein écran
    const aperture = curtain.animate([
      { clipPath: windowIn(42, 49.7), offset: 0, easing: EASE },
      { clipPath: windowIn(37, 34), offset: 0.3, easing: EASE },
      { clipPath: windowIn(0, 0), offset: 1 },
    ], { duration, fill: 'forwards' });
    image.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: duration + 350, easing: EASE, fill: 'backwards' });
    window.setTimeout(() => root.classList.add('intro-ui'), duration * 0.42);        // nav, titre, indicateur
    aperture.finished.then(finish, () => {});
    window.setTimeout(finish, duration + 500);   // onglet en arrière-plan : les animations y sont suspendues, pas les minuteries
  }

  function finish() {
    if (finished) return;
    finished = true;
    root.classList.add('intro-open', 'intro-ui', 'intro-done');
    curtain.getAnimations().forEach((animation) => animation.cancel());
    try { sessionStorage.setItem('bdt-intro', '1'); } catch { /* stockage indisponible : l'intro rejouera */ }
    done();
  }

  function skipIntro() {
    if (finished) return;
    image.getAnimations().forEach((animation) => animation.cancel());
    finish();
  }

  skip.addEventListener('click', skipIntro);
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') skipIntro(); }, { once: true });
  requestAnimationFrame(tick);
  return whenDone;
}

/* ==========================================================================
   2. Défilement fluide à inertie (souris et pavé tactile ; le toucher reste natif)
   ========================================================================== */
class SmoothScroll {
  constructor() {
    this.enabled = true;
    this.running = false;
    this.target = window.scrollY;
    this.current = window.scrollY;
    window.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    window.addEventListener('scroll', () => { if (!this.running) this.sync(); }, { passive: true });
    window.addEventListener('resize', () => this.sync(), { passive: true });
  }
  get max() { return root.scrollHeight - window.innerHeight; }
  sync() { this.target = this.current = window.scrollY; }
  onWheel(event) {
    if (!this.enabled || event.ctrlKey || event.defaultPrevented) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;                       // geste horizontal
    if (event.target.closest && event.target.closest('[data-native-scroll], dialog')) return;
    if (root.classList.contains('intro-on') && !root.classList.contains('intro-done')) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? window.innerHeight : 1;
    this.to(this.target + event.deltaY * unit);
  }
  to(y) {
    this.target = clamp(y, 0, this.max);
    if (!this.running) { this.running = true; this.current = window.scrollY; requestAnimationFrame(() => this.frame()); }
  }
  frame() {
    const distance = this.target - this.current;
    if (Math.abs(distance) < 0.5) { this.current = this.target; window.scrollTo(0, this.current); this.running = false; return; }
    this.current += distance * 0.1;
    window.scrollTo(0, this.current);
    requestAnimationFrame(() => this.frame());
  }
}
export const smooth = SETTINGS.smoothScroll && finePointer && !reduceMotion.matches ? new SmoothScroll() : null;

function scrollToTarget(target) {
  const y = target.id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - $('#nav').offsetHeight * 0.6;
  if (smooth) smooth.to(y);
  else window.scrollTo({ top: y, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

document.addEventListener('click', (event) => {
  const link = event.target.closest && event.target.closest('a[href^="#"]');
  if (!link || link.getAttribute('href').length < 2) return;
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target) return;
  event.preventDefault();
  scrollToTarget(target);
  if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
  history.replaceState(null, '', link.getAttribute('href'));
});

/* la barre de navigation prend son fond une fois l'ouverture passée */
const hero = $('.hero');
if (hero) new IntersectionObserver(([entry]) => $('#nav').classList.toggle('is-solid', !entry.isIntersecting), { rootMargin: '-90% 0px 0px 0px' }).observe(hero);
else $('#nav').classList.add('is-solid');

/* ==========================================================================
   3. Apparitions au défilement : les photos s'ouvrent, les textes montent, une seule fois
   ========================================================================== */
function watchInView() {
  const targets = [...document.querySelectorAll('[data-inview]')];
  if (!targets.length || reduceMotion.matches || !('IntersectionObserver' in window)) return;
  root.classList.add('inview-on');                     // l'état caché n'existe que si ce script tourne
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  targets.forEach((target) => observer.observe(target));
}

/* ==========================================================================
   Départ
   ========================================================================== */
export const introDone = runIntro();
watchInView();
