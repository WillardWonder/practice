import { esc, $, $$, toast, modal, confirmBox, download } from './ui.js';
import { CATEGORIES, LEVELS, catColor, makeRotation, makeGoes, makeRest, drillToBlock, newId } from './seed.js';
import { blockDuration, practiceDuration, fmtDur, parseDur, clockTimeLabel, minutesBetween, GROUP } from './engine.js';
import { store, canEditPractice } from './store.js';
import { blockDetail, printPractice } from './print.js';
import { openShare } from './share.js';

let P = null, openId = null, saveTimer = null, saveState = 'saved', root = null, drills = [], sortable = null;

export async function renderBuilder(el, practice, user, { isNew = false } = {}) {
  root = el; P = practice; openId = null; saveState = isNew ? 'new' : 'saved';
  drills = await store.listDrills();
  if (isNew) await saveNow(true);
  draw(user);
}

function drillsSorted() { return drills.slice().sort((a, b) => CATEGORIES.findIndex(c => c.id === a.category) - CATEGORIES.findIndex(c => c.id === b.category) || a.title.localeCompare(b.title)); }

function scheduleSave() {
  saveState = 'dirty'; updateSummary();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 900);
}
async function saveNow(silent) {
  clearTimeout(saveTimer);
  saveState = 'saving'; if (!silent) updateSummary();
  try {
    const wasNew = !P.id;
    await store.savePractice(P);
    saveState = 'saved';
    if (wasNew || location.hash.startsWith('#/new')) history.replaceState(null, '', `#/edit/${P.id}`);
  } catch (e) { console.error(e); saveState = 'error'; toast('Save failed: ' + (e.code || e.message), 'error'); }
  if (!silent) updateSummary();
}
export function flushSave() { if (saveState === 'dirty') return saveNow(true); }

function durCtl(field, sec, blockId) {
  return `<span class="dur" data-bid="${blockId}"><button data-act="dur-" data-field="${field}" aria-label="Less">−</button>
    <input value="${fmtDur(sec).replace(' min', ':00')}" data-durfield="${field}" inputmode="numeric" aria-label="Duration">
    <button data-act="dur+" data-field="${field}" aria-label="More">+</button></span>`;
}
const step = (sec) => sec < 60 ? 15 : sec < 120 ? 30 : 60;

function blockHTML(b, i, start, user) {
  const open = openId === b.id;
  const title = b.type === 'rotation' ? (b.title || 'Station Rotation') : b.title;
  const mainDur = b.type === 'drill' || b.type === 'rest' ? durCtl('durationSec', b.durationSec, b.id) : `<span class="badge">${fmtDur(blockDuration(b))}</span>`;
  return `<div class="block ${open ? 'open' : ''}" data-bid="${b.id}">
    <div class="stripe" style="background:${catColor(b.category)}"></div>
    <div class="body">
      <div class="head">
        <span class="handle" title="Drag to reorder">⋮⋮</span>
        <div class="when">${P.startTime ? clockTimeLabel(P.startTime, start) : '+' + fmtDur(start)}</div>
        <div class="grow" data-act="toggle" style="cursor:pointer">
          <div class="t">${esc(title)}</div>
          <div class="meta">${b.holdAtEnd ? '⏸ coach-paced · ' : ''}${b.switchAtHalf ? '⇄ switch · ' : ''}${b.type === 'drill' ? esc(b.category) + (b.description ? ' · ' + esc(b.description) : '') : esc(blockDetail(b))}</div>
        </div>
        ${mainDur}
        <button class="btn ghost icon" data-act="toggle" aria-label="Edit" title="Edit">${open ? '▴' : '✎'}</button>
      </div>
      ${open ? editorHTML(b) : ''}
    </div></div>`;
}

function catSelect(val, field = 'category') {
  return `<select class="input" data-f="${field}">${CATEGORIES.map(c => `<option ${c.id === val ? 'selected' : ''}>${c.id}</option>`).join('')}</select>`;
}

