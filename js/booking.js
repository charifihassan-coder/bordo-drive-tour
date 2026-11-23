/**
 * Bordo Drive Tour — page Réserver : le client compose ses journées, le programme se calcule,
 * puis la demande part par WhatsApp, SMS ou e-mail depuis sa propre messagerie.
 * Aucun serveur : rien n'est transmis par le site lui-même. Le brouillon reste dans le navigateur.
 * Étapes, durées, temps de route et contacts : data/reservation.json.
 */
import { $, pad2, clamp } from './site.js';

const data = JSON.parse($('#booking-data').textContent);
const stopById = new Map(data.etapes.map((stop) => [stop.id, stop]));
const STORE = 'bdt-reservation';
const START_ZONE = 'bordeaux';

/* ---------- temps de route entre deux zones ---------- */
const routes = new Map();
for (const [a, b, minutes] of data.routes) { routes.set(`${a}|${b}`, minutes); routes.set(`${b}|${a}`, minutes); }
const drive = (from, to) => (from === to ? 0 : routes.get(`${from}|${to}`) ?? 0);

/* ---------- état ---------- */
const newDay = (time = data.heureDepart) => ({ date: '', time, stops: [], minutes: {}, back: true });
const blank = () => ({ days: [newDay()], active: 0, passengers: 2, seats: 0, name: '', phone: '', pickup: '', note: '' });

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (!saved || !Array.isArray(saved.days) || !saved.days.length) return blank();
    const days = saved.days.slice(0, data.maxJours).map((d) => ({
      date: typeof d.date === 'string' ? d.date : '',
      time: /^\d\d:\d\d$/.test(d.time) ? d.time : data.heureDepart,
      stops: Array.isArray(d.stops) ? d.stops.filter((id) => stopById.has(id)) : [],
      minutes: d.minutes && typeof d.minutes === 'object' ? d.minutes : {},
      back: d.back !== false,
    }));
    return {
      ...blank(), ...saved, days,
      active: clamp(Number(saved.active) || 0, 0, days.length - 1),
      passengers: clamp(Number(saved.passengers) || 2, 1, data.maxPassagers),
      seats: clamp(Number(saved.seats) || 0, 0, 4),
    };
  } catch { return blank(); }
}

let state = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* stockage indisponible : pas de brouillon */ } };
const day = () => state.days[state.active];

/* ---------- formats ---------- */
const toMinutes = (hhmm) => { const [h, m] = String(hhmm || data.heureDepart).split(':').map(Number); return h * 60 + m; };
const clock = (minutes) => { const m = ((minutes % 1440) + 1440) % 1440; return `${Math.floor(m / 60)} h ${pad2(m % 60)}`; };
const span = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${pad2(minutes % 60)}` : ''}`);
const asDate = (iso) => new Date(`${iso}T12:00:00`);
const dateLong = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(asDate(iso)) : '');
const dateShort = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(asDate(iso)) : 'date à choisir');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoOf(d); };
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const realStops = (d) => d.stops.filter((id) => stopById.get(id).zone);

/* ==========================================================================
   Le programme d'une journée : départ, routes, étapes, retour
   ========================================================================== */
function plan(d) {
  const start = toMinutes(d.time);
  let at = start, zone = START_ZONE, driving = 0;
  const rows = [{ kind: 'start', at, label: `Départ de ${data.depart}` }];
  const road = (to) => {
    const minutes = drive(zone, to);
    if (minutes) { rows.push({ kind: 'road', minutes }); at += minutes; driving += minutes; }
    zone = to;
  };
  d.stops.forEach((id, index) => {
    const stop = stopById.get(id);
    if (stop.zone) road(stop.zone);                         // la pause déjeuner se prend là où l'on est
    const minutes = d.minutes[id] ?? stop.minutes;
    rows.push({ kind: 'stop', at, id, index, minutes, label: stop.long || stop.nom });
    at += minutes;
  });
  if (d.stops.length) {
    if (d.back) { road(START_ZONE); rows.push({ kind: 'end', at, label: `Retour à ${data.depart}` }); }
    else rows.push({ kind: 'end', at, label: 'Fin du trajet' });
  }
  const total = at - start;
  const format = !d.stops.length ? '' : !d.back ? 'Transfert'
    : total <= data.seuils.demiJournee ? 'Demi-journée'
    : total <= data.seuils.journee ? 'Journée complète' : 'Programme sur mesure';
  return { rows, total, driving, format, end: at };
}

/** Le tarif de référence d'une formule (data/reservation.json, « tarifs ») ; hors formule : sur devis. */
function priceOf(format) {
  const formule = data.tarifs.formules.find((f) => f.nom === format);
  return formule ? `${formule.prix} € (${formule.heures} h et ${formule.km} km inclus)` : 'sur devis';
}

