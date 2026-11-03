// Practice builder, phone-first.
// The screen is just: name, total time, the list of blocks, and two big
// buttons: ＋ Add and ▶ Run. Everything else lives in sheets that slide up.
import { esc, $, $$, toast, modal, confirmBox, download } from './ui.js';
import { CATEGORIES, LEVELS, catColor, makeRotation, makeGoes, makeRest, drillToBlock, newId } from './seed.js';
import { blockDuration, practiceDuration, fmtDur, parseDur, clockTimeLabel, minutesBetween, GROUP } from './engine.js';
import { store, canEditPractice } from './store.js';
import { blockDetail, printPractice } from './print.js';
import { openShare } from './share.js';

let P = null, root = null, user = null, drills = [], saveTimer = null, saveState = 'saved', sortable = null, showDetails = false;

const clock = (sec) => fmtDur(sec).replace(' min', ':00');
const step = (sec) => sec < 60 ? 15 : sec < 120 ? 30 : 60;
const ADD_CATS = CATEGORIES.filter(c => !['Rest', 'Station'].includes(c.id));

export async function renderBuilder(el, practice, u, { isNew = false } = {}) {
  root = el; P = practice; user = u; showDetails = false; saveState = isNew ? 'new' : 'saved';
  P.blocks ||= [];
  drills = await store.listDrills();
  if (isNew) await saveNow(true);
  drawAll();
  if (isNew && !P.blocks.length) setTimeout(() => openAdd(), 150);
}

// ---- Saving ------------------------------------------------------------
function scheduleSave() { saveState = 'dirty'; paintTotals(); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 800); }
async function saveNow(silent) {
  clearTimeout(saveTimer); saveState = 'saving'; if (!silent) paintTotals();
  try {
    await store.savePractice(P); saveState = 'saved';
    if (!location.hash.startsWith('#/edit/')) history.replaceState(null, '', `#/edit/${P.id}`);
  } catch (e) { console.error(e); saveState = 'error'; toast('Save failed: ' + (e.code || e.message), 'error'); }
  if (!silent) paintTotals();
}
export function flushSave() { if (saveState === 'dirty') return saveNow(true); }
const changed = () => { scheduleSave(); drawList(); };

// ---- Page --------------------------------------------------------------
function drawAll() {
  root.innerHTML = `
    <div class="bh">
      <a class="btn ghost icon" href="#/practices" aria-label="Back">←</a>
      <input class="title-input" id="b-title" value="${esc(P.title)}" placeholder="PRACTICE NAME" aria-label="Practice name">
    </div>
    <div class="btot" id="b-tot"></div>
    <div class="catbar" id="b-bar" style="margin:8px 0 4px"></div>
    <button class="btn ghost sm" data-act="details" id="b-dtl" style="padding-left:0"></button>
    <div id="b-details"></div>
    <div class="blist" id="b-list"></div>
    <div class="bbar">
      <button class="btn primary xl grow" data-act="add">＋ Add</button>
      <button class="btn go xl" data-act="run">▶ Run</button>
    </div>`;
  $('#b-title').oninput = (e) => { P.title = e.target.value; scheduleSave(); };
  root.onclick = onClick;
  drawDetails(); drawList();
}

function paintTotals() {
  const total = practiceDuration(P);
  const target = minutesBetween(P.startTime, P.endTime) * 60;
  const diff = target ? total - target : 0;
  const st = { saved: '✓ Saved', saving: 'Saving…', dirty: 'Saving…', error: '⚠ Not saved', new: '' }[saveState];
  const t = $('#b-tot'); if (!t) return;
  t.innerHTML = `<span class="big">${clock(total)}</span>
    <span class="muted">${P.startTime ? `${clockTimeLabel(P.startTime, 0)} → ${clockTimeLabel(P.startTime, total)}` : ''}</span>
    ${target ? `<span class="badge ${Math.abs(diff) < 60 ? 'green' : diff > 0 ? 'red' : 'gold'}">${Math.abs(diff) < 60 ? 'On time' : diff > 0 ? `${Math.round(diff / 60)} min over` : `${Math.round(-diff / 60)} min left to fill`}</span>` : ''}
    <span class="grow"></span><span class="small muted">${st}</span>`;
  $('#b-bar').innerHTML = P.blocks.map(b => `<i style="width:${(blockDuration(b) / Math.max(1, total) * 100).toFixed(2)}%;background:${catColor(b.category)}"></i>`).join('');
  const d = $('#b-dtl');
  if (d) d.innerHTML = `${P.date ? new Date(P.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'} · ${(P.levels || []).join(', ') || 'All levels'} · ${{ team: 'Coaches', athletes: '+ Athletes', public: 'Public link' }[P.visibility || 'team']} <b style="color:var(--gold)">${showDetails ? 'Hide ▴' : 'Details & more ▾'}</b>`;
}