function editorHTML(b) {
  const common = `<div class="row wrap" style="justify-content:flex-end;gap:6px">
      ${b.type === 'drill' ? '<button class="btn sm" data-act="save-to-lib">☆ Save to library</button>' : ''}
      <button class="btn sm" data-act="dup">Duplicate</button>
      <button class="btn sm" data-act="up">Move up</button><button class="btn sm" data-act="down">Move down</button>
      <button class="btn sm danger" data-act="del">Remove</button></div>`;
  if (b.type === 'rest') return `<div class="editor"><label class="field"><span class="tiny">Label</span><input class="input" data-f="title" value="${esc(b.title || 'Rest')}" placeholder="Rest / Water"></label><div class="muted small">Voice says "Rest" and tells them what's next.</div>${common}</div>`;
  if (b.type === 'drill') return `<div class="editor">
      <div class="grid" style="grid-template-columns:2fr 1fr"><label class="field"><span class="tiny">Drill name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
      <label class="field"><span class="tiny">Category</span>${catSelect(b.category)}</label></div>
      <label class="field"><span class="tiny">Description (shown big on screen)</span><input class="input" data-f="description" value="${esc(b.description)}" placeholder="e.g. Elbow tie, underhooks, inside/outside"></label>
      <label class="field"><span class="tiny">Coaching cues — one per line</span><textarea class="input" data-f="cues" rows="2" placeholder="Head up&#10;Hips under">${esc((b.cues || []).join('\n'))}</textarea></label>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="toggle ${b.switchAtHalf ? 'on' : ''}" data-act="flag" data-flag="switchAtHalf"><div><b>Call "Switch!" at halfway</b><div class="small muted">Double whistle + voice for partners</div></div><div class="sw"></div></div>
        <div class="toggle ${b.holdAtEnd ? 'on' : ''}" data-act="flag" data-flag="holdAtEnd"><div><b>Coach-paced</b><div class="small muted">At 0:00 the clock waits and counts overtime until you tap Next. Good for teaching or demos.</div></div><div class="sw"></div></div>
      </div>
      <label class="field"><span class="tiny">Technique video link (optional)</span><input class="input" data-f="videoUrl" value="${esc(b.videoUrl || '')}" placeholder="https://youtu.be/…"></label>
      ${common}</div>`;
  if (b.type === 'goes') return `<div class="editor">
      <div class="grid" style="grid-template-columns:2fr 1fr"><label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
      <label class="field"><span class="tiny">Category</span>${catSelect(b.category)}</label></div>
      <div class="row wrap" style="gap:16px">
        <label class="field"><span class="tiny">Goes</span><span class="dur"><button data-act="rounds-">−</button><input value="${b.rounds}" data-numfield="rounds"><button data-act="rounds+">+</button></span></label>
        <label class="field"><span class="tiny">Each go</span>${durCtl('workSec', b.workSec, b.id)}</label>
        <label class="field"><span class="tiny">Rest between</span>${durCtl('restSec', b.restSec, b.id)}</label>
      </div>
      <label class="field"><span class="tiny">Description / situation</span><input class="input" data-f="description" value="${esc(b.description)}" placeholder="e.g. In on a double/single — score or get out"></label>
      <label class="field"><span class="tiny">Coaching cues — one per line</span><textarea class="input" data-f="cues" rows="2">${esc((b.cues || []).join('\n'))}</textarea></label>
      <div class="toggle ${b.switchAtHalf ? 'on' : ''}" data-act="flag" data-flag="switchAtHalf"><div><b>Call "Switch!" halfway through each go</b><div class="small muted">Top/bottom swap or partner swap</div></div><div class="sw"></div></div>
      ${common}</div>`;
  // rotation
  const n = b.stations.length, rounds = b.mode === 'split' ? 1 : n;
  let grid = `<table><tr><th></th>${b.stations.map((_, g) => `<th>Grp ${GROUP(g)}</th>`).join('')}</tr>`;
  for (let r = 0; r < rounds; r++) grid += `<tr><th>${b.mode === 'split' ? 'All' : 'Rot ' + (r + 1)}</th>${b.stations.map((_, g) => `<td>${esc(b.stations[(g + r) % n].title)}</td>`).join('')}</tr>`;
  grid += '</table>';
  return `<div class="editor">
    <div class="grid" style="grid-template-columns:2fr 1fr"><label class="field"><span class="tiny">Name</span><input class="input" data-f="title" value="${esc(b.title)}"></label>
      <label class="field"><span class="tiny">How groups move</span><div class="seg" style="display:flex"><button class="${b.mode !== 'split' ? 'on' : ''}" data-act="mode" data-mode="rotate">Rotate</button><button class="${b.mode === 'split' ? 'on' : ''}" data-act="mode" data-mode="split">Stay (split)</button></div></label></div>
    <div class="small muted">${b.mode === 'split' ? 'Each group works its own move for the whole block (last season\'s Group Split).' : 'Every group visits every station. The app calls "Rotate!" and shows each group where to go.'}</div>
    <div class="row wrap" style="gap:16px">
      <label class="field"><span class="tiny">${b.mode === 'split' ? 'Block length' : 'Time per station'}</span>${durCtl('stationSec', b.stationSec, b.id)}</label>
      ${b.mode === 'split' ? '' : `<label class="field"><span class="tiny">Rotate time</span>${durCtl('transitionSec', b.transitionSec || 0, b.id)}</label>`}
    </div>
    <div class="tiny">Stations (group letter = where that group starts)</div>
    <div class="stations">${b.stations.map((s, si) => `<div class="station" data-si="${si}">
      <div class="g">${GROUP(si)}</div><input class="input" data-sf="title" value="${esc(s.title)}" placeholder="Move or station">
      <button class="btn sm" data-act="st-pick">Library</button><button class="btn sm ghost" data-act="st-del" ${n <= 2 ? 'disabled' : ''}>✕</button></div>`).join('')}</div>
    <div class="row"><button class="btn sm" data-act="st-add" ${n >= 8 ? 'disabled' : ''}>+ Add group / station</button><span class="small muted">${n} groups · ${fmtDur(blockDuration(b))} total</span></div>
    <div class="rot-grid">${grid}</div>
    ${common}</div>`;
}