/* ==========================================================================
   Affichage
   ========================================================================== */
const el = {
  days: $('#days'), date: $('#f-date'), time: $('#f-time'), back: $('#f-back'), stops: $('#stops'), presets: $('#presets'),
  name: $('#f-name'), phone: $('#f-phone'), pickup: $('#f-pickup'), note: $('#f-note'), pax: $('#f-pax'), seats: $('#f-seats'),
  summary: $('#summary'), title: $('#p-sum-title'), status: $('#status'),
  whatsapp: $('#send-whatsapp'), sms: $('#send-sms'), email: $('#send-email'),
};

function renderDays() {
  const many = state.days.length > 1;
  el.days.innerHTML = state.days.map((d, i) => `<span class="day-wrap">
      <button type="button" class="day-chip" data-day="${i}" aria-pressed="${i === state.active}">Jour ${i + 1}<small>${esc(dateShort(d.date))}</small></button>${many
        ? `<button type="button" class="day-chip__x" data-remove="${i}" aria-label="Supprimer le jour ${i + 1}">×</button>` : ''}
    </span>`).join('')
    + `<button type="button" class="day-chip day-chip--add" data-add ${state.days.length >= data.maxJours ? 'disabled' : ''}>+ Ajouter une journée</button>`;
}

function renderBuilder() {
  const d = day();
  el.date.min = tomorrow();
  el.date.value = d.date;
  el.time.value = d.time;
  el.back.checked = d.back;
  for (const button of el.stops.querySelectorAll('.stop')) {
    const order = d.stops.indexOf(button.dataset.stop);
    button.setAttribute('aria-pressed', String(order > -1));
    button.querySelector('.stop__badge').textContent = order > -1 ? order + 1 : '';
  }
  el.pax.textContent = state.passengers;
  el.seats.textContent = state.seats;
}

function renderSummary() {
  const filled = state.days.filter((d) => d.stops.length);
  const stopCount = filled.reduce((n, d) => n + realStops(d).length, 0);
  el.title.textContent = filled.length ? `${plural(filled.length, 'journée')}, ${plural(stopCount, 'étape')}` : 'Aucune étape pour l’instant';

  el.summary.innerHTML = state.days.map((d, i) => {
    const p = plan(d);
    const head = `<h3>${state.days.length > 1 ? `Jour ${i + 1}` : 'Votre journée'}<span>${esc(dateLong(d.date) || 'Date à choisir')}</span></h3>`;
    if (!d.stops.length) return `<section class="day-plan">${head}<p class="summary__empty">Choisissez un programme ou une première étape.</p></section>`;
    const last = d.stops.length - 1;
    const rows = p.rows.map((r) => {
      if (r.kind === 'road') return `<li class="tl tl--road"><span class="tl__label">${span(r.minutes)} de route</span></li>`;
      if (r.kind !== 'stop') return `<li class="tl tl--${r.kind}"><span class="tl__time">${clock(r.at)}</span><span class="tl__label">${esc(r.label)}</span></li>`;
      const tool = (act, label, text, disabled = false) => `<button type="button" data-act="${act}" data-day="${i}" data-index="${r.index}" aria-label="${label} : ${esc(r.label)}"${disabled ? ' disabled' : ''}>${text}</button>`;
      return `<li class="tl tl--stop">
          <span class="tl__time">${clock(r.at)}</span>
          <span class="tl__label">${esc(r.label)}${r.minutes ? `<small>${span(r.minutes)} sur place</small>` : ''}</span>
          <span class="tl__tools">
            ${tool('up', 'Avancer', '↑', r.index === 0)}${tool('down', 'Reculer', '↓', r.index === last)}${tool('less', 'Raccourcir de 30 minutes', '−', r.minutes <= 30)}${tool('more', 'Allonger de 30 minutes', '+', r.minutes >= 300)}${tool('remove', 'Retirer', '×')}
          </span>
        </li>`;
    }).join('');
    const warn = ` Tarif de référence : ${priceOf(p.format)}.`;
    return `<section class="day-plan">${head}
        <p class="day-plan__meta">${p.format} · environ ${span(p.total)}${p.driving ? `, dont ${span(p.driving)} de route` : ''}.${warn}</p>
        <ol class="timeline">${rows}</ol>
      </section>`;
  }).join('');

  renderSend();
}

/* ==========================================================================
   La demande : texte, liens d'envoi, agenda
   ========================================================================== */