function drawDetails() {
  const el = $('#b-details'); if (!el) return;
  if (!showDetails) { el.innerHTML = ''; paintTotals(); return; }
  el.innerHTML = `<div class="card stack" style="margin:8px 0 14px">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <label class="field"><span class="tiny">Date</span><input type="date" class="input" data-pf="date" value="${esc(P.date || '')}"></label>
      <label class="field"><span class="tiny">Start</span><input type="time" class="input" data-pf="startTime" value="${esc(P.startTime || '')}"></label>
      <label class="field"><span class="tiny">Must end by</span><input type="time" class="input" data-pf="endTime" value="${esc(P.endTime || '')}"></label>
    </div>
    <label class="field"><span class="tiny">Focus of the day</span><input class="input" data-pf="notes" value="${esc(P.notes || '')}" placeholder="e.g. Finish on the single"></label>
    <div><div class="tiny" style="margin-bottom:6px">Levels</div><div class="row wrap" style="gap:6px">${LEVELS.map(l => `<button class="chip ${(P.levels || []).includes(l) ? 'on' : ''}" data-act="level" data-level="${l}">${l}</button>`).join('')}</div></div>
    <div><div class="tiny" style="margin-bottom:6px">Who can see it</div><div class="seg" style="display:flex;flex-wrap:wrap">${[['team', 'Coaches'], ['athletes', '+ Athletes'], ['public', 'Anyone with link']].map(([v, l]) => `<button class="${(P.visibility || 'team') === v ? 'on' : ''}" data-act="vis" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="toggle ${P.coEdit ? 'on' : ''}" data-act="coedit"><div><b>Any coach can edit</b><div class="small muted">Otherwise only you and admins can change it</div></div><div class="sw"></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      <button class="btn" data-act="print">🖨 Print</button><button class="btn" data-act="share">🔗 Share</button>
      <button class="btn" data-act="dupP">⧉ Duplicate</button><button class="btn" data-act="rests">💧 Rest between all</button>
      <button class="btn" data-act="export">⬇ Export file</button><button class="btn" data-act="cancelP">${P.canceled ? '↺ Un-cancel' : '⨯ Mark canceled'}</button>
      <button class="btn danger" data-act="delP">🗑 Delete</button>
    </div></div>`;
  el.oninput = (e) => { const f = e.target.dataset.pf; if (f) { P[f] = e.target.value; scheduleSave(); if (f !== 'notes') drawList(); } };
  paintTotals();
}

function rowHTML(b, start) {
  const fixed = b.type === 'drill' || b.type === 'rest';
  const sub = b.type === 'drill' ? [b.description, b.holdAtEnd ? 'coach-paced' : '', b.switchAtHalf ? 'switch at half' : ''].filter(Boolean).join(' · ') || b.category : blockDetail(b);
  return `<div class="rb" data-bid="${b.id}">
    <div class="stripe" style="background:${catColor(b.category)}"></div>
    <div class="rb-main" data-act="edit">
      <div class="rb-when">${P.startTime ? clockTimeLabel(P.startTime, start) : '+' + fmtDur(start)}</div>
      <div class="rb-t">${esc(b.type === 'rotation' ? (b.title || 'Stations') : b.title)}</div>
      <div class="rb-s">${esc(sub)}</div>
    </div>
    <div class="rb-time">${fixed ? `<button data-act="dur-" aria-label="Less time">−</button><span>${clock(b.durationSec)}</span><button data-act="dur+" aria-label="More time">+</button>` : `<span data-act="edit">${clock(blockDuration(b))}</span>`}</div>
  </div>`;
}

function drawList() {
  const list = $('#b-list'); if (!list) return;
  let t = 0;
  list.innerHTML = P.blocks.length ? P.blocks.map(b => { const s = t; t += blockDuration(b); return rowHTML(b, s); }).join('') + `<div class="small muted" style="text-align:center;padding:6px">Tap a drill to change it · press and hold to drag</div>`
    : `<button class="empty-add" data-act="add"><span>＋</span>Add your first drill</button>`;
  paintTotals();
  if (sortable) { sortable.destroy(); sortable = null; }
  if (window.Sortable && P.blocks.length > 1) sortable = Sortable.create(list, {
    draggable: '.rb', animation: 150, ghostClass: 'sortable-ghost', delay: 220, delayOnTouchOnly: true, filter: '.rb-time button', preventOnFilter: false,
    onEnd: (e) => { if (e.oldIndex === e.newIndex) return; const [m] = P.blocks.splice(e.oldIndex, 1); P.blocks.splice(e.newIndex, 0, m); changed(); },
  });
}

async function onClick(e) {
  const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
  const act = a.dataset.act;
  const b = P.blocks.find(x => x.id === a.closest('[data-bid]')?.dataset.bid);
  switch (act) {
    case 'add': return openAdd();
    case 'run': if (!P.blocks.length) return toast('Add some drills first', 'error'); await saveNow(true); location.hash = `#/run/${P.id}`; return;
    case 'edit': return openEdit(b);
    case 'dur-': case 'dur+': { const st = step(b.durationSec); b.durationSec = Math.max(15, b.durationSec + (act === 'dur+' ? st : -st)); return changed(); }
    case 'details': showDetails = !showDetails; return drawDetails();
    case 'level': { const l = a.dataset.level; P.levels = (P.levels || []).includes(l) ? P.levels.filter(x => x !== l) : [...(P.levels || []), l]; scheduleSave(); return drawDetails(); }
    case 'vis': P.visibility = a.dataset.v; scheduleSave(); return drawDetails();
    case 'coedit': P.coEdit = !P.coEdit; scheduleSave(); return drawDetails();
    case 'print': return printMenu();
    case 'share': await saveNow(true); return openShare(P, user, () => drawDetails());
    case 'export': return download(`${(P.title || 'practice').replace(/[^\w-]+/g, '_')}.practice.json`, JSON.stringify({ format: 'wrestling-practice/1', practice: P }, null, 2));
    case 'rests': return restBetween();
    case 'cancelP': P.canceled = !P.canceled; await saveNow(); toast(P.canceled ? 'Marked canceled' : 'Restored', 'success'); return drawDetails();
    case 'dupP': { await flushSave(); const c = JSON.parse(JSON.stringify(P)); delete c.id; delete c.createdAt; c.title = P.title + ' (copy)'; c.ownerUid = null; c.ownerName = null; c.canceled = false;
      await store.savePractice(c); toast('Duplicated', 'success'); location.hash = `#/edit/${c.id}`; return; }
    case 'delP': if (await confirmBox('Delete practice?', `"${P.title}" will be removed for every coach. Past run records stay in History.`, 'Delete')) { await store.deletePractice(P.id); toast('Deleted'); location.hash = '#/practices'; } return;
  }
}