function summaryHTML() {
  const total = practiceDuration(P);
  const target = minutesBetween(P.startTime, P.endTime) * 60;
  const diff = target ? total - target : 0;
  const st = { saved: '✓ Saved', saving: 'Saving…', dirty: 'Editing…', error: '⚠ Not saved', new: 'New' }[saveState];
  return `<div><div class="tiny">Total</div><div class="big">${fmtDur(total).replace(' min', ':00')}</div></div>
    ${P.startTime ? `<div><div class="tiny">Ends</div><div class="big" style="font-size:18px">${clockTimeLabel(P.startTime, total)}</div></div>` : ''}
    ${target ? `<span class="badge ${Math.abs(diff) < 60 ? 'green' : diff > 0 ? 'red' : 'gold'}">${Math.abs(diff) < 60 ? 'Right on time' : diff > 0 ? `${Math.round(diff / 60)} min over` : `${Math.round(-diff / 60)} min open`}</span>` : ''}
    <div class="catbar grow" style="min-width:120px">${(P.blocks || []).map(b => `<i style="width:${(blockDuration(b) / Math.max(1, total) * 100).toFixed(2)}%;background:${catColor(b.category)}"></i>`).join('')}</div>
    <span class="small muted" style="min-width:76px;text-align:right">${st}</span>`;
}
function updateSummary() {
  const s = $('#summary', root); if (s) s.innerHTML = summaryHTML();
}

