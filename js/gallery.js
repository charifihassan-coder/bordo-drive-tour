/**
 * Bordo Drive Tour — page galerie : filtres animés (FLIP), survol, curseur « Explorer », visionneuse.
 * Le socle (intro, défilement, navigation) est dans site.js.
 */
import { root, $, reduceMotion, finePointer, EASE, EASE_OUT, pad2, smooth } from './site.js';
import { packBento, sizesFor } from './layout.js';

const photos = JSON.parse($('#gallery-data').textContent);
const photoById = new Map(photos.map((p) => [p.id, p]));

/* ==========================================================================
   1. Grille : apparition des images, filtres animés (FLIP)
   ========================================================================== */
const grid = $('#g-grid');
const items = [...grid.children];
const filterButtons = [...document.querySelectorAll('.filter')];
const countLabel = $('#g-count');
const status = $('#g-status');
let visible = items.slice();
let activeFilter = 'all';
let filtering = false;

for (const img of grid.querySelectorAll('img')) {
  if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
  else { img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true }); img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true }); }
}

/** Pose chaque photo visible dans sa cellule (bandes pleines, voir js/layout.js). */
function layout(list) {
  const { cells } = packBento(list.map((el) => ({ id: el.dataset.id, kind: el.dataset.kind })));
  for (const el of list) {
    const cell = cells.get(el.dataset.id);
    el.style.gridColumn = `${cell.col} / span ${cell.span}`;
    el.style.gridRow = `${cell.row} / span ${cell.rows}`;
    const sizes = sizesFor(cell.span);
    el.querySelectorAll('source').forEach((source) => { source.sizes = sizes; });
  }
}

const inView = (rect) => rect.bottom > -200 && rect.top < window.innerHeight + 200;

async function applyFilter(filter) {
  if (filter === activeFilter || filtering) return;
  filtering = true;
  const animate = !reduceMotion.matches;
  const next = items.filter((el) => filter === 'all' || el.dataset.cat === filter);
  const leaving = visible.filter((el) => !next.includes(el));
  const first = new Map(visible.map((el) => [el, el.getBoundingClientRect()]));

  filterButtons.forEach((button) => {
    const on = button.dataset.filter === filter;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', String(on));
  });

  // 1. les photos qui sortent s'effacent
  if (animate && leaving.length) {
    await Promise.all(leaving.filter((el) => inView(first.get(el))).map((el) => el.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97)' }],
      { duration: 240, easing: 'ease-out', fill: 'forwards' },
    ).finished.catch(() => {})));
  }
  leaving.forEach((el) => { el.hidden = true; el.getAnimations().forEach((animation) => animation.cancel()); });
  next.forEach((el) => { el.hidden = false; });

  // 2. nouvelle composition
  layout(next);

  // 3. celles qui restent glissent de leur ancienne place à la nouvelle ; les nouvelles montent
  if (animate) {
    let entering = 0;
    for (const el of next) {
      const last = el.getBoundingClientRect();
      const before = first.get(el);
      if (before && before.width) {
        if (!inView(before) && !inView(last)) continue;
        el.animate([
          { transform: `translate(${before.left - last.left}px, ${before.top - last.top}px) scale(${before.width / last.width}, ${before.height / last.height})` },
          { transform: 'none' },
        ], { duration: 820, easing: EASE });
      } else if (inView(last)) {
        el.animate(
          [{ opacity: 0, transform: 'translate3d(0, 28px, 0) scale(0.985)' }, { opacity: 1, transform: 'none' }],
          { duration: 760, delay: 120 + Math.min(entering++, 8) * 55, easing: EASE_OUT, fill: 'backwards' },
        );
      }
    }
  }

  visible = next;
  activeFilter = filter;
  countLabel.textContent = pad2(next.length);
  const label = filter === 'all' ? 'toutes les photos' : filterButtons.find((b) => b.dataset.filter === filter).firstChild.textContent.trim();
  status.textContent = `${next.length} image${next.length > 1 ? 's' : ''} affichée${next.length > 1 ? 's' : ''} : ${label}`;
  if (smooth) smooth.sync();
  filtering = false;
}

filterButtons.forEach((button) => button.addEventListener('click', () => { if (!button.disabled) applyFilter(button.dataset.filter); }));

/* ==========================================================================
   2. Survol : parallaxe interne à la carte, curseur « Explorer »
   ========================================================================== */