// ---- Add sheet ---------------------------------------------------------
// Categories → drills. Tapping a drill adds it right away; keep tapping to add more.
export function openAdd({ single = false, onPick = null, title = null } = {}) {
  let view = 'cats', q = '', added = 0;
  const counts = {};
  const sorted = () => drills.slice().sort((a, b) => a.title.localeCompare(b.title));
  const drillRows = (list) => list.map(d => `<button class="dr" data-act="pick" data-did="${d.id}">
      <span class="dot" style="background:${catColor(d.category)}"></span>
      <span class="grow"><span class="dr-t">${d.type === 'series' ? '⟳ ' : ''}${esc(d.title)}</span><span class="dr-s">${d.type === 'series' ? `${d.moves.length} motions, each called out` : esc(d.description || d.category)}</span></span>
      <span class="dr-m">${clock(d.durationSec)}</span><span class="dr-plus" data-c="${d.id}">${counts[d.id] ? '✓' + (counts[d.id] > 1 ? counts[d.id] : '') : single ? '›' : '＋'}</span></button>`).join('') || '<div class="empty">Nothing matches.</div>';
  const body = () => {
    const search = `<input class="input" id="aq" placeholder="🔍 Search all ${drills.length} drills…" value="${esc(q)}" autocomplete="off">`;
    if (q) return `${search}<div class="drs">${drillRows(sorted().filter(d => (d.title + ' ' + (d.description || '') + ' ' + d.category).toLowerCase().includes(q.toLowerCase())))}</div>`;
    if (view === 'cats') return `${search}
      ${single ? '' : `<div class="quick">
        <button class="qa" data-act="q-water"><b>💧</b>Water 1:00</button>
        <button class="qa" data-act="q-rest"><b>⏸</b>Rest 2:00</button>
        <button class="qa" data-act="q-goes"><b>🤼</b>Live goes</button>
        <button class="qa" data-act="q-rot"><b>🔄</b>Stations</button>
        <button class="qa" data-act="q-split"><b>✂</b>Group split</button>
        <button class="qa" data-act="q-custom"><b>✎</b>New drill</button>
      </div>`}
      <div class="cats">${ADD_CATS.map(c => { const n = drills.filter(d => d.category === c.id).length; return n ? `<button class="cat" data-act="cat" data-cat="${c.id}" style="border-left-color:${c.color}"><b>${c.id}</b><span>${n}</span></button>` : ''; }).join('')}</div>`;
    return `<button class="btn ghost sm" data-act="back" style="padding-left:0">← All categories</button>
      <div class="section-title" style="margin-top:6px;border-color:${catColor(view)};color:${catColor(view)}">${esc(view)}</div>
      <div class="drs">${drillRows(sorted().filter(d => d.category === view))}</div>`;
  };
  const foot = () => single ? '' : `<button class="btn primary xl" data-act="close" style="width:100%">${added ? `Done · ${added} added` : 'Done'}</button>`;
  const m = modal({ title: title || (single ? 'Pick a move' : 'Add to practice'), body: body(), footer: foot(), wide: true,
    onAction: (act, el, w, close) => {
      const redraw = () => { w.querySelector('.mb').innerHTML = body(); bindSearch(); w.querySelector('.mb').scrollTop = 0; };
      if (act === 'cat') { view = el.dataset.cat; return redraw(); }
      if (act === 'back') { view = 'cats'; return redraw(); }
      if (act === 'pick') {
        const d = drills.find(x => x.id === el.dataset.did);
        if (single) { close(); return onPick(d); }
        P.blocks.push(drillToBlock(d)); added++; counts[d.id] = (counts[d.id] || 0) + 1;
        el.querySelector('.dr-plus').textContent = '✓' + (counts[d.id] > 1 ? counts[d.id] : '');
        el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 300);
        w.querySelector('.mf').innerHTML = foot(); changed(); return;
      }
      const quick = { 'q-water': () => ({ ...makeRest(60), title: 'Water' }), 'q-rest': () => makeRest(120), 'q-goes': makeGoes, 'q-rot': () => makeRotation(4, 'rotate'), 'q-split': () => makeRotation(4, 'split') }[act];
      if (quick) { const blk = quick(); P.blocks.push(blk); added++; changed(); toast(`Added ${blk.title}`, 'success');
        if (act === 'q-goes' || act === 'q-rot' || act === 'q-split') { close(); setTimeout(() => openEdit(blk), 50); } else w.querySelector('.mf').innerHTML = foot(); return; }
      if (act === 'q-custom') { close(); customDrill(); }
    } });
  const bindSearch = () => { const i = m.el.querySelector('#aq'); if (!i) return; i.oninput = () => { q = i.value; const pos = i.selectionStart; m.el.querySelector('.mb').innerHTML = body(); bindSearch(); const ni = m.el.querySelector('#aq'); ni.focus(); ni.setSelectionRange(pos, pos); }; };
  bindSearch();
}