function libPanelHTML(filter = '', cat = '') {
  const f = filter.toLowerCase();
  const list = drillsSorted().filter(d => (!cat || d.category === cat) && (!f || (d.title + ' ' + (d.description || '')).toLowerCase().includes(f)));
  return list.map(d => `<button class="drill" data-act="quick-add" data-did="${d.id}"><span class="cat" style="background:${catColor(d.category)}"></span>
    <span class="t" style="padding-right:16px">${esc(d.title)}</span><span class="d muted">${fmtDur(d.durationSec)} · ${esc(d.description || d.category)}</span></button>`).join('') || '<div class="muted small">No drills match.</div>';
}

function draw(user) {
  const editable = canEditPractice(user, P);
  let t = 0;
  const blocks = (P.blocks || []).map((b, i) => { const s = t; t += blockDuration(b); return blockHTML(b, i, s, user); }).join('');
  root.innerHTML = `
    <div class="row between wrap" style="margin-bottom:8px">
      <a href="#/practices" class="btn ghost sm">← Practices</a>
      <div class="row wrap" style="gap:8px">
        <button class="btn sm" data-act="print">Print</button>
        <button class="btn sm" data-act="share">Share</button>
        <button class="btn sm" data-act="more">More…</button>
        <a class="btn go" href="#/run/${P.id}" ${!(P.blocks || []).length ? 'disabled' : ''}>▶ Run practice</a>
      </div>
    </div>
    <input class="title-input" data-pf="title" value="${esc(P.title)}" placeholder="PRACTICE NAME" aria-label="Practice name">
    <div class="row wrap" style="margin-top:10px;gap:14px;align-items:flex-end">
      <label class="field"><span class="tiny">Date</span><input type="date" class="input" data-pf="date" value="${esc(P.date || '')}" style="width:auto"></label>
      <label class="field"><span class="tiny">Start</span><input type="time" class="input" data-pf="startTime" value="${esc(P.startTime || '')}" style="width:auto"></label>
      <label class="field"><span class="tiny">Must end by</span><input type="time" class="input" data-pf="endTime" value="${esc(P.endTime || '')}" style="width:auto"></label>
      <label class="field"><span class="tiny">Who can see it</span><select class="input" data-pf="visibility" style="width:auto">
        <option value="team" ${P.visibility === 'team' ? 'selected' : ''}>Coaches & staff</option>
        <option value="athletes" ${P.visibility === 'athletes' ? 'selected' : ''}>+ Athletes</option>
        <option value="public" ${P.visibility === 'public' ? 'selected' : ''}>Anyone with link</option></select></label>
    </div>
    <div class="row wrap" style="margin-top:12px;gap:6px">
      <span class="tiny" style="margin-right:4px">Levels</span>
      ${LEVELS.map(l => `<button class="chip ${(P.levels || []).includes(l) ? 'on' : ''}" data-act="level" data-level="${l}">${l}</button>`).join('')}
      <button class="chip ${P.coEdit ? 'on' : ''}" data-act="coedit" title="Let every coach edit this practice">✎ All coaches can edit</button>
    </div>
    <label class="field" style="margin-top:12px"><input class="input" data-pf="notes" value="${esc(P.notes || '')}" placeholder="Focus of the day (optional) — e.g. Finish on the single, ride hard on top"></label>
    <div class="summary" id="summary">${summaryHTML()}</div>
    <div class="builder">
      <div>
        <div class="blocks" id="blocks">${blocks || `<div class="empty">Empty practice. Add drills from the library ${window.innerWidth > 980 ? '→' : 'below'}, or use the buttons below.</div>`}</div>
        <div class="addbar">
          <button class="btn" data-act="add-drills">＋ Drills</button>
          <button class="btn" data-act="add-rest">＋ Rest</button>
          <button class="btn" data-act="add-goes">＋ Live goes</button>
          <button class="btn" data-act="add-rot">＋ Station rotation</button>
          <button class="btn" data-act="add-split">＋ Group split</button>
          <button class="btn" data-act="add-custom">＋ Custom drill</button>
        </div>
      </div>
      <aside class="card" style="position:sticky;top:150px;max-height:calc(100vh - 170px);display:flex;flex-direction:column;gap:10px" id="libpanel">
        <div class="row between"><b>Drill library</b><span class="tiny">tap to add</span></div>
        <input class="input" id="libq" placeholder="Search drills…">
        <div class="row wrap" style="gap:4px">${['', ...CATEGORIES.filter(c => c.id !== 'Rest' && c.id !== 'Station').map(c => c.id)].map(c => `<button class="chip sm ${c === '' ? 'on' : ''}" data-act="libcat" data-cat="${c}" style="padding:5px 10px;font-size:12px">${c ? `<span class="dot" style="background:${catColor(c)}"></span>` : ''}${c || 'All'}</button>`).join('')}</div>
        <div id="liblist" style="overflow-y:auto;display:grid;gap:6px;padding-right:4px">${libPanelHTML()}</div>
      </aside>
    </div>`;
  if (window.innerWidth <= 980) $('#libpanel', root).classList.add('hidden');
  if (!editable) {
    root.querySelectorAll('input,select,textarea,button:not([data-act=print]):not([data-act=share])').forEach(e => e.disabled = true);
  }
  bind(user);
  if (sortable) sortable.destroy();
  const list = $('#blocks', root);
  if (window.Sortable && P.blocks?.length) sortable = Sortable.create(list, {
    handle: '.handle', animation: 150, ghostClass: 'sortable-ghost', delay: 0,
    onEnd: (e) => { if (e.oldIndex === e.newIndex) return; const [m] = P.blocks.splice(e.oldIndex, 1); P.blocks.splice(e.newIndex, 0, m); scheduleSave(); draw(user); },
  });
}