if (finePointer && !reduceMotion.matches) {
  grid.addEventListener('pointermove', (event) => {
    const card = event.target.closest('.g-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
    card.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
  }, { passive: true });

  const cursor = $('#cursor');
  root.classList.add('has-cursor');
  let x = 0, y = 0, targetX = 0, targetY = 0, on = false, frame = 0;
  const follow = () => {
    x += (targetX - x) * 0.22;
    y += (targetY - y) * 0.22;
    cursor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    frame = on || Math.abs(targetX - x) > 0.3 || Math.abs(targetY - y) > 0.3 ? requestAnimationFrame(follow) : 0;
  };
  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    const over = Boolean(event.target.closest && event.target.closest('.g-card')) && !root.classList.contains('lb-open');
    if (over !== on) {
      on = over;
      if (on && !frame) { x = targetX; y = targetY; }
      cursor.classList.toggle('is-on', on);
    }
    if (!frame) frame = requestAnimationFrame(follow);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { on = false; cursor.classList.remove('is-on'); });
}

/* ==========================================================================
   3. Visionneuse plein écran
   ========================================================================== */
const lightbox = $('#lightbox');
const lb = {
  bg: $('#lb-bg'), frame: $('#lb-frame'), img: $('#lb-img'), avif: $('#lb-avif'), webp: $('#lb-webp'), stage: $('#lb-stage'),
  current: $('#lb-current'), total: $('#lb-total'), cat: $('#lb-cat'), title: $('#lb-title'), credit: $('#lb-credit'),
  ui: [...lightbox.querySelectorAll('.lb__ui')],
};
let order = [];
let index = 0;
let lbBusy = false;
let wheelLocked = false;

const cardOf = (photo) => grid.querySelector(`.g-item[data-id="${photo.id}"] .g-card`);

/** Affiche la photo d'indice `index` dans le cadre. `seed` : un fichier déjà en cache, montré le temps du chargement. */
function render(seed) {
  const photo = order[index];
  lb.frame.style.setProperty('--ar', photo.ratio);
  lb.frame.style.setProperty('--lq', `url('${photo.lqip}')`);
  lb.frame.style.setProperty('--cap', `${Math.round(photo.w * 1.5)}px`);   // une petite photo n'est pas étirée outre mesure
  lb.img.alt = photo.alt;
  lb.img.width = photo.w;
  lb.img.height = photo.h;
  const width = Math.max(320, Math.round(lb.frame.getBoundingClientRect().width));
  lb.avif.removeAttribute('srcset');
  lb.webp.removeAttribute('srcset');
  if (seed) lb.img.src = seed; else lb.img.removeAttribute('src');
  lb.avif.sizes = lb.webp.sizes = `${width}px`;
  lb.avif.srcset = photo.avif;
  lb.webp.srcset = photo.webp;
  lb.current.textContent = pad2(index + 1);
  lb.total.textContent = pad2(order.length);
  lb.cat.textContent = photo.catLabel;
  lb.title.textContent = photo.title;
  lb.credit.textContent = photo.credit ? `Photo : ${photo.credit}` : '';
}