// ---- Edit sheet --------------------------------------------------------
function stepper(field, sec, min = 15) {
  return `<div class="bigstep" data-field="${field}" data-min="${min}"><button data-act="st-" aria-label="Less">−</button><input value="${clock(sec)}" data-durfield="${field}" inputmode="numeric"><button data-act="st+" aria-label="More">+</button></div>`;
}
const toggle = (flag, on, label, sub) => `<div class="toggle ${on ? 'on' : ''}" data-act="flag" data-flag="${flag}"><div><b>${label}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><div class="sw"></div></div>`;
const catPick = (val) => `<select class="input" data-f="category">${CATEGORIES.map(c => `<option ${c.id === val ? 'selected' : ''}>${c.id}</option>`).join('')}</select>`;

function editBody(b) {
  if (b.type === 'rest') return `<div class="stack"><label class="field"><span class="tiny">Label</span><input class="input" data-f="title" value="${esc(b.title || 'Rest')}"></label>
    <div><div class="tiny">How long</div>${stepper('durationSec', b.durationSec)}</div></div>`;
  if (b.type === 'drill') return `<div class="stack">
    <div><div class="tiny">How long</div>${stepper('durationSec', b.durationSec)}</div>
    <label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
    <label class="field"><span class="tiny">What to show on the big screen</span><input class="input" data-f="description" value="${esc(b.description)}" placeholder="e.g. Elbow tie, underhooks"></label>
    ${toggle('switchAtHalf', b.switchAtHalf, 'Call "Switch!" at halfway', 'For partner or top/bottom swaps')}
    ${toggle('holdAtEnd', b.holdAtEnd, 'Coach-paced', 'Clock waits at 0:00 until you tap Next')}
    <details><summary class="small muted">More options</summary><div class="stack" style="margin-top:10px">
      <label class="field"><span class="tiny">Category</span>${catPick(b.category)}</label>
      <label class="field"><span class="tiny">Coaching cues (one per line)</span><textarea class="input" data-f="cues" rows="2">${esc((b.cues || []).join('\n'))}</textarea></label>
      <label class="field"><span class="tiny">Technique video link</span><input class="input" data-f="videoUrl" value="${esc(b.videoUrl || '')}"></label>
      <button class="btn" data-act="tolib">☆ Save this to the drill library</button></div></details></div>`;
  if (b.type === 'series') return `<div class="stack">
    <div class="small muted">Each motion is timed and called out on its own. Total ${clock(blockDuration(b))}.</div>
    <div class="row wrap" style="gap:6px"><span class="tiny">Set every motion to</span>${[20, 30, 45, 60].map(x => `<button class="chip" data-act="mv-all" data-s="${x}">${fmtDur(x)}</button>`).join('')}</div>
    ${b.moves.map((mv, k) => `<div class="mv" data-mi="${k}"><span class="mv-n">${k + 1}</span><input class="input" data-mf="title" value="${esc(mv.title)}">
      <div class="mv-t"><button data-act="mv-" aria-label="Less">−</button><span>${clock(mv.sec)}</span><button data-act="mv+" aria-label="More">+</button></div>
      <button class="btn ghost icon" data-act="mv-up" aria-label="Move up">↑</button><button class="btn ghost icon" data-act="mv-del" aria-label="Remove">✕</button></div>`).join('')}
    <div class="row wrap" style="gap:8px"><button class="btn" data-act="mv-add">＋ Add a motion</button><button class="btn" data-act="mv-lib">＋ From library</button></div>
    <label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
    <button class="btn" data-act="tolib">☆ Save this routine to the library${b.drillId ? ' (update)' : ''}</button></div>`;
  if (b.type === 'goes') return `<div class="stack">
    <label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><div class="tiny">How many goes</div><div class="bigstep"><button data-act="r-">−</button><input value="${b.rounds}" data-numfield="rounds" inputmode="numeric"><button data-act="r+">+</button></div></div>
      <div><div class="tiny">Each go</div>${stepper('workSec', b.workSec)}</div>
      <div><div class="tiny">Rest between</div>${stepper('restSec', b.restSec, 0)}</div>
    </div>
    <div class="small muted">Total ${clock(blockDuration(b))}</div>
    <label class="field"><span class="tiny">Situation / description</span><input class="input" data-f="description" value="${esc(b.description)}" placeholder="e.g. Start in on a single"></label>
    ${toggle('switchAtHalf', b.switchAtHalf, 'Call "Switch!" halfway through each go')}</div>`;
  const n = b.stations.length;
  return `<div class="stack">
    <div class="seg" style="display:flex"><button class="${b.mode !== 'split' ? 'on' : ''}" data-act="mode" data-mode="rotate">🔄 Groups rotate</button><button class="${b.mode === 'split' ? 'on' : ''}" data-act="mode" data-mode="split">✂ Groups stay put</button></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><div class="tiny">${b.mode === 'split' ? 'How long' : 'Time at each station'}</div>${stepper('stationSec', b.stationSec)}</div>
      ${b.mode === 'split' ? '' : `<div><div class="tiny">Time to rotate</div>${stepper('transitionSec', b.transitionSec || 0, 0)}</div>`}
    </div>
    <div class="small muted">${n} groups · total ${clock(blockDuration(b))}</div>
    <div class="tiny">Stations (letter = the group that starts there)</div>
    ${b.stations.map((s, si) => `<div class="st" data-si="${si}"><b>${GROUP(si)}</b><button class="btn grow st-pick" data-act="st-pick" style="justify-content:flex-start">${esc(s.title)}</button>${n > 2 ? `<button class="btn ghost icon" data-act="st-del" aria-label="Remove">✕</button>` : ''}</div>`).join('')}
    ${n < 8 ? '<button class="btn" data-act="st-add">＋ Add a group / station</button>' : ''}
    <label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label></div>`;
}

