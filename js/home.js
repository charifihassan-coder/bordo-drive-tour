/**
 * Bordo Drive Tour — page vitrine : le diaporama du véhicule.
 * Chaque photo s'ouvre par un volet (clip-path) pendant que l'image se pose (transform), puis dérive
 * lentement. Le diaporama avance seul tant qu'il est à l'écran ; il s'arrête au survol, au focus, sur le
 * bouton pause et sous « mouvement réduit ». Le socle (intro, défilement, navigation) est dans site.js.
 */
import { $, reduceMotion, EASE, pad2 } from './site.js';

const DWELL = 6000;          // durée d'affichage d'une photo, en millisecondes
const showcase = $('#showcase');

if (showcase) {
  const stage = $('#showcase-stage');
  const slides = [...stage.children];
  const index = $('#showcase-index');
  const label = $('#showcase-label');
  const caption = $('#showcase-caption');
  const progress = $('#showcase-progress');
  const toggle = $('#showcase-toggle');
  const still = reduceMotion.matches;

  let current = 0;
  let busy = false;          // un volet est en cours
  let userPaused = still;    // pause demandée par le bouton
  let held = false;          // pause le temps d'un survol ou d'un focus
  let inView = false;
  let timer = null;          // l'animation de la ligne de progression : c'est elle qui fait avancer
  let drift = null;          // la dérive lente de la photo affichée

  const playing = () => !userPaused && !held && inView && !still;

  function describe() {
    index.textContent = pad2(current + 1);
    label.textContent = slides[current].dataset.label;
    slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== current)));
  }

  function stop() {
    if (timer) { timer.onfinish = null; timer.cancel(); timer = null; }
  }

  /** Lance (ou relance) le compte à rebours de la photo affichée. */
  function start() {
    stop();
    if (!playing() || busy) return;
    timer = progress.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DWELL, easing: 'linear', fill: 'forwards' });
    timer.onfinish = () => go(1);
    if (!drift) drift = slides[current].querySelector('picture').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: DWELL + 1600, easing: 'linear', fill: 'forwards' });
    else drift.play();
  }

  /** Met en pause ou reprend, sans perdre l'avancement. */
  function sync() {
    showcase.classList.toggle('is-paused', userPaused);
    caption.setAttribute('aria-live', userPaused ? 'polite' : 'off');   // on n'annonce pas un diaporama qui défile seul
    toggle.setAttribute('aria-label', userPaused ? 'Relancer le diaporama' : 'Mettre le diaporama en pause');
    if (!playing()) { if (timer) timer.pause(); if (drift) drift.pause(); return; }
    if (timer) { timer.play(); if (drift) drift.play(); } else start();
  }

  function go(step) {
    if (busy || slides.length < 2) return;
    const from = slides[current];
    current = (current + step + slides.length) % slides.length;
    const to = slides[current];
    stop();
    describe();

    if (still) { from.classList.remove('is-active'); to.classList.add('is-active'); return; }

    busy = true;
    const direction = step > 0 ? 1 : -1;
    const leavingDrift = drift;
    drift = null;
    from.classList.replace('is-active', 'is-leaving');
    to.classList.add('is-active');
    to.querySelector('picture').getAnimations().forEach((animation) => animation.cancel());

    const wipe = to.animate(
      [{ clipPath: direction > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      { duration: 1100, easing: EASE },
    );
    to.querySelector('img').animate(
      [{ transform: `scale(1.14) translate3d(${direction * 3}%, 0, 0)` }, { transform: 'scale(1) translate3d(0, 0, 0)' }],
      { duration: 1500, easing: EASE },
    );
    from.querySelector('img').animate(
      [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${-direction * 4}%, 0, 0)` }],
      { duration: 1100, easing: EASE, fill: 'forwards' },
    );
    progress.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 500, easing: EASE });

    const settle = () => {
      from.classList.remove('is-leaving');
      from.querySelector('img').getAnimations().forEach((animation) => animation.cancel());
      if (leavingDrift) leavingDrift.cancel();
      busy = false;
      start();
    };
    wipe.finished.then(settle, settle);
  }

  $('#showcase-prev').addEventListener('click', () => go(-1));
  $('#showcase-next').addEventListener('click', () => go(1));
  toggle.addEventListener('click', () => { userPaused = !userPaused; sync(); });
  if (still) toggle.hidden = true;                       // rien ne défile seul : le bouton pause n'a pas d'objet

  showcase.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  });

  // survol et focus : on laisse le temps de regarder
  showcase.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { held = true; sync(); } });
  showcase.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') { held = false; sync(); } });
  showcase.addEventListener('focusin', () => { held = true; sync(); });
  showcase.addEventListener('focusout', (event) => { if (!showcase.contains(event.relatedTarget)) { held = false; sync(); } });

  // au doigt : balayage horizontal
  let swipe = null;
  stage.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') swipe = { id: event.pointerId, x: event.clientX, y: event.clientY }; });
  stage.addEventListener('pointerup', (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { swipe = null; });

  // le diaporama n'avance que lorsqu'il est à l'écran
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0.4 }).observe(stage);

  $('#showcase-total').textContent = `/ ${pad2(slides.length)}`;
  describe();
  sync();
}