/** Le cadre d'une vignette, vu depuis le cadre final : translation, échelle et recadrage (object-fit: cover). */
function flipFrom(thumbRect) {
  const to = lb.frame.getBoundingClientRect();
  const scale = Math.max(thumbRect.width / to.width, thumbRect.height / to.height);
  const insetX = Math.max(0, (to.width - thumbRect.width / scale) / 2);
  const insetY = Math.max(0, (to.height - thumbRect.height / scale) / 2);
  const dx = thumbRect.left + thumbRect.width / 2 - (to.left + to.width / 2);
  const dy = thumbRect.top + thumbRect.height / 2 - (to.top + to.height / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px)` };
}
const REST = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px)' };

function openLightbox(card) {
  if (lightbox.open) return;
  order = visible.map((el) => photoById.get(el.dataset.id));
  index = order.findIndex((photo) => photo.id === card.closest('.g-item').dataset.id);
  const thumb = card.querySelector('img');
  const thumbRect = thumb.getBoundingClientRect();

  root.classList.add('lb-open');
  if (smooth) smooth.enabled = false;
  lightbox.showModal();
  render(thumb.currentSrc);

  if (reduceMotion.matches) return;
  lb.bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
  lb.frame.animate([flipFrom(thumbRect), REST], { duration: 760, easing: EASE });
  lb.ui.forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 1, transform: 'none' }],
    { duration: 620, delay: 300 + i * 50, easing: EASE_OUT, fill: 'backwards' },
  ));
}

async function closeLightbox() {
  if (!lightbox.open || lbBusy) return;
  lbBusy = true;
  const card = cardOf(order[index]);
  if (!reduceMotion.matches) {
    const thumbRect = card ? card.getBoundingClientRect() : null;
    const toThumb = thumbRect && thumbRect.width && inView(thumbRect);
    lb.ui.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }));
    const fade = lb.bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'ease-in', fill: 'forwards' });
    const frame = lb.frame.animate(
      toThumb ? [REST, flipFrom(thumbRect)] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }],
      { duration: toThumb ? 620 : 320, easing: EASE, fill: 'forwards' },
    );
    await Promise.all([fade.finished, frame.finished]).catch(() => {});
  }
  lightbox.close();
  [lb.bg, lb.frame, ...lb.ui].forEach((el) => el.getAnimations().forEach((animation) => animation.cancel()));
  root.classList.remove('lb-open');
  if (smooth) { smooth.enabled = true; smooth.sync(); }
  if (card) card.focus({ preventScroll: true });
  lbBusy = false;
}

async function go(step) {
  if (lbBusy || order.length < 2) return;
  lbBusy = true;
  index = (index + step + order.length) % order.length;
  if (reduceMotion.matches) { render(); lbBusy = false; return; }
  await lb.frame.animate(
    [{ opacity: 1, transform: 'translate3d(0, 0, 0)' }, { opacity: 0, transform: `translate3d(${-36 * step}px, 0, 0)` }],
    { duration: 200, easing: 'ease-in', fill: 'forwards' },
  ).finished.catch(() => {});
  render();
  lb.frame.getAnimations().forEach((animation) => animation.cancel());
  lb.frame.animate(
    [{ opacity: 0, transform: `translate3d(${44 * step}px, 0, 0)` }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
    { duration: 520, easing: EASE_OUT },
  );
  lbBusy = false;
}

grid.addEventListener('click', (event) => {
  const card = event.target.closest('.g-card');
  if (!card || event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
  event.preventDefault();
  openLightbox(card);
});

$('#lb-close').addEventListener('click', closeLightbox);
$('#lb-prev').addEventListener('click', () => go(-1));
$('#lb-next').addEventListener('click', () => go(1));
lightbox.addEventListener('cancel', (event) => { event.preventDefault(); closeLightbox(); });       // Échap
lightbox.addEventListener('click', (event) => { if (event.target === lb.bg || event.target === lb.stage || event.target.classList.contains('lb__figure')) closeLightbox(); });
lightbox.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  else if (event.key === 'Home') { event.preventDefault(); go(-index); }
  else if (event.key === 'End') { event.preventDefault(); go(order.length - 1 - index); }
  else if (event.key === 'Tab') {                                 // le focus tourne dans la visionneuse
    const focusable = [...lightbox.querySelectorAll('button, a[href]')].filter((el) => el.offsetParent !== null);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

// molette : une photo par geste
lightbox.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (wheelLocked || Math.abs(delta) < 24) return;
  wheelLocked = true;
  go(delta > 0 ? 1 : -1);
  window.setTimeout(() => { wheelLocked = false; }, 620);
}, { passive: false });

// doigt : balayage horizontal pour naviguer, vers le bas pour fermer
let swipe = null;
lb.stage.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || event.target.closest('button')) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
});
lb.stage.addEventListener('pointermove', (event) => {
  if (!swipe || event.pointerId !== swipe.id || lbBusy) return;
  swipe.dx = event.clientX - swipe.x;
  swipe.dy = event.clientY - swipe.y;
  const horizontal = Math.abs(swipe.dx) > Math.abs(swipe.dy);
  lb.frame.style.transform = horizontal ? `translate3d(${swipe.dx * 0.6}px, 0, 0)` : `translate3d(0, ${Math.max(0, swipe.dy) * 0.6}px, 0)`;
});
const endSwipe = (event) => {
  if (!swipe || event.pointerId !== swipe.id) return;
  const { dx, dy } = swipe;
  swipe = null;
  lb.frame.style.transform = '';
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  else if (dy > 96 && dy > Math.abs(dx)) closeLightbox();
};
lb.stage.addEventListener('pointerup', endSwipe);
lb.stage.addEventListener('pointercancel', endSwipe);