function openEdit(b) {
  if (!b) return;
  const idx = () => P.blocks.indexOf(b);
  const m = modal({ title: b.type === 'series' ? b.title : b.type === 'rotation' ? 'Stations' : b.type === 'goes' ? 'Live goes' : b.type === 'rest' ? 'Rest' : b.title, body: editBody(b),
    footer: `<button class="btn danger" data-act="del">Remove</button><button class="btn" data-act="dup">Copy</button><button class="btn" data-act="up">↑</button><button class="btn" data-act="down">↓</button><span class="grow"></span><button class="btn primary lg" data-act="close">Done</button>`,
    onAction: async (act, el, w, close) => {
      const redraw = () => { w.querySelector('.mb').innerHTML = editBody(b); };
      const box = el.closest('.bigstep');
      if (act === 'st-' || act === 'st+') { const f = box.dataset.field, min = +box.dataset.min, st = step(b[f] || 0); b[f] = Math.max(min, (b[f] || 0) + (act === 'st+' ? st : -st)); changed(); return redraw(); }
      if (act === 'r-' || act === 'r+') { b.rounds = Math.max(1, Math.min(30, b.rounds + (act === 'r+' ? 1 : -1))); changed(); return redraw(); }
      if (act === 'flag') { b[el.dataset.flag] = !b[el.dataset.flag]; el.classList.toggle('on', b[el.dataset.flag]); return changed(); }
      if (act === 'mode') { b.mode = el.dataset.mode; if (['Station Rotation', 'Group Split'].includes(b.title)) b.title = b.mode === 'split' ? 'Group Split' : 'Station Rotation'; changed(); return redraw(); }
      if (act === 'st-add') { b.stations.push({ title: `Station ${b.stations.length + 1}`, description: '', category: 'Station' }); changed(); return redraw(); }
      if (act === 'st-del') { b.stations.splice(+el.closest('[data-si]').dataset.si, 1); changed(); return redraw(); }
      if (act === 'st-pick') { const si = +el.closest('[data-si]').dataset.si; close();
        return openAdd({ single: true, title: `Group ${GROUP(si)} station`, onPick: (d) => { b.stations[si] = { title: d.title, description: d.description || '', category: d.category, drillId: d.id }; changed(); openEdit(b); } }); }
      const mi = el.closest('[data-mi]') ? +el.closest('[data-mi]').dataset.mi : -1;
      if (act === 'mv-' || act === 'mv+') { const mv = b.moves[mi]; mv.sec = Math.max(5, mv.sec + (act === 'mv+' ? (mv.sec < 60 ? 5 : 15) : -(mv.sec <= 60 ? 5 : 15))); changed(); return redraw(); }
      if (act === 'mv-all') { b.moves.forEach(mv => { mv.sec = +el.dataset.s; }); changed(); return redraw(); }
      if (act === 'mv-up') { if (mi > 0) { [b.moves[mi - 1], b.moves[mi]] = [b.moves[mi], b.moves[mi - 1]]; changed(); redraw(); } return; }
      if (act === 'mv-del') { if (b.moves.length > 1) { b.moves.splice(mi, 1); changed(); redraw(); } return; }
      if (act === 'mv-add') { b.moves.push({ title: 'New motion', sec: 30, description: '' }); changed(); redraw(); const ins = w.querySelectorAll('[data-mf=title]'); const last = ins[ins.length - 1]; last.focus(); last.select(); return; }
      if (act === 'mv-lib') { close(); return openAdd({ single: true, title: 'Add a motion', onPick: (d) => { b.moves.push({ title: d.title, sec: Math.min(60, d.durationSec), description: d.description || '' }); changed(); openEdit(b); } }); }
      if (act === 'tolib' && b.type === 'series') {
        const orig = drills.find(d => d.id === b.drillId);
        const canUpdate = orig && (user.role === 'owner' || user.role === 'admin' || orig.createdBy === user.uid);
        const d = await store.saveDrill({ ...(canUpdate ? orig : {}), ...(canUpdate ? {} : { id: undefined, createdBy: undefined }), type: 'series', title: b.title, category: b.category, description: b.description || '',
          moves: JSON.parse(JSON.stringify(b.moves)), durationSec: blockDuration(b), cues: [], levels: P.levels || [], videoUrl: '' });
        drills = drills.filter(x => x.id !== d.id).concat(d); b.drillId = d.id; changed();
        return toast(canUpdate ? 'Library routine updated' : 'Saved as a new library routine', 'success');
      }
      if (act === 'tolib') { const d = await store.saveDrill({ title: b.title, category: b.category, description: b.description || '', cues: b.cues || [], durationSec: b.durationSec, levels: P.levels || [], videoUrl: b.videoUrl || '' }); drills.push(d); return toast('Saved to the library', 'success'); }
      if (act === 'del') { P.blocks.splice(idx(), 1); close(); changed(); return toast('Removed'); }
      if (act === 'dup') { const c = JSON.parse(JSON.stringify(b)); c.id = newId(); P.blocks.splice(idx() + 1, 0, c); changed(); return toast('Copied'); }
      if (act === 'up' || act === 'down') { const i = idx(), j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= P.blocks.length) return; [P.blocks[i], P.blocks[j]] = [P.blocks[j], P.blocks[i]]; return changed(); }
    } });
  const mb = m.el.querySelector('.mb');
  mb.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.mf) { b.moves[+t.closest('[data-mi]').dataset.mi][t.dataset.mf] = t.value; return changed(); }
    if (t.dataset.f) { b[t.dataset.f] = t.dataset.f === 'cues' ? t.value.split('\n').map(s => s.trim()).filter(Boolean) : t.value; changed(); }
  });
  mb.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.durfield) { const f = t.dataset.durfield, min = +t.closest('.bigstep').dataset.min; b[f] = Math.max(min, parseDur(t.value, b[f])); t.value = clock(b[f]); changed(); }
    if (t.dataset.numfield) { b.rounds = Math.max(1, Math.min(30, parseInt(t.value) || b.rounds)); t.value = b.rounds; changed(); }
  });
}

