// Roster, daily weigh-ins, and team-photo captions.
// Names are entered once here and reused everywhere, so spelling stays right.
import { esc, $, $$, toast, modal, confirmBox, download } from './ui.js';
import { store, can } from './store.js';
import { LEVELS } from './seed.js';

const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const full = (a) => `${a.first} ${a.last}`.trim();
const sortAth = (a, b) => (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || '');
const fmtDate = (d) => new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

async function load() {
  const [athletes, sites] = await Promise.all([store.list('athletes').catch(e => { toast(e.code || e.message, 'error'); return []; }), store.listSites().catch(() => [])]);
  return { athletes: athletes.sort(sortAth), sites };
}
async function loadWeights() { return can(store.user, 'edit') ? store.list('weighins').catch(() => []) : []; }
const siteName = (sites, id) => sites.find(s => s.id === id)?.name || '';

// ---- Roster ----------------------------------------------------------
let rFilter = { q: '', site: '', showInactive: false };
export async function viewRoster(main, user) {
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, weights] = await Promise.all([load(), loadWeights()]);
  const coach = can(user, 'edit');
  const last = {}; weights.forEach(w => { if (!last[w.athleteId] || w.date > last[w.athleteId].date) last[w.athleteId] = w; });
  if (rFilter.site === '' && user.prefs?.site && sites.some(s => s.id === user.prefs.site)) rFilter.site = user.prefs.site;
  const draw = () => {
    const q = rFilter.q.toLowerCase();
    const list = athletes.filter(a => (rFilter.showInactive || a.active !== false) && (!rFilter.site || rFilter.site === 'all' || a.site === rFilter.site)
      && (!q || (full(a) + ' ' + (a.nick || '')).toLowerCase().includes(q)));
    $('#rl').innerHTML = list.length ? list.map(a => `<button class="arow ${a.active === false ? 'off' : ''}" data-a="${a.id}">
        <span class="grow"><span class="an">${esc(a.last)}, ${esc(a.first)}${a.nick ? ` <span class="muted">(${esc(a.nick)})</span>` : ''}</span>
        <span class="as">${[a.grade ? 'Gr ' + a.grade : '', a.level, siteName(sites, a.site), a.active === false ? 'inactive' : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
        ${coach && last[a.id] ? `<span class="aw">${last[a.id].weight}<small>${fmtDate(last[a.id].date)}</small></span>` : ''}</button>`).join('')
      : `<div class="empty">${athletes.length ? 'No one matches.' : coach ? 'No wrestlers yet. Tap <b>Paste a list</b> to add the whole team at once.' : 'No roster yet.'}</div>`;
    $('#rcount').textContent = `${list.length} wrestler${list.length === 1 ? '' : 's'}`;
    $$('[data-a]').forEach(b => b.onclick = () => coach && editAthlete(athletes.find(x => x.id === b.dataset.a), sites, weights, () => viewRoster(main, user)));
  };
  main.innerHTML = `<div class="page-head"><div><h1>Roster</h1><div class="muted small" id="rcount"></div></div>
      ${coach ? `<div class="row wrap" style="gap:8px"><a class="btn go" href="#/weighin">⚖ Weigh-in</a><a class="btn" href="#/lineup">📷 Photo caption</a></div>` : ''}</div>
    ${coach ? `<div class="row wrap" style="gap:8px;margin-bottom:12px"><button class="btn primary" id="addA">＋ Add wrestler</button><button class="btn" id="paste">📋 Paste a list</button><button class="btn ghost sm" id="csv">⬇ Export</button></div>` : ''}
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      <input class="input" id="rq" placeholder="🔍 Search names…" value="${esc(rFilter.q)}" style="max-width:320px">
      ${sites.length ? `<select class="input" id="rs" style="width:auto"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${rFilter.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <label class="small muted row" style="gap:6px"><input type="checkbox" id="ri" ${rFilter.showInactive ? 'checked' : ''}> Show inactive</label>
    </div><div class="plist" id="rl"></div>`;
  $('#rq').oninput = (e) => { rFilter.q = e.target.value; draw(); };
  $('#rs') && ($('#rs').onchange = (e) => { rFilter.site = e.target.value; draw(); });
  $('#ri').onchange = (e) => { rFilter.showInactive = e.target.checked; draw(); };
  if (coach) {
    $('#addA').onclick = () => editAthlete(null, sites, weights, () => viewRoster(main, user));
    $('#paste').onclick = () => pasteList(sites, user, () => viewRoster(main, user));
    $('#csv').onclick = () => exportCsv(athletes, weights, sites);
  }
  draw();
}

function athleteForm(a, sites, user) {
  const site = a?.site ?? user?.prefs?.site ?? '';
  return `<div class="stack">
    <div class="grid" style="grid-template-columns:1fr 1fr"><label class="field"><span class="tiny">First name</span><input class="input" id="af" value="${esc(a?.first || '')}" autocapitalize="words"></label>
      <label class="field"><span class="tiny">Last name</span><input class="input" id="al" value="${esc(a?.last || '')}" autocapitalize="words"></label></div>
    <label class="field"><span class="tiny">Goes by (optional)</span><input class="input" id="an" value="${esc(a?.nick || '')}" placeholder="e.g. Kenzie"></label>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <label class="field"><span class="tiny">Grade</span><select class="input" id="ag"><option value=""></option>${GRADES.map(g => `<option ${a?.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span class="tiny">Level</span><select class="input" id="av"><option value=""></option>${LEVELS.map(l => `<option ${a?.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${sites.length ? `<label class="field"><span class="tiny">Building</span><select class="input" id="as"><option value=""></option>${sites.map(s => `<option value="${s.id}" ${site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
    </div></div>`;
}
function readAthlete(w, base = {}) {
  const first = w.querySelector('#af').value.trim(), last = w.querySelector('#al').value.trim();
  if (!first || !last) { toast('First and last name, please', 'error'); return null; }
  return { ...base, first, last, nick: w.querySelector('#an').value.trim(), grade: w.querySelector('#ag').value, level: w.querySelector('#av').value,
    site: w.querySelector('#as')?.value || base.site || '', active: base.active !== false };
}

function editAthlete(a, sites, weights, done) {
  const hist = a ? weights.filter(w => w.athleteId === a.id).sort((x, y) => y.date.localeCompare(x.date)) : [];
  modal({ title: a ? full(a) : 'Add wrestler', body: athleteForm(a, sites, store.user) + (a ? `
      <div class="tiny" style="margin:16px 0 6px">Weigh-ins</div>
      ${hist.length ? `<div class="wh">${hist.slice(0, 30).map((w, i) => { const prev = hist[i + 1]; const d = prev ? Math.round((w.weight - prev.weight) * 10) / 10 : null;
        return `<div class="row between"><span>${fmtDate(w.date)}</span><span><b>${w.weight}</b> ${d ? `<span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</span></div>`; }).join('')}</div>` : '<div class="small muted">None yet.</div>'}` : ''),
    footer: `${a ? `<button class="btn danger" data-act="toggle">${a.active === false ? 'Make active' : 'Mark inactive'}</button>` : ''}<span class="grow"></span><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>`,
    onAction: async (act, el, w, close) => {
      try {
        if (act === 'save') { const d = readAthlete(w, a ? { ...a } : {}); if (!d) return; const { id, ...data } = d; await store.put('athletes', a?.id, data); close(); toast('Saved', 'success'); done(); }
        if (act === 'toggle') { const { id, ...data } = a; await store.put('athletes', a.id, { ...data, active: a.active === false }); close(); done(); }
      } catch (e) { toast(e.code || e.message, 'error'); }
    } });
}

// "Kenzie Smith 10", "Smith, Kenzie", "Smith, Kenzie, 10"
export function parseNames(text) {
  return text.split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => {
    let grade = ''; const gm = l.match(/[\s,]+(?:gr(?:ade)?\.?\s*)?(\d{1,2}|K)(?:th|st|nd|rd)?\s*$/i);
    if (gm && (gm[1] === 'K' || +gm[1] <= 12)) { grade = gm[1].toUpperCase(); l = l.slice(0, gm.index).trim(); }
    l = l.replace(/^\d+[.)]\s*/, '');
    let first, last;
    if (l.includes(',')) { [last, first] = l.split(',').map(x => x.trim()); }
    else { const p = l.split(/\s+/); last = p.length > 1 ? p.pop() : ''; first = p.join(' '); }
    const cap = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
    return { first: cap(first || ''), last: cap(last || ''), grade };
  }).filter(r => r.first || r.last);
}