let libCat = '';
function bind(user) {
  const redraw = () => { scheduleSave(); draw(user); };
  const blockOf = (el) => { const id = el.closest('[data-bid]')?.dataset.bid; return P.blocks.find(b => b.id === id); };

  root.oninput = (e) => {
    const t = e.target;
    if (t.id === 'libq') { $('#liblist', root).innerHTML = libPanelHTML(t.value, libCat); return; }
    if (t.dataset.pf) { P[t.dataset.pf] = t.value; scheduleSave(); return; }
    const b = blockOf(t); if (!b) return;
    if (t.dataset.f) {
      b[t.dataset.f] = t.dataset.f === 'cues' ? t.value.split('\n').map(s => s.trim()).filter(Boolean) : t.value;
      const head = t.closest('.block').querySelector('.t'); if (t.dataset.f === 'title') head.textContent = t.value;
      scheduleSave();
    } else if (t.dataset.sf) {
      const si = +t.closest('[data-si]').dataset.si; b.stations[si][t.dataset.sf] = t.value; scheduleSave();
    }
  };
  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.pf === 'startTime' || t.dataset.pf === 'endTime') { draw(user); return; }
    if (t.dataset.f === 'category') { draw(user); return; }
    if (t.dataset.sf) { draw(user); return; }
    if (t.dataset.durfield) {
      const b = blockOf(t); const f = t.dataset.durfield;
      b[f] = Math.max(f === 'restSec' || f === 'transitionSec' ? 0 : 5, parseDur(t.value, b[f])); redraw();
    }
    if (t.dataset.numfield) { const b = blockOf(t); b.rounds = Math.max(1, Math.min(30, parseInt(t.value) || b.rounds)); redraw(); }
  };
  root.onkeydown = (e) => { if (e.key === 'Enter' && (e.target.dataset.durfield || e.target.dataset.numfield)) e.target.blur(); };
  root.onclick = async (e) => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    const act = a.dataset.act; const b = blockOf(a);
    const idx = b ? P.blocks.indexOf(b) : -1;
    switch (act) {
      case 'toggle': openId = openId === b.id ? null : b.id; draw(user); break;
      case 'dur-': case 'dur+': { const f = a.dataset.field; const cur = b[f] || 0; const st = step(cur);
        b[f] = Math.max(f === 'restSec' || f === 'transitionSec' ? 0 : 5, act === 'dur+' ? cur + st : cur - st); redraw(); break; }
      case 'rounds-': b.rounds = Math.max(1, b.rounds - 1); redraw(); break;
      case 'rounds+': b.rounds = Math.min(30, b.rounds + 1); redraw(); break;
      case 'flag': b[a.dataset.flag] = !b[a.dataset.flag]; redraw(); break;
      case 'mode': b.mode = a.dataset.mode; if (b.title === 'Station Rotation' || b.title === 'Group Split') b.title = b.mode === 'split' ? 'Group Split' : 'Station Rotation'; redraw(); break;
      case 'st-add': b.stations.push({ title: `Station ${b.stations.length + 1}`, description: '', category: 'Station' }); redraw(); break;
      case 'st-del': b.stations.splice(+a.closest('[data-si]').dataset.si, 1); redraw(); break;
      case 'st-pick': { const si = +a.closest('[data-si]').dataset.si;
        pickDrills({ single: true, onPick: ([d]) => { b.stations[si] = { title: d.title, description: d.description || '', category: d.category, drillId: d.id }; redraw(); } }); break; }
      case 'dup': { const c = JSON.parse(JSON.stringify(b)); c.id = newId(); P.blocks.splice(idx + 1, 0, c); openId = c.id; redraw(); break; }
      case 'up': if (idx > 0) { [P.blocks[idx - 1], P.blocks[idx]] = [P.blocks[idx], P.blocks[idx - 1]]; redraw(); } break;
      case 'down': if (idx < P.blocks.length - 1) { [P.blocks[idx + 1], P.blocks[idx]] = [P.blocks[idx], P.blocks[idx + 1]]; redraw(); } break;
      case 'del': P.blocks.splice(idx, 1); openId = null; redraw(); toast('Removed'); break;
      case 'save-to-lib': { const d = await store.saveDrill({ title: b.title, category: b.category, description: b.description || '', cues: b.cues || [], durationSec: b.durationSec, levels: P.levels || [], videoUrl: b.videoUrl || '' });
        drills.push(d); toast('Saved to the team library', 'success'); break; }
      case 'level': { const l = a.dataset.level; P.levels = (P.levels || []).includes(l) ? P.levels.filter(x => x !== l) : [...(P.levels || []), l]; redraw(); break; }
      case 'coedit': P.coEdit = !P.coEdit; redraw(); break;
      case 'quick-add': { const d = drills.find(x => x.id === a.dataset.did); P.blocks.push(drillToBlock(d)); redraw(); toast(`Added ${d.title}`, 'success'); break; }
      case 'libcat': libCat = a.dataset.cat; $$('[data-act=libcat]', root).forEach(c => c.classList.toggle('on', c === a)); $('#liblist', root).innerHTML = libPanelHTML($('#libq', root).value, libCat); break;
      case 'add-drills': pickDrills({ onPick: (list) => { list.forEach(d => P.blocks.push(drillToBlock(d))); redraw(); } }); break;
      case 'add-rest': P.blocks.push(makeRest(60)); redraw(); break;
      case 'add-goes': { const g = makeGoes(); P.blocks.push(g); openId = g.id; redraw(); break; }
      case 'add-rot': case 'add-split': splitCount(act === 'add-split' ? 'split' : 'rotate', (blk) => { P.blocks.push(blk); openId = blk.id; redraw(); }); break;
      case 'add-custom': customDrill((d, addToLib) => { P.blocks.push(drillToBlock(d)); redraw(); }); break;
      case 'print': printMenu(P); break;
      case 'share': await saveNow(true); openShare(P, user, () => draw(user)); break;
      case 'more': moreMenu(user); break;
    }
  };
}