// ---- Smaller sheets ------------------------------------------------------
export function drillForm(d = {}) {
  return `<div class="stack">
    <label class="field"><span class="tiny">Move name</span><input class="input" id="df-title" value="${esc(d.title || '')}" placeholder="e.g. Sweep Single"></label>
    <div class="grid" style="grid-template-columns:1fr 1fr"><label class="field"><span class="tiny">Category</span><select class="input" id="df-cat">${CATEGORIES.filter(c => c.id !== 'Rest').map(c => `<option ${c.id === (d.category || 'Neutral') ? 'selected' : ''}>${c.id}</option>`).join('')}</select></label>
    <label class="field"><span class="tiny">Default time</span><input class="input" id="df-dur" value="${clock(d.durationSec || 300)}" placeholder="5:00"></label></div>
    <label class="field"><span class="tiny">Description</span><input class="input" id="df-desc" value="${esc(d.description || '')}" placeholder="Short. It shows big on the room screen."></label>
    <label class="field"><span class="tiny">Coaching cues (one per line)</span><textarea class="input" id="df-cues" rows="3">${esc((d.cues || []).join('\n'))}</textarea></label>
    <label class="field"><span class="tiny">Technique video link</span><input class="input" id="df-video" value="${esc(d.videoUrl || '')}" placeholder="https://…"></label>
    <div><span class="tiny">Levels</span><div class="row wrap" style="gap:6px;margin-top:6px">${LEVELS.map(l => `<button class="chip ${(d.levels || []).includes(l) ? 'on' : ''}" data-act="dlevel" data-level="${l}">${l}</button>`).join('')}</div></div>
  </div>`;
}
export function readDrillForm(w, base = {}) {
  const title = w.querySelector('#df-title').value.trim();
  if (!title) { toast('Give the move a name', 'error'); return null; }
  return { ...base, title, category: w.querySelector('#df-cat').value, durationSec: parseDur(w.querySelector('#df-dur').value, 300),
    description: w.querySelector('#df-desc').value.trim(), cues: w.querySelector('#df-cues').value.split('\n').map(s => s.trim()).filter(Boolean),
    videoUrl: w.querySelector('#df-video').value.trim(), levels: [...w.querySelectorAll('[data-act=dlevel].on')].map(c => c.dataset.level) };
}