function message() {
  const lines = ['Demande de réservation – Bordo Drive Tour', ''];
  lines.push(`Nom : ${state.name.trim() || '(à préciser)'}`);
  if (state.phone.trim()) lines.push(`Téléphone : ${state.phone.trim()}`);
  lines.push(`Passagers : ${state.passengers}${state.seats ? ` (dont ${plural(state.seats, 'siège')} auto enfant)` : ''}`);
  if (state.pickup.trim()) lines.push(`Prise en charge : ${state.pickup.trim()}`);
  state.days.forEach((d, i) => {
    if (!d.stops.length) return;
    const p = plan(d);
    lines.push('', `${state.days.length > 1 ? `Jour ${i + 1} – ` : ''}${dateLong(d.date) || 'date à préciser'} · ${p.format}, environ ${span(p.total)}`);
    lines.push(`Tarif de référence : ${priceOf(p.format)}`);
    for (const r of p.rows) if (r.kind !== 'road') lines.push(`• ${clock(r.at)} ${r.label}${r.kind === 'stop' && r.minutes ? ` (${span(r.minutes)})` : ''}`);
  });
  if (state.note.trim()) lines.push('', `Message : ${state.note.trim()}`);
  lines.push('', 'Horaires et tarif estimés, à confirmer par Bordo Drive Tour.');
  return lines.join('\n');
}

function renderSend() {
  const text = encodeURIComponent(message());
  const { sms, whatsapp, email } = data.contact;
  el.whatsapp.hidden = !whatsapp;
  el.sms.hidden = !sms;
  el.email.hidden = !email;
  if (whatsapp) el.whatsapp.href = `https://wa.me/${whatsapp}?text=${text}`;
  if (sms) el.sms.href = `sms:${sms}?&body=${text}`;
  if (email) el.email.href = `mailto:${email}?subject=${encodeURIComponent('Demande de réservation')}&body=${text}`;
}