function splitCount(mode, done) {
  const m = modal({ title: 'How many groups?', body: `<div class="row wrap" style="justify-content:center;gap:12px">${[2, 3, 4, 5, 6].map(n => `<button class="btn xl" data-act="n" data-n="${n}" style="width:84px;height:84px;font-size:34px">${n}</button>`).join('')}</div>
    <p class="muted small" style="text-align:center;margin-top:16px">${mode === 'split' ? 'Each group stays on its own move (Group Split).' : 'Groups rotate through every station.'} You can change it after.</p>`,
    onAction: (a, el, w, close) => { if (a === 'n') { close(); done(makeRotation(+el.dataset.n, mode)); } } });
}

export function pickDrills({ single = false, onPick }) {
  let sel = [], q = '', cat = '';
  const listHTML = () => {
    const f = q.toLowerCase();
    const items = drillsSorted().filter(d => (!cat || d.category === cat) && (!f || (d.title + ' ' + (d.description || '')).toLowerCase().includes(f)));
    const cats = [...new Set(items.map(d => d.category))];
    return cats.map(c => `<div class="section-title" style="margin-top:14px">${esc(c)} Drills</div><div class="grid c3">${items.filter(d => d.category === c).map(d =>
      `<button class="drill ${sel.includes(d.id) ? 'sel' : ''}" data-act="pick" data-did="${d.id}"><span class="t">${esc(d.title)}</span><span class="d muted">${fmtDur(d.durationSec)} • ${esc(d.description || d.category)}</span></button>`).join('')}</div>`).join('') || '<div class="empty">No drills match.</div>';
  };
  const footer = () => single ? '' : `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="add" ${sel.length ? '' : 'disabled'}>Add ${sel.length || ''} drill${sel.length === 1 ? '' : 's'} to practice</button>`;
  const m = modal({ title: single ? 'Pick a move' : 'Drill library', wide: true,
    body: `<div style="position:sticky;top:-18px;background:var(--panel);padding:4px 0 10px;z-index:2">
      <input class="input" id="pq" placeholder="Search drills…">
      <div class="row wrap" style="gap:6px;margin-top:10px">${['', ...CATEGORIES.filter(c => c.id !== 'Rest').map(c => c.id)].map(c => `<button class="chip ${c === '' ? 'on' : ''}" data-act="cat" data-cat="${c}">${c ? `<span class="dot" style="background:${catColor(c)}"></span>` : ''}${c || 'All'}</button>`).join('')}</div>
      ${single ? '' : '<div class="small muted" style="margin-top:8px">Tap cards to select, in the order you want them.</div>'}</div><div id="plist">${listHTML()}</div>`,
    footer: footer(),
    onAction: (a, el, w, close) => {
      if (a === 'pick') {
        const id = el.dataset.did;
        if (single) { close(); onPick([drills.find(d => d.id === id)]); return; }
        sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
        el.classList.toggle('sel'); const f = w.querySelector('.mf'); f.innerHTML = footer();
      } else if (a === 'cat') { cat = el.dataset.cat; w.querySelectorAll('[data-act=cat]').forEach(c => c.classList.toggle('on', c === el)); w.querySelector('#plist').innerHTML = listHTML(); }
      else if (a === 'add') { close(); onPick(sel.map(id => drills.find(d => d.id === id))); toast(`Added ${sel.length} drills`, 'success'); }
    } });
  m.el.querySelector('#pq').addEventListener('input', (e) => { q = e.target.value; m.el.querySelector('#plist').innerHTML = listHTML(); });
}