function pasteList(sites, user, done) {
  let rows = [];
  const preview = () => rows.length ? `<div class="tiny" style="margin:10px 0 6px">Check the spelling: ${rows.length} wrestlers</div>
    <table class="list"><tr><th>First</th><th>Last</th><th>Gr</th></tr>${rows.map((r, i) => `<tr><td><input class="input" data-i="${i}" data-k="first" value="${esc(r.first)}"></td><td><input class="input" data-i="${i}" data-k="last" value="${esc(r.last)}"></td><td><input class="input" data-i="${i}" data-k="grade" value="${esc(r.grade)}" style="width:56px"></td></tr>`).join('')}</table>` : '';
  const m = modal({ title: 'Paste a list', wide: true, body: `<div class="stack">
      <div class="small muted">One wrestler per line. "First Last", "Last, First", and a grade at the end all work, e.g. <i>Kenzie Smith 10</i>.</div>
      <textarea class="input" id="pl" rows="7" placeholder="Kenzie Smith 10&#10;Ava Jones 9&#10;Lopez, Maria 11"></textarea>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <label class="field"><span class="tiny">Level for everyone</span><select class="input" id="plv"><option value=""></option>${LEVELS.map(l => `<option>${l}</option>`).join('')}</select></label>
        ${sites.length ? `<label class="field"><span class="tiny">Building for everyone</span><select class="input" id="pls"><option value=""></option>${sites.map(s => `<option value="${s.id}" ${user.prefs?.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      </div><div id="pp"></div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="save">Add wrestlers</button>`,
    onAction: async (act, el, w, close) => {
      if (act !== 'save') return;
      const good = rows.filter(r => r.first && r.last);
      if (!good.length) return toast('Paste some names first', 'error');
      const level = w.querySelector('#plv').value, site = w.querySelector('#pls')?.value || '';
      el.disabled = true;
      try { for (const r of good) await store.put('athletes', null, { ...r, nick: '', level, site, active: true }); close(); toast(`Added ${good.length} wrestlers`, 'success'); done(); }
      catch (e) { el.disabled = false; toast(e.code || e.message, 'error'); }
    } });
  const ta = m.el.querySelector('#pl'), pp = m.el.querySelector('#pp');
  ta.oninput = () => { rows = parseNames(ta.value); pp.innerHTML = preview(); };
  pp.oninput = (e) => { const t = e.target; if (t.dataset.i) rows[+t.dataset.i][t.dataset.k] = t.value.trim(); };
}

function exportCsv(athletes, weights, sites) {
  const dates = [...new Set(weights.map(w => w.date))].sort();
  const by = {}; weights.forEach(w => { (by[w.athleteId] ||= {})[w.date] = w.weight; });
  const rows = [['last', 'first', 'goes_by', 'grade', 'level', 'building', 'active', ...dates]].concat(athletes.map(a =>
    [a.last, a.first, a.nick || '', a.grade || '', a.level || '', siteName(sites, a.site), a.active === false ? 'no' : 'yes', ...dates.map(d => by[a.id]?.[d] ?? '')]));
  download(`roster-${today()}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}

// ---- Weigh-in ----------------------------------------------------------
let wDate = null, wSite = null;
export async function viewWeighIn(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, weights] = await Promise.all([load(), loadWeights()]);
  wDate ||= today();
  if (wSite === null) wSite = sites.some(s => s.id === user.prefs?.site) ? user.prefs.site : 'all';
  const list = () => athletes.filter(a => a.active !== false && (wSite === 'all' || !sites.length || a.site === wSite));
  const prevOf = (id) => weights.filter(w => w.athleteId === id && w.date < wDate).sort((x, y) => y.date.localeCompare(x.date))[0];
  const todayOf = (id) => weights.find(w => w.athleteId === id && w.date === wDate);
  const draw = () => {
    const L = list();
    $('#wl').innerHTML = L.length ? L.map((a, i) => { const p = prevOf(a.id), t = todayOf(a.id);
      return `<div class="wrow" data-a="${a.id}"><div class="grow" style="min-width:0"><div class="an">${esc(a.first)} ${esc(a.last)}</div>
        <div class="as">${p ? `Last: ${p.weight} (${fmtDate(p.date)})` : 'No previous weigh-in'}</div></div>
        <span class="wd" id="d-${a.id}">${t && p ? diffHTML(t.weight - p.weight) : ''}</span>
        <input class="input wi ${t ? 'saved' : ''}" inputmode="decimal" enterkeyhint="next" data-i="${i}" value="${t ? t.weight : ''}" placeholder="—" aria-label="Weight for ${esc(a.first)} ${esc(a.last)}"></div>`; }).join('')
      : `<div class="empty">No active wrestlers${wSite !== 'all' ? ' in this building' : ''}. Add them on the <a href="#/roster">Roster</a>.</div>`;
    count();
  };
  const count = () => { const L = list(); const n = L.filter(a => todayOf(a.id)).length; $('#wc').textContent = `${n} of ${L.length} weighed`; };
  main.innerHTML = `<div class="page-head"><div><h1>Weigh-in</h1><div class="muted small" id="wc"></div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      <input type="date" class="input" id="wdt" value="${wDate}" style="width:auto">
      ${sites.length ? `<select class="input" id="wst" style="width:auto"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${wSite === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <button class="btn ghost sm" id="wcsv">⬇ Export this day</button>
    </div>
    <div class="small muted" style="margin-bottom:8px">Type a weight and hit Enter. It saves and jumps to the next wrestler.</div>
    <div class="plist" id="wl"></div>`;
  $('#wdt').onchange = (e) => { wDate = e.target.value || today(); draw(); };
  $('#wst') && ($('#wst').onchange = (e) => { wSite = e.target.value; draw(); });
  $('#wcsv').onclick = () => {
    const rows = [['last', 'first', 'date', 'weight', 'change']].concat(list().map(a => { const t = todayOf(a.id), p = prevOf(a.id);
      return [a.last, a.first, wDate, t?.weight ?? '', t && p ? Math.round((t.weight - p.weight) * 10) / 10 : '']; }));
    download(`weigh-in-${wDate}.csv`, rows.map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n'), 'text/csv');
  };
  const saveOne = async (inp) => {
    const id = inp.closest('[data-a]').dataset.a; const v = inp.value.trim();
    const docId = `${wDate}_${id}`; // one weigh-in per wrestler per day: re-saving overwrites
    if (!v) { if (todayOf(id)) { await store.del('weighins', docId).catch(() => {}); const k = weights.findIndex(w => w.athleteId === id && w.date === wDate); if (k >= 0) weights.splice(k, 1); inp.classList.remove('saved'); count(); } return; }
    const n = Math.round(parseFloat(v) * 10) / 10;
    if (!(n > 0 && n < 500)) { inp.classList.add('bad'); return toast('That weight looks off', 'error'); }
    inp.classList.remove('bad');
    try {
      await store.put('weighins', docId, { athleteId: id, date: wDate, weight: n });
      const k = weights.findIndex(w => w.athleteId === id && w.date === wDate);
      const rec = { id: docId, athleteId: id, date: wDate, weight: n }; if (k >= 0) weights[k] = rec; else weights.push(rec);
      inp.classList.add('saved'); const p = prevOf(id); $(`#d-${id}`).innerHTML = p ? diffHTML(n - p.weight) : ''; count();
    } catch (e) { toast('Not saved: ' + (e.code || e.message), 'error'); }
  };
  $('#wl').addEventListener('change', (e) => { if (e.target.matches('.wi')) saveOne(e.target); });
  $('#wl').addEventListener('keydown', (e) => {
    if (!e.target.matches('.wi') || e.key !== 'Enter') return;
    e.preventDefault(); const nx = $(`.wi[data-i="${+e.target.dataset.i + 1}"]`); if (nx) { nx.focus(); nx.select(); } else e.target.blur();
  });
  draw();
}
const diffHTML = (d) => { d = Math.round(d * 10) / 10; return d === 0 ? '<span class="small muted">±0</span>' : `<span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`; };

// ---- Photo caption (team picture lineup) ----------------------------------
const ROW_NAMES = (n) => n === 1 ? ['From left'] : Array.from({ length: n }, (_, i) => i === 0 ? 'Front row' : i === n - 1 ? 'Back row' : ['Second row', 'Third row', 'Fourth row'][i - 1]);
let L = null;
export async function viewLineup(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const { athletes, sites } = await load();
  if (!L) { try { L = JSON.parse(localStorage.getItem('practice-lineup') || 'null'); } catch (e) { L = null; } }
  L ||= { title: 'Team photo', rowsCount: 3, rows: [[], [], []], cur: 0, site: sites.some(s => s.id === user.prefs?.site) ? user.prefs.site : 'all', notPictured: true, extras: [] };
  const pool = () => athletes.filter(a => a.active !== false && (L.site === 'all' || !sites.length || a.site === L.site));
  const placed = () => new Set(L.rows.flat().filter(x => x.id).map(x => x.id));
  const caption = () => {
    const names = ROW_NAMES(L.rowsCount);
    const parts = L.rows.map((r, i) => r.length ? `${names[i]}${L.rowsCount > 1 ? ', from left' : ''}: ${r.map(x => x.name).join(', ')}` : '').filter(Boolean);
    const missing = L.notPictured ? pool().filter(a => !placed().has(a.id)).map(full) : [];
    return parts.join('. ') + (parts.length ? '.' : '') + (missing.length ? ` Not pictured: ${missing.join(', ')}.` : '');
  };
  const draw = () => {
    const pl = placed(), names = ROW_NAMES(L.rowsCount);
    $('#rows').innerHTML = L.rows.map((r, i) => `<div class="lrow ${L.cur === i ? 'cur' : ''}" data-row="${i}">
        <div class="row between"><b>${names[i]}</b><span class="small muted">${r.length} · ${L.cur === i ? 'adding here' : 'tap to add here'}</span></div>
        <div class="lnames">${r.map((x, k) => `<span class="lchip" data-k="${k}"><span class="ln">${k + 1}</span>${esc(x.name)}<button data-act="rm" aria-label="Remove">✕</button></span>`).join('') || '<span class="small muted">Tap names below, left to right.</span>'}</div></div>`).join('');
    const q = ($('#lq')?.value || '').toLowerCase();
    $('#lpool').innerHTML = pool().filter(a => !pl.has(a.id) && (!q || full(a).toLowerCase().includes(q))).map(a => `<button class="chip" data-add="${a.id}">${esc(full(a))}</button>`).join('') || '<span class="small muted">Everyone is placed.</span>';
    $('#cap').textContent = caption();
    try { localStorage.setItem('practice-lineup', JSON.stringify(L)); } catch (e) {}
    $$('.lnames').forEach((el, i) => { if (window.Sortable) Sortable.create(el, { animation: 150, draggable: '.lchip', onEnd: (e) => { const r = L.rows[i]; const [m] = r.splice(e.oldIndex, 1); r.splice(e.newIndex, 0, m); draw(); } }); });
  };
  main.innerHTML = `<div class="page-head"><div><h1>Photo caption</h1><div class="muted small">Names in order, spelled from the roster</div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      <label class="field"><span class="tiny">Rows</span><select class="input" id="lrc" style="width:auto">${[1, 2, 3, 4, 5].map(n => `<option ${L.rowsCount === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${sites.length ? `<label class="field"><span class="tiny">Building</span><select class="input" id="lst" style="width:auto"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${L.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      <label class="small row" style="gap:6px;align-self:flex-end;padding-bottom:12px"><input type="checkbox" id="lnp" ${L.notPictured ? 'checked' : ''}> List "Not pictured"</label>
      <button class="btn ghost sm" id="lclr" style="align-self:flex-end;margin-bottom:8px">Start over</button>
    </div>
    <div class="small muted" style="margin-bottom:8px">Tap a row, then tap names in order from <b>left to right</b> as you look at the photo. Drag a name to fix the order; ✕ removes it.</div>
    <div id="rows" class="stack"></div>
    <div class="card" style="margin-top:12px"><div class="row wrap between" style="gap:8px"><b>Add to the selected row</b>
      <form id="lx" class="row" style="gap:6px"><input class="input" id="lxn" placeholder="Not on roster? Type a name (e.g. a coach)" style="min-width:240px"><button class="btn sm">Add</button></form></div>
      <input class="input" id="lq" placeholder="🔍 Find a name…" style="margin:10px 0">
      <div class="row wrap" style="gap:6px" id="lpool"></div></div>
    <div class="card" style="margin-top:12px;border-color:rgba(250,204,21,.4)"><div class="row between"><b>Caption for the paper</b><button class="btn gold" id="lcp">Copy caption</button></div>
      <p id="cap" style="line-height:1.55;margin:10px 0 0;white-space:pre-wrap"></p></div>`;
  const resize = (n) => { while (L.rows.length < n) L.rows.push([]); if (L.rows.length > n) { const extra = L.rows.splice(n).flat(); L.rows[n - 1].push(...extra); } L.rowsCount = n; L.cur = Math.min(L.cur, n - 1); };
  $('#lrc').onchange = (e) => { resize(+e.target.value); draw(); };
  $('#lst') && ($('#lst').onchange = (e) => { L.site = e.target.value; draw(); });
  $('#lnp').onchange = (e) => { L.notPictured = e.target.checked; draw(); };
  $('#lclr').onclick = async () => { if (await confirmBox('Start over?', 'Clears every row.', 'Clear')) { L.rows = Array.from({ length: L.rowsCount }, () => []); L.cur = 0; draw(); } };
  $('#lq').oninput = draw;
  $('#lx').onsubmit = (e) => { e.preventDefault(); const n = $('#lxn').value.trim(); if (!n) return; L.rows[L.cur].push({ id: null, name: n }); $('#lxn').value = ''; draw(); };
  $('#lcp').onclick = async () => { try { await navigator.clipboard.writeText(caption()); toast('Caption copied', 'success'); } catch (e) { prompt('Copy the caption:', caption()); } };
  main.onclick = (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { const a = athletes.find(x => x.id === add.dataset.add); L.rows[L.cur].push({ id: a.id, name: full(a) }); draw(); return; }
    if (e.target.closest('[data-act=rm]')) { const r = +e.target.closest('[data-row]').dataset.row, k = +e.target.closest('[data-k]').dataset.k; L.rows[r].splice(k, 1); draw(); return; }
    const row = e.target.closest('.lrow'); if (row && !e.target.closest('.lchip')) { L.cur = +row.dataset.row; draw(); }
  };
  draw();
}