function calendarFile() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const text = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const local = (iso, minutes) => { const d = new Date(`${iso}T00:00:00`); d.setMinutes(minutes); return `${isoOf(d).replace(/-/g, '')}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`; };
  const events = state.days.filter((d) => d.date && d.stops.length).map((d, i) => {
    const p = plan(d);
    const programme = p.rows.filter((r) => r.kind !== 'road').map((r) => `${clock(r.at)} ${r.label}`).join('\n');
    return [
      'BEGIN:VEVENT', `UID:${Date.now()}-${i}@bordo-drive-tour`, `DTSTAMP:${stamp}`,
      `DTSTART:${local(d.date, toMinutes(d.time))}`, `DTEND:${local(d.date, p.end)}`,
      `SUMMARY:${text(`Bordo Drive Tour : ${p.format.toLowerCase()} (demande à confirmer)`)}`,
      `DESCRIPTION:${text(`${programme}\n\nHoraires estimés, à confirmer par Bordo Drive Tour.`)}`,
      state.pickup.trim() ? `LOCATION:${text(state.pickup.trim())}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bordo Drive Tour//Reservation//FR', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

/* ==========================================================================
   Contrôles avant envoi
   ========================================================================== */
const errors = { date: $('#f-date-err'), name: $('#f-name-err'), stops: $('#stops-err') };
function mark(field, input, text) {
  errors[field].textContent = text || '';
  errors[field].hidden = !text;
  if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
}
const clearMarks = () => { mark('date', el.date); mark('name', el.name); mark('stops'); };

/** Renvoie le premier défaut de la demande, ou rien. `full` : avec le nom (pas nécessaire pour l'agenda). */
function firstProblem(full = true) {
  for (const [i, d] of state.days.entries()) {
    if (!realStops(d).length) return { day: i, field: 'stops', focus: el.stops.querySelector('.stop'), text: `Choisissez au moins une étape pour le jour ${i + 1}.` };
    if (!d.date) return { day: i, field: 'date', input: el.date, focus: el.date, text: `Indiquez la date du jour ${i + 1}.` };
    if (d.date < tomorrow()) return { day: i, field: 'date', input: el.date, focus: el.date, text: 'Choisissez une date à partir de demain. Pour aujourd’hui, appelez-nous.' };
  }
  if (full && !state.name.trim()) return { field: 'name', input: el.name, focus: el.name, text: 'Indiquez le nom de la personne qui réserve.' };
  return null;
}

function ready(full = true) {
  clearMarks();
  const problem = firstProblem(full);
  if (!problem) return true;
  if (problem.day !== undefined && problem.day !== state.active) { state.active = problem.day; render(); }
  mark(problem.field, problem.input, problem.text);
  el.status.textContent = problem.text;
  problem.focus.focus();
  problem.focus.scrollIntoView({ block: 'center', behavior: 'auto' });
  return false;
}

/* ==========================================================================
   Interactions
   ========================================================================== */
function render() { renderDays(); renderBuilder(); renderSummary(); save(); }
const say = (text) => { el.status.textContent = text; };

el.days.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-day]');
  const remove = event.target.closest('[data-remove]');
  if (event.target.closest('[data-add]')) {
    if (state.days.length >= data.maxJours) return;
    state.days.push(newDay(day().time));
    state.active = state.days.length - 1;
  } else if (remove) {
    state.days.splice(Number(remove.dataset.remove), 1);
    state.active = clamp(state.active, 0, state.days.length - 1);
  } else if (chip) state.active = Number(chip.dataset.day);
  else return;
  clearMarks();
  render();
  const current = el.days.querySelector(`[data-day="${state.active}"]`);
  if (current) current.focus();
});

el.date.addEventListener('change', () => { day().date = el.date.value; mark('date', el.date); render(); });
el.time.addEventListener('change', () => { day().time = el.time.value || data.heureDepart; render(); });
el.back.addEventListener('change', () => { day().back = el.back.checked; render(); });

el.presets.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset]');
  if (!button) return;
  const preset = data.programmes[Number(button.dataset.preset)];
  Object.assign(day(), { stops: [...preset.etapes], minutes: { ...(preset.minutes || {}) }, back: preset.retour });
  mark('stops');
  render();
  say(`Programme « ${preset.nom} » appliqué au jour ${state.active + 1}.`);
});

el.stops.addEventListener('click', (event) => {
  const button = event.target.closest('.stop');
  if (!button) return;
  const d = day(), id = button.dataset.stop, at = d.stops.indexOf(id);
  if (at > -1) { d.stops.splice(at, 1); delete d.minutes[id]; } else d.stops.push(id);
  mark('stops');
  render();
});

el.summary.addEventListener('click', (event) => {
  const button = event.target.closest('[data-act]');
  if (!button || button.disabled) return;
  const { act } = button.dataset, d = state.days[Number(button.dataset.day)];
  let index = Number(button.dataset.index);
  const id = d.stops[index], minutes = d.minutes[id] ?? stopById.get(id).minutes;
  if (act === 'up' && index > 0) { d.stops.splice(index - 1, 0, d.stops.splice(index, 1)[0]); index -= 1; }
  else if (act === 'down' && index < d.stops.length - 1) { d.stops.splice(index + 1, 0, d.stops.splice(index, 1)[0]); index += 1; }
  else if (act === 'less') d.minutes[id] = Math.max(30, minutes - 30);
  else if (act === 'more') d.minutes[id] = Math.min(300, minutes + 30);
  else if (act === 'remove') { d.stops.splice(index, 1); delete d.minutes[id]; }
  render();
  // le focus suit l'étape déplacée
  const same = el.summary.querySelector(`[data-act="${act}"][data-day="${button.dataset.day}"][data-index="${index}"]:not(:disabled)`);
  const fallback = el.summary.querySelector(`[data-day="${button.dataset.day}"][data-index="${Math.min(index, d.stops.length - 1)}"]:not(:disabled)`);
  (same || fallback || el.stops.querySelector('.stop')).focus();
});

document.addEventListener('click', (event) => {
  const step = event.target.closest('[data-step]');
  if (!step) return;
  const by = Number(step.dataset.by);
  if (step.dataset.step === 'passengers') state.passengers = clamp(state.passengers + by, 1, data.maxPassagers);
  else state.seats = clamp(state.seats + by, 0, 4);
  state.seats = Math.min(state.seats, Math.max(0, state.passengers - 1));     // au moins un adulte à bord
  render();
});

for (const [key, input] of [['name', el.name], ['phone', el.phone], ['pickup', el.pickup], ['note', el.note]]) {
  input.value = state[key];
  input.addEventListener('input', () => { state[key] = input.value; if (key === 'name') mark('name', el.name); renderSend(); save(); });
}

for (const link of [el.whatsapp, el.sms, el.email]) {
  link.addEventListener('click', (event) => {
    if (!ready()) { event.preventDefault(); return; }
    renderSend();
    say('Votre messagerie s’ouvre avec la demande rédigée : il reste à l’envoyer. Votre chauffeur confirme la veille du départ.');
  });
}

$('#send-copy').addEventListener('click', async () => {
  if (!ready()) return;
  const text = message();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
  }
  say('Demande copiée. Collez-la dans le message de votre choix.');
});

$('#send-ics').addEventListener('click', () => {
  if (!ready(false)) return;
  const url = URL.createObjectURL(new Blob([calendarFile()], { type: 'text/calendar;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'bordo-drive-tour.ics' });
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  say('Fichier d’agenda téléchargé. La réservation reste à confirmer par Bordo Drive Tour.');
});

$('#send-reset').addEventListener('click', () => {
  state = blank();
  for (const [key, input] of [['name', el.name], ['phone', el.phone], ['pickup', el.pickup], ['note', el.note]]) input.value = state[key];
  clearMarks();
  render();
  say('Tout est effacé.');
});

render();
