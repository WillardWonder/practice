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
  const last = {}; weights.forEach(w => { if (typeof w.weight === 'number' && (!last[w.athleteId] || w.date > last[w.athleteId].date)) last[w.athleteId] = w; });
  if (rFilter.site === '' && user.prefs?.site && sites.some(s => s.id === user.prefs.site)) rFilter.site = user.prefs.site;
  const draw = () => {
    const q = rFilter.q.toLowerCase();
    const list = athletes.filter(a => (rFilter.showInactive || a.active !== false) && (!rFilter.site || rFilter.site === 'all' || a.site === rFilter.site)
      && (!q || (full(a) + ' ' + (a.nick || '')).toLowerCase().includes(q)));
    $('#rl').innerHTML = list.length ? list.map(a => `<button class="arow ${a.active === false ? 'off' : ''}" data-a="${a.id}">
        <span class="grow"><span class="an">${esc(a.last)}, ${esc(a.first)}${a.nick ? ` <span class="muted">(${esc(a.nick)})</span>` : ''}</span>
        <span class="as">${[a.grade ? 'Gr ' + a.grade : '', a.weightClass ? a.weightClass + ' lb' : '', a.level, siteName(sites, a.site), a.active === false ? 'inactive' : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
        ${coach && last[a.id] ? `<span class="aw">${last[a.id].weight}<small>${fmtDate(last[a.id].date)}</small></span>` : ''}</button>`).join('')
      : `<div class="empty">${athletes.length ? 'No one matches.' : coach ? 'No wrestlers yet. Tap <b>Paste a list</b> to add the whole team at once.' : 'No roster yet.'}</div>`;
    $('#rcount').textContent = `${list.length} wrestler${list.length === 1 ? '' : 's'}`;
    $$('[data-a]').forEach(b => b.onclick = () => coach && editAthlete(athletes.find(x => x.id === b.dataset.a), sites, weights, () => viewRoster(main, user)));
  };
  main.innerHTML = `<div class="page-head"><div><h1>Roster</h1><div class="muted small" id="rcount"></div></div>
      ${coach ? `<div class="row wrap" style="gap:8px"><a class="btn go" href="#/weighin">✓ Check-in &amp; weigh-in</a><a class="btn" href="#/lineup">📷 Photo caption</a><a class="btn" href="#/sizes">👕 Sizes</a><a class="btn" href="#/paper">📰 Newspaper</a></div>` : ''}</div>
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
      <label class="field"><span class="tiny">Weight class</span><input class="input" id="aw" value="${esc(a?.weightClass || '')}" inputmode="numeric" placeholder="e.g. 120"></label>
      <label class="field"><span class="tiny">Level</span><select class="input" id="av"><option value=""></option>${LEVELS.map(l => `<option ${a?.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${sites.length ? `<label class="field"><span class="tiny">Building</span><select class="input" id="as"><option value=""></option>${sites.map(s => `<option value="${s.id}" ${site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <label class="field"><span class="tiny">Mid-season goal</span><input class="input" id="agm" value="${esc(a?.goalMid || '')}" placeholder="e.g. Escape from bottom in under 30 seconds by the holiday tournament"></label>
    <label class="field"><span class="tiny">Season (long-term) goal</span><input class="input" id="agl" value="${esc(a?.goalLong || '')}" placeholder="e.g. Qualify for sectionals at 120"></label></div>`;
}
function readAthlete(w, base = {}) {
  const first = w.querySelector('#af').value.trim(), last = w.querySelector('#al').value.trim();
  if (!first || !last) { toast('First and last name, please', 'error'); return null; }
  return { ...base, first, last, nick: w.querySelector('#an').value.trim(), grade: w.querySelector('#ag').value, weightClass: w.querySelector('#aw').value.trim(), goalMid: w.querySelector('#agm').value.trim(), goalLong: w.querySelector('#agl').value.trim(), level: w.querySelector('#av').value,
    site: w.querySelector('#as')?.value || base.site || '', active: base.active !== false };
}

function editAthlete(a, sites, weights, done) {
  const hist = a ? weights.filter(w => w.athleteId === a.id && typeof w.weight === 'number').sort((x, y) => y.date.localeCompare(x.date)) : [];
  const goals = a ? weights.filter(w => w.athleteId === a.id && w.goal?.what).sort((x, y) => y.date.localeCompare(x.date)) : [];
  const absent = a ? weights.filter(w => w.athleteId === a.id && w.absent).length : 0;
  modal({ title: a ? full(a) : 'Add wrestler', body: athleteForm(a, sites, store.user) + (a ? `
      ${goals.length ? `<div class="tiny" style="margin:16px 0 6px">Practice goals · ${goals.filter(g => g.met === true).length} of ${goals.filter(g => g.met !== undefined).length} hit</div>
        <div class="wh">${goals.slice(0, 15).map(g => `<div class="small">${g.met === true ? '✅' : g.met === false ? '⬜' : '·'} <b>${fmtDate(g.date)}</b> ${esc(goalText(g.goal))}</div>`).join('')}</div>` : ''}
      ${absent ? `<div class="small muted" style="margin-top:8px">Missed ${absent} practice${absent === 1 ? '' : 's'}</div>` : ''}
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
  const W = weights.filter(w => typeof w.weight === 'number');
  const dates = [...new Set(W.map(w => w.date))].sort();
  const by = {}; W.forEach(w => { (by[w.athleteId] ||= {})[w.date] = w.weight; });
  const rows = [['last', 'first', 'goes_by', 'grade', 'level', 'building', 'active', ...dates]].concat(athletes.map(a =>
    [a.last, a.first, a.nick || '', a.grade || '', a.level || '', siteName(sites, a.site), a.active === false ? 'no' : 'yes', ...dates.map(d => by[a.id]?.[d] ?? '')]));
  download(`roster-${today()}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}

// ---- Daily check-in: attendance, weigh-in, practice goal -----------------
// One record per girl per day (weighins/{date}_{athleteId}): weight, absent, goal.
export const WORDS = ['Consistent', 'Persistent', 'Resilient', 'Relentless', 'Respectful'];
const WORD_HINT = {
  Consistent: 'same good habit every rep', Persistent: 'keep going after it doesn\'t work', Resilient: 'bounce back after a mistake',
  Relentless: 'nonstop effort and pace', Respectful: 'partners, coaches, the room',
};

// SMART check for a goal that has to be achievable in ONE practice.
export function smartCheck(g) {
  const all = `${g.what || ''} ${g.measure || ''} ${g.when || ''}`.toLowerCase();
  const big = /\b(state|conference|season|win (every|all)|pin everyone|never|always|perfect|every match|undefeated|lose \d+ ?(lb|pounds)|make weight|varsity)\b/.test(all);
  return [
    { k: 'R', label: 'Relevant: picked a focus word', ok: WORDS.includes(g.word) },
    { k: 'S', label: 'Specific: says exactly what she\'ll do', ok: (g.what || '').trim().split(/\s+/).length >= 3 },
    { k: 'M', label: 'Measurable: a number or a clear way to know', ok: /\d|\b(every|each|all|zero|no |none|twice|once|three|four|five|ten|times|reps|shots|goes)\b/.test((g.measure || '').toLowerCase()) },
    { k: 'T', label: 'Time-bound: when in today\'s practice', ok: (g.when || '').trim().length >= 3 },
    { k: 'A', label: 'Achievable today (not a season goal)', ok: !big && !!(g.what || '').trim() },
  ];
}
export const goalText = (g) => g && g.what ? `${g.word ? g.word.toUpperCase() + ': ' : ''}${g.what.trim()}${g.measure ? ', ' + g.measure.trim() : ''}${g.when ? ', ' + g.when.trim() : ''}.` : '';

export async function teamGoals(site) {
  const all = await store.list('teamgoals').catch(() => []);
  const key = site && site !== 'all' ? site : 'team';
  return { day: all.find(x => x.id === `${key}-${today()}`)?.text || '', season: all.find(x => x.id === `${key}-season`)?.text || '', mid: all.find(x => x.id === `${key}-mid`)?.text || '', key };
}

let wDate = null, wSite = null;
export async function viewWeighIn(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, recs] = await Promise.all([load(), loadWeights()]);
  wDate ||= today();
  if (wSite === null) wSite = sites.some(s => s.id === user.prefs?.site) ? user.prefs.site : 'all';
  let tg = await teamGoals(wSite);
  const list = () => athletes.filter(a => a.active !== false && (wSite === 'all' || !sites.length || a.site === wSite));
  const recOf = (id, date = wDate) => recs.find(w => w.athleteId === id && w.date === date);
  const prevW = (id) => recs.filter(w => w.athleteId === id && w.date < wDate && typeof w.weight === 'number').sort((x, y) => y.date.localeCompare(x.date))[0];
  const prevGoal = (id) => recs.filter(w => w.athleteId === id && w.date < wDate && w.goal?.what).sort((x, y) => y.date.localeCompare(x.date))[0];
  const saveRec = async (id, patch) => {
    const cur = recOf(id) || { athleteId: id, date: wDate };
    const next = { ...cur, ...patch }; delete next.id; delete next.updatedAt; delete next.by;
    Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);
    const docId = `${wDate}_${id}`;
    await store.put('weighins', docId, next);
    const k = recs.findIndex(w => w.athleteId === id && w.date === wDate); const rec = { ...next, id: docId };
    if (k >= 0) recs[k] = rec; else recs.push(rec);
    return rec;
  };
  const rowHTML = (a, i) => { const r = recOf(a.id), p = prevW(a.id), off = !!r?.absent;
    return `<div class="wrow ${off ? 'off' : ''}" data-a="${a.id}">
      <div class="grow" style="min-width:0"><div class="an">${esc(a.first)} ${esc(a.last)}</div>
        <div class="as">${p ? `Last: ${p.weight} (${fmtDate(p.date)})` : 'No previous weigh-in'}${r?.goal?.what ? ` · 🎯 <b style="color:#93c5fd">${esc(r.goal.word)}</b>` : ''}</div></div>
      <button class="btn sm ${r?.goal?.what ? 'primary' : ''}" data-act="goal" ${off ? 'disabled' : ''}>🎯${r?.goal?.what ? '' : ' Goal'}</button>
      <span class="wd" id="d-${a.id}">${typeof r?.weight === 'number' && p ? diffHTML(r.weight - p.weight) : ''}</span>
      <input class="input wi ${typeof r?.weight === 'number' ? 'saved' : ''}" inputmode="decimal" enterkeyhint="next" data-i="${i}" value="${typeof r?.weight === 'number' ? r.weight : ''}" placeholder="—" ${off ? 'disabled' : ''} aria-label="Weight">
      <button class="btn sm ${off ? 'danger' : 'ghost'}" data-act="absent" title="Mark not here">${off ? 'Not here' : '✓ Here'}</button></div>`; };
  const draw = () => { const L = list(); $('#wl').innerHTML = L.length ? L.map(rowHTML).join('') : `<div class="empty">No active wrestlers${wSite !== 'all' ? ' in this building' : ''}. Add them on the <a href="#/roster">Roster</a>.</div>`; count(); };
  const count = () => { const L = list(); const abs = L.filter(a => recOf(a.id)?.absent).length; const w = L.filter(a => typeof recOf(a.id)?.weight === 'number').length; const g = L.filter(a => recOf(a.id)?.goal?.what).length;
    $('#wc').textContent = `${L.length - abs} here · ${abs} not here · ${w} weighed · ${g} goals set`; };
  const goalsCard = () => `<div class="card stack" style="margin-bottom:12px"><div class="row between"><b>🏆 Team goals</b><button class="btn sm" data-act="tgedit">Edit</button></div>
    <div class="small"><span class="tiny">Today</span><br>${esc(tg.day) || '<span class="muted">Not set yet</span>'}</div>
    ${tg.mid ? `<div class="small"><span class="tiny">Mid-season</span><br>${esc(tg.mid)}</div>` : ''}
    <div class="small"><span class="tiny">Season</span><br>${esc(tg.season) || '<span class="muted">Not set yet</span>'}</div></div>`;
  main.innerHTML = `<div class="page-head"><div><h1>Check-in</h1><div class="muted small" id="wc"></div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      <input type="date" class="input" id="wdt" value="${wDate}" style="width:auto">
      ${sites.length ? `<select class="input" id="wst" style="width:auto"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${wSite === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <button class="btn ghost sm" id="wcsv">⬇ Export this day</button></div>
    <div id="tgc">${goalsCard()}</div>
    <div class="small muted" style="margin-bottom:8px">Everyone starts as here. Tap <b>✓ Here</b> to mark someone not here. Type a weight and hit Enter to jump to the next girl. Each girl taps 🎯 to set her goal for today.</div>
    <div class="plist" id="wl"></div>`;
  $('#wdt').onchange = (e) => { wDate = e.target.value || today(); draw(); };
  $('#wst') && ($('#wst').onchange = async (e) => { wSite = e.target.value; tg = await teamGoals(wSite); $('#tgc').innerHTML = goalsCard(); draw(); });
  $('#wcsv').onclick = () => {
    const rows = [['last', 'first', 'date', 'here', 'weight', 'change', 'goal_word', 'goal', 'last_goal_met']].concat(list().map(a => { const r = recOf(a.id), p = prevW(a.id);
      return [a.last, a.first, wDate, r?.absent ? 'no' : 'yes', r?.weight ?? '', typeof r?.weight === 'number' && p ? Math.round((r.weight - p.weight) * 10) / 10 : '', r?.goal?.word || '', goalText(r?.goal), r?.prevMet ?? '']; }));
    download(`check-in-${wDate}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  const saveWeight = async (inp) => {
    const id = inp.closest('[data-a]').dataset.a; const v = inp.value.trim();
    if (!v) { if (typeof recOf(id)?.weight === 'number') { await saveRec(id, { weight: undefined }).catch(() => {}); inp.classList.remove('saved'); count(); } return; }
    const n = Math.round(parseFloat(v) * 10) / 10;
    if (!(n > 0 && n < 500)) { inp.classList.add('bad'); return toast('That weight looks off', 'error'); }
    inp.classList.remove('bad');
    try { await saveRec(id, { weight: n }); inp.classList.add('saved'); const p = prevW(id); $(`#d-${id}`).innerHTML = p ? diffHTML(n - p.weight) : ''; count(); }
    catch (e) { toast('Not saved: ' + (e.code || e.message), 'error'); }
  };
  $('#wl').addEventListener('change', (e) => { if (e.target.matches('.wi')) saveWeight(e.target); });
  $('#wl').addEventListener('keydown', (e) => {
    if (!e.target.matches('.wi') || e.key !== 'Enter') return;
    e.preventDefault(); let i = +e.target.dataset.i + 1, nx; while ((nx = $(`.wi[data-i="${i}"]`)) && nx.disabled) i++; if (nx) { nx.focus(); nx.select(); } else e.target.blur();
  });
  main.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.dataset.act === 'tgedit') return editTeamGoals(tg, async () => { tg = await teamGoals(wSite); $('#tgc').innerHTML = goalsCard(); });
    const row = b.closest('[data-a]'); if (!row) return;
    const a = athletes.find(x => x.id === row.dataset.a);
    if (b.dataset.act === 'absent') {
      const off = !recOf(a.id)?.absent;
      try { await saveRec(a.id, { absent: off || undefined, ...(off ? { weight: undefined } : {}) }); row.outerHTML = rowHTML(a, list().indexOf(a)); count(); } catch (err) { toast(err.code || err.message, 'error'); }
    }
    if (b.dataset.act === 'goal') goalSheet(a, recOf(a.id), prevGoal(a.id), tg, async (goal, prevMet, pg) => {
      await saveRec(a.id, { goal, ...(prevMet !== null ? { prevMet } : {}) });
      if (pg && prevMet !== null) { const { id, updatedAt, by, ...rest } = pg; await store.put('weighins', pg.id, { ...rest, met: prevMet }).catch(() => {}); pg.met = prevMet; }
      const r = $(`[data-a="${a.id}"]`); if (r) r.outerHTML = rowHTML(a, list().indexOf(a)); count();
    });
  };
  draw();
}
const diffHTML = (d) => { d = Math.round(d * 10) / 10; return d === 0 ? '<span class="small muted">±0</span>' : `<span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`; };

function goalSheet(a, rec, pg, tg, onSave) {
  const g = { word: '', what: '', measure: '', when: '', ...(rec?.goal || {}) };
  let met = pg && pg.met !== undefined ? pg.met : null;
  const checks = () => smartCheck(g).map(c => `<div class="sm ${c.ok ? 'ok' : ''}"><b>${c.k}</b> ${esc(c.label)}</div>`).join('');
  const m = modal({ title: `${a.first}'s goal for today`, body: `<div class="stack">
    ${a.goalLong || a.goalMid ? `<div class="card" style="background:#0d1428"><div class="tiny">Your bigger goals</div>${a.goalMid ? `<div class="small" style="margin-top:4px"><b>Mid-season:</b> ${esc(a.goalMid)}</div>` : ''}${a.goalLong ? `<div class="small" style="margin-top:4px"><b>Season:</b> ${esc(a.goalLong)}</div>` : ''}</div>` : ''}
    ${tg.day ? `<div class="small"><span class="tiny">Team goal today</span><br>${esc(tg.day)}</div>` : ''}
    ${pg ? `<div class="card" style="background:#0d1428"><div class="tiny">Last goal (${fmtDate(pg.date)})</div><div class="small" style="margin:4px 0 8px">${esc(goalText(pg.goal))}</div>
      <div class="row" style="gap:6px"><span class="small">Did you hit it?</span><button class="chip ${met === true ? 'on' : ''}" data-act="met" data-v="1">✓ Yes</button><button class="chip ${met === false ? 'on' : ''}" data-act="met" data-v="0">✗ Not yet</button></div></div>` : ''}
    <div><div class="tiny" style="margin-bottom:6px">1. Pick your focus word</div><div class="row wrap" style="gap:6px">${WORDS.map(w => `<button class="chip word ${g.word === w ? 'on' : ''}" data-act="word" data-w="${w}">${w}</button>`).join('')}</div>
      <div class="small muted" id="whint" style="margin-top:4px">${g.word ? esc(WORD_HINT[g.word]) : ''}</div></div>
    <label class="field"><span class="tiny">2. What will you do? (be specific)</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Finish my single leg by running the pipe"></label>
    <label class="field"><span class="tiny">3. How many, or how will you know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. at least 5 times, or every rep"></label>
    <label class="field"><span class="tiny">4. When in practice?</span><input class="input" data-g="when" value="${esc(g.when)}" placeholder="e.g. during live goes today"></label>
    <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Your goal</div><div id="gprev" style="font-weight:700">${esc(goalText(g)) || '<span class="muted">Fill in the steps above</span>'}</div>
      <div class="smart" id="gchk" style="margin-top:10px">${checks()}</div></div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="save">Save goal</button>`,
    onAction: async (act, el, w, close) => {
      if (act === 'word') { g.word = el.dataset.w; w.querySelectorAll('.chip.word').forEach(c => c.classList.toggle('on', c === el)); w.querySelector('#whint').textContent = WORD_HINT[g.word]; refresh(); }
      if (act === 'met') { met = el.dataset.v === '1'; w.querySelectorAll('[data-act=met]').forEach(c => c.classList.toggle('on', c === el)); }
      if (act === 'save') {
        const bad = smartCheck(g).filter(c => !c.ok);
        if (bad.length) return toast('Not a SMART goal yet: ' + bad.map(c => c.label.split(':')[0]).join(', '), 'error');
        try { await onSave({ word: g.word, what: g.what.trim(), measure: g.measure.trim(), when: g.when.trim() }, met, pg); close(); toast('Goal saved', 'success'); } catch (e) { toast(e.code || e.message, 'error'); }
      }
    } });
  const refresh = () => { m.el.querySelector('#gprev').textContent = goalText(g) || 'Fill in the steps above'; m.el.querySelector('#gchk').innerHTML = checks(); };
  m.el.querySelector('.mb').addEventListener('input', (e) => { if (e.target.dataset.g) { g[e.target.dataset.g] = e.target.value; refresh(); } });
}

function editTeamGoals(tg, done) {
  modal({ title: 'Team goals', body: `<div class="stack">
    <label class="field"><span class="tiny">Today (${fmtDate(today())})</span><textarea class="input" id="tgd" rows="2" placeholder="e.g. RELENTLESS: every girl finishes 10 shots in live goes, no one stops on the whistle">${esc(tg.day)}</textarea></label>
    <label class="field"><span class="tiny">Mid-season</span><textarea class="input" id="tgm" rows="2" placeholder="e.g. Every varsity girl wrestles at least 10 matches by the holiday tournament">${esc(tg.mid)}</textarea></label>
    <label class="field"><span class="tiny">Season</span><textarea class="input" id="tgs" rows="2" placeholder="e.g. Qualify 5 girls for sectionals">${esc(tg.season)}</textarea></label>
    <div class="small muted">These show on the check-in screen, on each girl's goal sheet, and on the room TV.</div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>`,
    onAction: async (act, el, w, close) => {
      if (act !== 'save') return;
      try {
        await store.put('teamgoals', `${tg.key}-${today()}`, { text: w.querySelector('#tgd').value.trim(), date: today() });
        await store.put('teamgoals', `${tg.key}-mid`, { text: w.querySelector('#tgm').value.trim() });
        await store.put('teamgoals', `${tg.key}-season`, { text: w.querySelector('#tgs').value.trim() });
        close(); toast('Team goals saved', 'success'); done();
      } catch (e) { toast(e.code || e.message, 'error'); }
    } });
}

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
    const head = L.team ? `${L.team}. ` : '';
    const credit = L.photographer ? ` (Photo by ${L.photographer})` : '';
    return head + parts.join('. ') + (parts.length ? '.' : '') + (missing.length ? ` Not pictured: ${missing.join(', ')}.` : '') + credit;
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
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:10px">
      <label class="field"><span class="tiny">Team name (starts the caption)</span><input class="input" id="lteam" value="${esc(L.team ?? 'Merrill High School Girls Wrestling')}"></label>
      <label class="field"><span class="tiny">Photo by (the paper credits this)</span><input class="input" id="lph" value="${esc(L.photographer || '')}" placeholder="Photographer's name"></label></div>
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
  L.team ??= 'Merrill High School Girls Wrestling';
  $('#lteam').oninput = (e) => { L.team = e.target.value.trim(); draw(); };
  $('#lph').oninput = (e) => { L.photographer = e.target.value.trim(); draw(); };
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


// ---- Gear sizes ----------------------------------------------------------
const SIZE_LIST = ['YS', 'YM', 'YL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const DEFAULT_GEAR = { items: ['T-shirt', 'Hoodie', 'Shorts'],
  message: 'Gear sizes: please order ONE SIZE UP from what you wear right now. Team gear runs small, it shrinks a little in the wash, and you need room to move and grow during the season. If you are between sizes, go bigger.' };
async function gearSettings() { try { const s = (await store.list('settings')).find(x => x.id === 'gear'); return { ...DEFAULT_GEAR, ...(s || {}) }; } catch (e) { return { ...DEFAULT_GEAR }; } }

export async function viewSizes(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, gear] = await Promise.all([load(), gearSettings()]);
  let site = sites.some(x => x.id === user.prefs?.site) ? user.prefs.site : 'all';
  const list = () => athletes.filter(a => a.active !== false && (site === 'all' || !sites.length || a.site === site));
  const saveGear = () => store.put('settings', 'gear', { items: gear.items, message: gear.message }).catch(e => toast(e.code || e.message, 'error'));
  const totals = () => gear.items.map(it => { const c = {}; list().forEach(a => { const v = a.sizes?.[it]; if (v) c[v] = (c[v] || 0) + 1; });
    const missing = list().filter(a => !a.sizes?.[it]).length;
    return `<div class="szt"><b>${esc(it)}</b> ${SIZE_LIST.filter(z => c[z]).map(z => `<span class="badge">${z} × ${c[z]}</span>`).join(' ') || '<span class="muted small">none yet</span>'}${missing ? ` <span class="small" style="color:#fde68a">${missing} missing</span>` : ''}</div>`; }).join('');
  const draw = () => {
    $('#szl').innerHTML = list().map(a => `<div class="card szrow" data-a="${a.id}"><div class="an" style="margin-bottom:6px">${esc(a.first)} ${esc(a.last)}</div>
      ${gear.items.map(it => `<div class="szline"><span class="small muted" style="width:70px">${esc(it)}</span><div class="row wrap" style="gap:4px">${SIZE_LIST.map(z => `<button class="sz ${a.sizes?.[it] === z ? 'on' : ''}" data-it="${esc(it)}" data-z="${z}">${z}</button>`).join('')}</div></div>`).join('')}</div>`).join('')
      || '<div class="empty">No active wrestlers. Add them on the <a href="#/roster">Roster</a>.</div>';
    $('#szt').innerHTML = totals();
  };
  main.innerHTML = `<div class="page-head"><div><h1>Gear sizes</h1><div class="muted small">Tap each girl's size. Totals at the bottom are ready for the order.</div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
    <div class="card stack" style="margin-bottom:12px"><div class="row between"><b>Message to the team</b><button class="btn gold sm" id="szcp">Copy message</button></div>
      <textarea class="input" id="szm" rows="3">${esc(gear.message)}</textarea>
      <div class="row wrap" style="gap:6px"><span class="tiny">Items</span>${gear.items.map((it, i) => `<span class="chip on">${esc(it)} <button class="btn ghost sm" data-rmit="${i}" style="padding:0 4px;color:#111">✕</button></span>`).join('')}
        <form id="szadd" class="row" style="gap:6px"><input class="input" id="szi" placeholder="Add item (e.g. Singlet)" style="width:180px"><button class="btn sm">Add</button></form></div></div>
    ${sites.length ? `<select class="input" id="szs" style="width:auto;margin-bottom:10px"><option value="all">All buildings</option>${sites.map(x => `<option value="${x.id}" ${site === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
    <div class="stack" id="szl"></div>
    <div class="card" style="margin-top:12px"><div class="row between"><b>Order totals</b><button class="btn sm" id="szcsv">⬇ Export</button></div><div id="szt" class="stack" style="margin-top:8px"></div></div>`;
  $('#szm').onchange = (e) => { gear.message = e.target.value; saveGear(); };
  $('#szcp').onclick = async () => { try { await navigator.clipboard.writeText($('#szm').value); toast('Copied. Paste it into your team text or email.', 'success'); } catch (e) { prompt('Copy:', $('#szm').value); } };
  $('#szadd').onsubmit = (e) => { e.preventDefault(); const v = $('#szi').value.trim(); if (!v || gear.items.includes(v)) return; gear.items.push(v); saveGear(); viewSizes(main, user); };
  $$('[data-rmit]').forEach(b => b.onclick = () => { gear.items.splice(+b.dataset.rmit, 1); saveGear(); viewSizes(main, user); });
  $('#szs') && ($('#szs').onchange = (e) => { site = e.target.value; draw(); });
  $('#szcsv').onclick = () => {
    const rows = [['last', 'first', ...gear.items]].concat(list().map(a => [a.last, a.first, ...gear.items.map(it => a.sizes?.[it] || '')]));
    download(`gear-sizes-${today()}.csv`, rows.map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n'), 'text/csv');
  };
  $('#szl').onclick = async (e) => {
    const b = e.target.closest('.sz'); if (!b) return;
    const a = athletes.find(x => x.id === b.closest('[data-a]').dataset.a);
    a.sizes = { ...(a.sizes || {}), [b.dataset.it]: a.sizes?.[b.dataset.it] === b.dataset.z ? '' : b.dataset.z };
    b.parentElement.querySelectorAll('.sz').forEach(x => x.classList.toggle('on', x === b && a.sizes[b.dataset.it] === b.dataset.z));
    $('#szt').innerHTML = totals();
    const { id, ...data } = a; try { await store.put('athletes', a.id, data); } catch (err) { toast('Not saved: ' + (err.code || err.message), 'error'); }
  };
  draw();
}

// ---- Newspaper season profile (Merrill Foto News) -------------------------
const YEAR = { '9': 'Fr.', '10': 'So.', '11': 'Jr.', '12': 'Sr.', '8': '8th', '7': '7th', '6': '6th' };
export const paperName = (a) => `${a.first} ${a.last}${a.grade || a.weightClass ? ` (${[YEAR[a.grade] || (a.grade ? 'Gr. ' + a.grade : ''), a.weightClass].filter(Boolean).join('-')})` : ''}`;
const PFIELDS = [
  ['sport', 'Sport', 1, 'Girls Wrestling'], ['head', 'Head Coach (years as head coach, e.g. 3rd year)', 1, ''], ['assistants', 'Assistant Coaches (years, e.g. 2nd year)', 2, ''],
  ['record', '2025-26 Record', 1, ''], ['post', '2025-26 Post Season Results', 2, ''], ['allconf', 'Returning All-Conference', 2, ''],
  ['returners', 'Key Returners (from last season)', 3, ''], ['losses', 'Key Losses (from last season)', 2, ''], ['newcomers', 'Key Newcomers (name, year and weight)', 3, ''],
  ['recap', '2025-26 Recap: high points, matches of note, performances, strengths and weaknesses', 6, ''],
  ['outlook', '2026-27 Outlook: strengths, areas to improve, keys to success, opponents and conference', 6, ''],
  ['final', 'A Final Word From The Coach: goals, big events, community support', 4, ''],
];
let pTeam = null;
export async function viewPaper(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, profiles] = await Promise.all([load(), store.list('profiles').catch(() => [])]);
  const teams = sites.length ? sites : [{ id: 'team', name: 'Girls Wrestling' }];
  pTeam ||= teams.some(t => t.id === user.prefs?.site) ? user.prefs.site : teams[0].id;
  const pid = `${pTeam}-2026-27`;
  const P = { ...Object.fromEntries(PFIELDS.map(f => [f[0], f[3]])), ...(profiles.find(x => x.id === pid) || {}) };
  const roster = athletes.filter(a => a.active !== false && (!sites.length || a.site === pTeam));
  let lineup = null; try { lineup = JSON.parse(localStorage.getItem('practice-lineup') || 'null'); } catch (e) {}
  const text = () => {
    const out = [`${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)} Merrill Foto News Winter Sports Preview`, ''];
    PFIELDS.forEach(([k, label]) => { out.push(`${label.split(':')[0].replace(/\s*\(.*\)$/, '')}: ${(P[k] || '').trim()}`, ''); });
    if (P.caption) out.push(`Team photo caption: ${P.caption}`, '');
    return out.join('\n').trim();
  };
  let saveT = null;
  const save = () => { clearTimeout(saveT); $('#pst').textContent = 'Saving…'; saveT = setTimeout(async () => { try { const { id, ...data } = P; await store.put('profiles', pid, data); $('#pst').textContent = '✓ Saved, shared with every coach'; } catch (e) { $('#pst').textContent = '⚠ ' + (e.code || e.message); } }, 700); };
  main.innerHTML = `<div class="page-head"><div><h1>Newspaper profile</h1><div class="muted small">Merrill Foto News, Winter Sports Profile · due to Tina Scott by <b>Friday, Nov. 20</b></div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
    ${teams.length > 1 ? `<div class="seg" style="display:flex;flex-wrap:wrap;margin-bottom:12px">${teams.map(t => `<button class="${t.id === pTeam ? 'on' : ''}" data-team="${t.id}">${esc(t.name)}</button>`).join('')}</div>` : ''}
    <div class="small muted" id="pst" style="margin-bottom:8px">Every coach sees and edits the same profile. It saves as you type.</div>
    <div class="stack" id="pf">${PFIELDS.map(([k, label, rows]) => `<label class="field"><span class="tiny">${esc(label)}</span>
      ${rows > 1 ? `<textarea class="input" data-k="${k}" rows="${rows}">${esc(P[k] || '')}</textarea>` : `<input class="input" data-k="${k}" value="${esc(P[k] || '')}">`}
      ${['returners', 'newcomers', 'allconf', 'losses'].includes(k) ? `<button class="btn sm" data-pick="${k}" style="margin-top:6px">＋ Add from roster</button>` : ''}</label>`).join('')}
      <label class="field"><span class="tiny">Team photo caption (with photographer)</span><textarea class="input" data-k="caption" rows="3">${esc(P.caption || '')}</textarea>
        <button class="btn sm" id="pcap" style="margin-top:6px">⤓ Use the caption from Photo caption</button></label>
    </div>
    <div class="card" style="margin-top:14px;border-color:rgba(250,204,21,.4)"><div class="row wrap between" style="gap:8px"><b>Send it to Tina</b>
      <span class="row wrap" style="gap:6px"><button class="btn gold" id="pcopy">Copy for email</button><a class="btn" id="pmail" href="#">✉ Open email</a></span></div>
      <div class="small muted" style="margin-top:6px">To: tscott@mmclocal.com. Attach the team photo, and paste the text if your email app cuts it short.</div></div>`;
  $('#pf').oninput = (e) => { const k = e.target.dataset.k; if (k) { P[k] = e.target.value; save(); } };
  $$('[data-team]').forEach(b => b.onclick = () => { pTeam = b.dataset.team; viewPaper(main, user); });
  $('#pcap').onclick = () => { const c = lineup ? (() => { const n = ROW_NAMES(lineup.rowsCount); const parts = lineup.rows.map((r, i) => r.length ? `${n[i]}${lineup.rowsCount > 1 ? ', from left' : ''}: ${r.map(x => x.name).join(', ')}` : '').filter(Boolean);
      return (lineup.team ? lineup.team + '. ' : '') + parts.join('. ') + (parts.length ? '.' : '') + (lineup.photographer ? ` (Photo by ${lineup.photographer})` : ''); })() : '';
    if (!c) return toast('Make the caption first: Roster → Photo caption', 'error');
    P.caption = c; $('[data-k=caption]').value = c; save(); };
  $$('[data-pick]').forEach(b => b.onclick = () => {
    const k = b.dataset.pick; let q = '';
    const rows = () => roster.filter(a => !q || `${a.first} ${a.last}`.toLowerCase().includes(q.toLowerCase())).map(a => `<button class="dr" data-act="pk" data-id="${a.id}"><span class="grow"><span class="dr-t" style="text-transform:none">${esc(paperName(a))}</span></span><span class="dr-plus">＋</span></button>`).join('') || '<div class="empty">No wrestlers on the roster for this team.</div>';
    const m = modal({ title: 'Add from roster', wide: true, body: `<div class="small muted" style="margin-bottom:8px">Adds "Name (year-weight)". Set grade and weight class on the Roster so these come out right.</div><input class="input" id="pq" placeholder="🔍 Find…"><div class="drs" id="pl">${rows()}</div>`,
      onAction: (a, el) => { if (a !== 'pk') return; const ath = roster.find(x => x.id === el.dataset.id); P[k] = [P[k], paperName(ath)].filter(Boolean).join(', '); $(`[data-k=${k}]`).value = P[k]; save(); el.remove(); } });
    m.el.querySelector('#pq').oninput = (e) => { q = e.target.value; m.el.querySelector('#pl').innerHTML = rows(); };
  });
  $('#pcopy').onclick = async () => { try { await navigator.clipboard.writeText(text()); toast('Copied. Paste it into your email to Tina.', 'success'); } catch (e) { prompt('Copy:', text()); } };
  $('#pmail').onclick = (e) => { e.preventDefault(); location.href = `mailto:tscott@mmclocal.com?subject=${encodeURIComponent('Winter Sports Profile - ' + (P.sport || 'Girls Wrestling'))}&body=${encodeURIComponent(text().slice(0, 1800))}`; };
}


// ---- Practice goal (required to run) ---------------------------------------
export const goalIsToday = (p) => !!(p?.goal?.what && p.goal.date === today());
// Opens the goal sheet for a practice. onSave(goal) gets {word, what, measure, when, date}.
export function practiceGoalSheet(p, onSave, { reason = '' } = {}) {
  const old = p.goal?.what ? p.goal : null;
  const g = { word: '', what: '', measure: '', when: '', ...(goalIsToday(p) ? p.goal : {}) };
  const checks = () => smartCheck(g).map(c => `<div class="sm ${c.ok ? 'ok' : ''}"><b>${c.k}</b> ${esc(c.label.replace('she', 'the team').replace('She', 'The team'))}</div>`).join('');
  const m = modal({ title: '🎯 Today\'s practice goal', body: `<div class="stack">
    ${reason ? `<div class="small" style="color:#fde68a">${esc(reason)}</div>` : ''}
    ${old && !goalIsToday(p) ? `<div class="card" style="background:#0d1428"><div class="tiny">This practice's goal from ${fmtDate(old.date)}</div><div style="margin:6px 0 8px;font-weight:700">${esc(goalText(old))}</div>
      <div class="small muted" style="margin-bottom:8px">It's a new day, so set today's goal. Reuse it or change it.</div><button class="btn sm" data-act="reuse">↺ Use it again for today</button></div>` : ''}
    <div><div class="tiny" style="margin-bottom:6px">1. Focus word for the team</div><div class="row wrap" style="gap:6px">${WORDS.map(w => `<button class="chip word ${g.word === w ? 'on' : ''}" data-act="word" data-w="${w}">${w}</button>`).join('')}</div></div>
    <label class="field"><span class="tiny">2. What will the team do?</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Every girl gets off bottom with a stand-up"></label>
    <label class="field"><span class="tiny">3. How many, or how will we know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. within 30 seconds, 5 times each"></label>
    <label class="field"><span class="tiny">4. When in practice?</span><input class="input" data-g="when" value="${esc(g.when)}" placeholder="e.g. in the bottom-position live goes"></label>
    <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Today's goal</div><div id="gprev" style="font-weight:700">${esc(goalText(g)) || '<span class="muted">Fill in the steps above</span>'}</div>
      <div class="smart" id="gchk" style="margin-top:10px">${checks()}</div></div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="save">Set today's goal</button>`,
    onAction: async (act, el, w, close) => {
      const sync = () => { w.querySelectorAll('[data-g]').forEach(i => { i.value = g[i.dataset.g] || ''; }); w.querySelectorAll('.chip.word').forEach(c => c.classList.toggle('on', c.dataset.w === g.word)); refresh(); };
      if (act === 'word') { g.word = el.dataset.w; sync(); }
      if (act === 'reuse') { Object.assign(g, { word: old.word, what: old.what, measure: old.measure, when: old.when }); sync(); }
      if (act === 'save') {
        const bad = smartCheck(g).filter(c => !c.ok);
        if (bad.length) return toast('Not a SMART goal yet: ' + bad.map(c => c.label.split(':')[0]).join(', '), 'error');
        const goal = { word: g.word, what: g.what.trim(), measure: g.measure.trim(), when: g.when.trim(), date: today() };
        el.disabled = true;
        try { await onSave(goal); close(); toast('Goal set for today', 'success'); } catch (e) { el.disabled = false; toast(e.code || e.message, 'error'); }
      }
    } });
  const refresh = () => { m.el.querySelector('#gprev').textContent = goalText(g) || 'Fill in the steps above'; m.el.querySelector('#gchk').innerHTML = checks(); };
  m.el.querySelector('.mb').addEventListener('input', (e) => { if (e.target.dataset.g) { g[e.target.dataset.g] = e.target.value; refresh(); } });
}
// Saving a practice goal also makes it today's team goal (check-in screen + TV).
export async function publishTeamGoal(goal, site) {
  const key = site && site !== 'all' ? site : 'team';
  await store.put('teamgoals', `${key}-${today()}`, { text: goalText(goal), date: today(), word: goal.word }).catch(() => {});
}