export function drillForm(d = {}) {
  return `<div class="stack">
    <label class="field"><span class="tiny">Move name</span><input class="input" id="df-title" value="${esc(d.title || '')}" placeholder="e.g. Sweep Single"></label>
    <div class="grid" style="grid-template-columns:1fr 1fr"><label class="field"><span class="tiny">Category</span><select class="input" id="df-cat">${CATEGORIES.filter(c => c.id !== 'Rest').map(c => `<option ${c.id === (d.category || 'Neutral') ? 'selected' : ''}>${c.id}</option>`).join('')}</select></label>
    <label class="field"><span class="tiny">Default time</span><input class="input" id="df-dur" value="${fmtDur(d.durationSec || 300).replace(' min', ':00')}" placeholder="5:00"></label></div>
    <label class="field"><span class="tiny">Description</span><input class="input" id="df-desc" value="${esc(d.description || '')}" placeholder="Short — it shows huge on the room screen"></label>
    <label class="field"><span class="tiny">Coaching cues — one per line</span><textarea class="input" id="df-cues" rows="3">${esc((d.cues || []).join('\n'))}</textarea></label>
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

function customDrill(done) {
  modal({ title: 'New custom move', body: drillForm(),
    footer: `<button class="btn" data-act="once">Add to this practice only</button><button class="btn primary" data-act="lib">Save to library + add</button>`,
    onAction: async (a, el, w, close) => {
      if (a === 'dlevel') { el.classList.toggle('on'); return; }
      const d = readDrillForm(w); if (!d) return;
      if (a === 'lib') { const saved = await store.saveDrill(d); drills.push(saved); toast('Saved to the team library', 'success'); }
      close(); done(d);
    } });
}

function printMenu(p) {
  modal({ title: 'Print', body: `<div class="grid c2">
      <button class="tpl" style="border-color:#3b82f6" data-act="plan"><div class="n">Coach plan</div><div class="b">Full detail · rotation grids · notes box</div></button>
      <button class="tpl" style="border-color:#facc15" data-act="wall"><div class="n">Wall card</div><div class="b">Big type · tape it to the wall</div></button></div>`,
    onAction: (a, el, w, close) => { close(); printPractice(p, { wall: a === 'wall' }); } });
}

function moreMenu(user) {
  modal({ title: 'More', body: `<div class="stack">
      <button class="btn lg" style="width:100%" data-act="dupP">Duplicate practice</button>
      <button class="btn lg" style="width:100%" data-act="rests">Insert rest between every drill…</button>
      <button class="btn lg" style="width:100%" data-act="export">Export file (.json)</button>
      <button class="btn lg" style="width:100%" data-act="cancelP">${P.canceled ? 'Un-cancel this practice' : 'Mark as canceled (snow day, meet…)'}</button>
      <button class="btn lg danger" style="width:100%" data-act="delP">Delete practice</button></div>`,
    onAction: async (a, el, w, close) => {
      if (a === 'dupP') { close(); await flushSave(); const c = JSON.parse(JSON.stringify(P)); delete c.id; c.title = P.title + ' (copy)'; c.ownerUid = null; c.ownerName = null; delete c.createdAt;
        await store.savePractice(c); toast('Duplicated', 'success'); location.hash = `#/edit/${c.id}`; }
      if (a === 'rests') { close(); restBetween(user); }
      if (a === 'cancelP') { close(); P.canceled = !P.canceled; await saveNow(); toast(P.canceled ? 'Marked canceled' : 'Restored', 'success'); draw(user); }
      if (a === 'export') { close(); download(`${(P.title || 'practice').replace(/[^\w-]+/g, '_')}.practice.json`, JSON.stringify({ format: 'wrestling-practice/1', practice: P }, null, 2)); }
      if (a === 'delP') { close(); if (await confirmBox('Delete practice?', `"${P.title}" will be removed for every coach. Run history stays.`, 'Delete')) { await store.deletePractice(P.id); toast('Deleted'); location.hash = '#/practices'; } }
    } });
}

function restBetween(user) {
  modal({ title: 'Auto-rest between drills', body: `<p class="muted">Adds a rest after every drill that isn't already followed by rest.</p>
    <div class="row wrap" style="gap:10px">${[15, 30, 60, 90].map(s => `<button class="btn lg" data-act="r" data-s="${s}">${fmtDur(s)}</button>`).join('')}</div>`,
    onAction: (a, el, w, close) => {
      if (a !== 'r') return; close();
      const out = [];
      P.blocks.forEach((b, i) => { out.push(b); const nx = P.blocks[i + 1]; if (b.type !== 'rest' && nx && nx.type !== 'rest') out.push(makeRest(+el.dataset.s)); });
      P.blocks = out; scheduleSave(); draw(user); toast('Rests added', 'success');
    } });
}