function customDrill() {
  modal({ title: 'New drill', body: drillForm(),
    footer: `<button class="btn" data-act="once">Just this practice</button><button class="btn primary" data-act="lib">Save to library + add</button>`,
    onAction: async (a, el, w, close) => {
      if (a === 'dlevel') { el.classList.toggle('on'); return; }
      const d = readDrillForm(w); if (!d) return;
      if (a === 'lib') { const saved = await store.saveDrill(d); drills.push(saved); toast('Saved to the library', 'success'); }
      close(); P.blocks.push(drillToBlock(d)); changed();
    } });
}

function printMenu() {
  modal({ title: 'Print', body: `<div class="grid c2">
      <button class="tpl" style="border-color:#3b82f6" data-act="plan"><div class="n">Coach plan</div><div class="b">Full detail · rotation grids · notes box</div></button>
      <button class="tpl" style="border-color:#facc15" data-act="wall"><div class="n">Wall card</div><div class="b">Big type · tape it to the wall</div></button></div>`,
    onAction: (a, el, w, close) => { close(); printPractice(P, { wall: a === 'wall' }); } });
}

function restBetween() {
  modal({ title: 'Rest between every drill', body: `<p class="muted">Adds a rest after each drill that doesn't already have one.</p>
    <div class="row wrap" style="gap:10px">${[15, 30, 60, 90].map(s => `<button class="btn lg" data-act="r" data-s="${s}">${fmtDur(s)}</button>`).join('')}</div>`,
    onAction: (a, el, w, close) => {
      if (a !== 'r') return; close();
      const out = [];
      P.blocks.forEach((b, i) => { out.push(b); const nx = P.blocks[i + 1]; if (b.type !== 'rest' && nx && nx.type !== 'rest') out.push(makeRest(+el.dataset.s)); });
      P.blocks = out; changed(); toast('Rests added', 'success');
    } });
}
