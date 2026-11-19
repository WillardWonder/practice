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
      ${coach ? `<div class="row wrap" style="gap:8px"><a class="btn go" href="#/weighin">✓ Check-in &amp; weigh-in</a><a class="btn" href="#/lineup">📷 Photo caption</a><a class="btn" href="#/meets">🏆 Meets</a><a class="btn" href="#/checkins">◷ Check-in history</a><a class="btn" href="#/sizes">👕 Sizes</a><a class="btn" href="#/paper">📰 Newspaper</a></div>` : ''}</div>
    ${coach ? `<div class="row wrap" style="gap:8px;margin-bottom:12px"><button class="btn primary" id="addA">＋ Add wrestler</button><button class="btn" id="paste">📋 Paste a list</button><button class="btn ghost sm" id="csv">⬇ Export</button></div>` : ''}
    ${coach ? `<form id="qa" class="card" style="margin-bottom:12px;padding:12px"><div class="tiny" style="margin-bottom:6px">Quick add: type a name, hit Enter, next girl</div>
      <div class="grid" style="grid-template-columns:1fr 1fr 70px auto;gap:6px">
        <input class="input" id="qf" placeholder="First" autocapitalize="words" autocomplete="off"><input class="input" id="ql" placeholder="Last" autocapitalize="words" autocomplete="off">
        <select class="input" id="qg" aria-label="Grade"><option value="">Gr</option>${GRADES.slice(6).map(g => `<option>${g}</option>`).join('')}</select><button class="btn primary">Add</button></div></form>` : ''}
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
    $('#qa').onsubmit = async (e) => {
      e.preventDefault();
      const cap = (x) => x.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
      const first = cap($('#qf').value), last = cap($('#ql').value), grade = $('#qg').value;
      if (!first || !last) return toast('First and last name, please', 'error');
      if (athletes.some(a => a.first.toLowerCase() === first.toLowerCase() && a.last.toLowerCase() === last.toLowerCase())) return toast(`${first} ${last} is already on the roster`, 'error');
      const site = rFilter.site && rFilter.site !== 'all' ? rFilter.site : (user.prefs?.site || '');
      try { const id = await store.put('athletes', null, { first, last, grade, nick: '', level: '', site, active: true }); athletes.push({ id, first, last, grade, site, active: true }); athletes.sort(sortAth); toast(`Added ${first} ${last}`, 'success'); }
      catch (err) { return toast('Not saved: ' + (err.code || err.message), 'error'); }
      $('#qf').value = ''; $('#ql').value = ''; $('#qg').value = ''; $('#qf').focus(); draw();
    };
    $('#ql').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#qa').requestSubmit(); } };
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
      <div class="row between" style="margin:16px 0 6px"><span class="tiny">Weigh-ins</span><button class="btn sm" data-act="addw">＋ Add a weigh-in</button></div>
      <div id="addw" class="hidden row wrap" style="gap:6px;margin-bottom:8px"><input type="date" class="input" id="awd" value="${today()}" style="width:auto"><input class="input" id="aww" inputmode="decimal" placeholder="Weight" style="width:100px"><input class="input" id="awn" placeholder="Note (e.g. weighed at 6am)" style="width:200px"><button class="btn primary sm" data-act="savew">Save</button></div>
      ${hist.length ? `<div class="wh">${hist.slice(0, 30).map((w, i) => { const prev = hist[i + 1]; const d = prev ? Math.round((w.weight - prev.weight) * 10) / 10 : null;
        return `<div class="row between"><span>${fmtDate(w.date)}${w.weightNote ? ` <span class="small muted">${esc(w.weightNote)}</span>` : ''}${w.absent ? ' <span class="small muted">(separate)</span>' : ''}</span><span><b>${w.weight}</b> ${d ? `<span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</span></div>`; }).join('')}</div>` : '<div class="small muted">None yet.</div>'}` : ''),
    footer: `${a ? `<button class="btn danger" data-act="toggle">${a.active === false ? 'Make active' : 'Mark inactive'}</button>` : ''}<span class="grow"></span><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>`,
    onAction: async (act, el, w, close) => {
      try {
        if (act === 'save') { const d = readAthlete(w, a ? { ...a } : {}); if (!d) return; const { id, ...data } = d; await store.put('athletes', a?.id, data); close(); toast('Saved', 'success'); done(); }
        if (act === 'toggle') { const { id, ...data } = a; await store.put('athletes', a.id, { ...data, active: a.active === false }); close(); done(); }
        if (act === 'addw') w.querySelector('#addw').classList.toggle('hidden');
        if (act === 'savew') {
          const d = w.querySelector('#awd').value, n = Math.round(parseFloat(w.querySelector('#aww').value) * 10) / 10;
          if (!d || !(n > 0 && n < 500)) return toast('Pick a date and a weight', 'error');
          const docId = `${d}_${a.id}`; const cur = weights.find(x => x.id === docId) || {};
          const { id: _i, updatedAt, by, ...rest } = cur;
          await store.put('weighins', docId, { ...rest, athleteId: a.id, date: d, weight: n, ...(w.querySelector('#awn').value.trim() ? { weightNote: w.querySelector('#awn').value.trim() } : {}) });
          close(); toast('Weigh-in saved', 'success'); done();
        }
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
  const rowHTML = (a, i) => { const r = recOf(a.id), p = prevW(a.id), off = !!r?.absent, has = typeof r?.weight === 'number';
    return `<div class="wrow ${off ? 'off' : ''}" data-a="${a.id}">
      <div class="grow" style="min-width:0"><div class="an">${esc(a.first)} ${esc(a.last)} ${off ? '<span class="badge red">Not here</span>' : '<span class="badge green">Here</span>'}</div>
        <div class="as">${p ? `Last: ${p.weight} (${fmtDate(p.date)})` : 'No previous weigh-in'}${r?.goal?.what ? ` · 🎯 <b style="color:#93c5fd">${esc(r.goal.word)}</b>` : ''}${flags(r)}</div></div>
      ${off ? '' : `<button class="btn sm ${r?.goal?.what ? 'primary' : ''}" data-act="goal">${r?.feel ? FACES[r.feel - 1] : '🎯'}${r?.goal?.what ? '' : ' Check-in'}</button>`}
      <span class="wd" id="d-${a.id}">${has && p ? diffHTML(r.weight - p.weight) : ''}</span>
      ${has ? `<span class="wlock" title="Saved">${r.weight}<button class="btn ghost sm" data-act="wedit" aria-label="Change weight">✎</button></span>`
        : off ? `<button class="btn sm ghost" data-act="wedit" title="Weighed in separately">＋ Weight</button>` : `<input class="input wi" inputmode="decimal" enterkeyhint="next" data-i="${i}" value="" placeholder="—" aria-label="Weight">`}
      <button class="btn sm ${off ? 'go' : 'ghost'}" data-act="absent">${off ? 'Mark here' : 'Not here'}</button></div>`; };
  const draw = () => { const L = list(); $('#wl').innerHTML = L.length ? L.map(rowHTML).join('') : `<div class="empty">No active wrestlers${wSite !== 'all' ? ' in this building' : ''}. Add them on the <a href="#/roster">Roster</a>.</div>`; count(); };
  const count = () => { const L = list(); const abs = L.filter(a => recOf(a.id)?.absent).length; const w = L.filter(a => typeof recOf(a.id)?.weight === 'number').length; const g = L.filter(a => recOf(a.id)?.goal?.what).length;
    const low = L.filter(a => (recOf(a.id)?.feel || 5) <= 2 || (recOf(a.id)?.sleepHrs && recOf(a.id).sleepHrs <= 6)).length;
    $('#wc').innerHTML = `${L.length - abs} here · ${abs} not here · ${w} weighed · ${g} check-ins${low ? ` · <span style="color:#fca5a5">${low} to check on</span>` : ''}`; };
  const goalsCard = () => `<div class="card stack" style="margin-bottom:12px"><div class="row between"><b>🏆 Team goals</b><button class="btn sm" data-act="tgedit">Edit</button></div>
    <div class="small"><span class="tiny">Today</span><br>${esc(tg.day) || '<span class="muted">Not set yet</span>'}</div>
    ${tg.mid ? `<div class="small"><span class="tiny">Mid-season</span><br>${esc(tg.mid)}</div>` : ''}
    <div class="small"><span class="tiny">Season</span><br>${esc(tg.season) || '<span class="muted">Not set yet</span>'}</div></div>`;
  main.innerHTML = `<div class="page-head"><div><h1>Check-in</h1><div class="muted small" id="wc"></div></div><div class="row" style="gap:6px"><a class="btn ghost sm" href="#/checkins">◷ History</a><a class="btn go sm" href="#/today">Next: practice →</a></div></div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      <input type="date" class="input" id="wdt" value="${wDate}" style="width:auto">
      ${sites.length ? `<select class="input" id="wst" style="width:auto"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${wSite === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <button class="btn ghost sm" id="wcsv">⬇ Export this day</button></div>
    <div id="tgc">${goalsCard()}</div>
    <div class="small muted" style="margin-bottom:8px">Everyone starts as here. Tap <b>Not here</b> for anyone missing. Type a weight and hit Enter to jump to the next girl. Each girl taps <b>🎯 Check-in</b>: feeling, sleep, recovery fuel, and today's goal.</div>
    <div class="plist" id="wl"></div>`;
  $('#wdt').onchange = (e) => { wDate = e.target.value || today(); draw(); };
  $('#wst') && ($('#wst').onchange = async (e) => { wSite = e.target.value; tg = await teamGoals(wSite); $('#tgc').innerHTML = goalsCard(); draw(); });
  $('#wcsv').onclick = () => {
    const rows = [['last', 'first', 'date', 'here', 'weight', 'change', 'feeling_1to5', 'sleep_hrs', 'sleep', 'fruit_veg', 'milk', 'goal_word', 'goal', 'last_goal_met']].concat(list().map(a => { const r = recOf(a.id), p = prevW(a.id);
      return [a.last, a.first, wDate, r?.absent ? 'no' : 'yes', r?.weight ?? '', typeof r?.weight === 'number' && p ? Math.round((r.weight - p.weight) * 10) / 10 : '', r?.feel || '', r?.sleepHrs || '', r?.sleepQ || '', r?.fruitVeg ?? '', r?.milk ?? '', r?.goal?.word || '', goalText(r?.goal), r?.prevMet ?? '']; }));
    download(`check-in-${wDate}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  const saveWeight = async (inp) => {
    if (!inp.isConnected || inp.dataset.saving) return; inp.dataset.saving = '1';
    const id = inp.closest('[data-a]').dataset.a; const v = inp.value.trim();
    if (!v) { delete inp.dataset.saving; return; }
    if (!v) { if (typeof recOf(id)?.weight === 'number') { await saveRec(id, { weight: undefined }).catch(() => {}); inp.classList.remove('saved'); count(); } return; }
    const n = Math.round(parseFloat(v) * 10) / 10;
    if (!(n > 0 && n < 500)) { delete inp.dataset.saving; inp.classList.add('bad'); return toast('That weight looks off', 'error'); }
    inp.classList.remove('bad');
    try { await saveRec(id, { weight: n }); const row = inp.closest('[data-a]'); const a = athletes.find(x => x.id === id); row.outerHTML = rowHTML(a, list().indexOf(a)); count(); }
    catch (e) { delete inp.dataset.saving; toast('Not saved: ' + (e.code || e.message), 'error'); }
  };
  $('#wl').addEventListener('change', (e) => { if (e.target.matches('.wi') && !e.target.dataset.saving) saveWeight(e.target); });
  $('#wl').addEventListener('keydown', (e) => {
    if (!e.target.matches('.wi') || e.key !== 'Enter') return;
    e.preventDefault(); const from = +e.target.dataset.i;
    saveWeight(e.target).then(() => { const nx = [...document.querySelectorAll('.wi')].find(x => +x.dataset.i > from); if (nx) { nx.focus(); nx.select(); } });
  });
  main.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.dataset.act === 'tgedit') return editTeamGoals(tg, async () => { tg = await teamGoals(wSite); $('#tgc').innerHTML = goalsCard(); });
    const row = b.closest('[data-a]'); if (!row) return;
    const a = athletes.find(x => x.id === row.dataset.a);
    if (b.dataset.act === 'absent') {
      const off = !recOf(a.id)?.absent;
      if (off && typeof recOf(a.id)?.weight === 'number' && !(await confirmBox(`Mark ${a.first} not here?`, `She already weighed in today (${recOf(a.id).weight}). Her weight stays saved.`, 'Mark not here', false))) return;
      try { await saveRec(a.id, { absent: off || undefined }); row.outerHTML = rowHTML(a, list().indexOf(a)); count(); } catch (err) { toast(err.code || err.message, 'error'); }
    }
    if (b.dataset.act === 'wedit') {
      const cur = recOf(a.id)?.weight ?? '';
      const v = prompt(`Change ${a.first}'s weight for ${fmtDate(wDate)}:`, cur); if (v === null) return;
      const n = Math.round(parseFloat(v) * 10) / 10;
      if (!(n > 0 && n < 500)) return toast('That weight looks off', 'error');
      try { await saveRec(a.id, { weight: n }); row.outerHTML = rowHTML(a, list().indexOf(a)); toast('Weight updated', 'success'); } catch (err) { toast(err.code || err.message, 'error'); }
    }
    if (b.dataset.act === 'goal') goalSheet(a, recOf(a.id), prevGoal(a.id), tg, async (goal, prevMet, pg, well) => {
      await saveRec(a.id, { goal, ...well, ...(prevMet !== null ? { prevMet } : {}) });
      if (pg && prevMet !== null) { const { id, updatedAt, by, ...rest } = pg; await store.put('weighins', pg.id, { ...rest, met: prevMet }).catch(() => {}); pg.met = prevMet; }
      const r = $(`[data-a="${a.id}"]`); if (r) r.outerHTML = rowHTML(a, list().indexOf(a)); count();
    });
  };
  draw();
}
const diffHTML = (d) => { d = Math.round(d * 10) / 10; return d === 0 ? '<span class="small muted">±0</span>' : `<span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`; };

export const FACES = ['😫', '🙁', '😐', '🙂', '😄'];
const FACE_LABEL = ['Awful', 'Not great', 'OK', 'Good', 'Great'];
const flags = (r) => !r ? '' : [(r.feel && r.feel <= 2) ? `<span class="flag">${FACES[r.feel - 1]} feeling ${FACE_LABEL[r.feel - 1].toLowerCase()}</span>` : '', (r.sleepHrs && r.sleepHrs <= 6) || r.sleepQ === 'Rough' ? `<span class="flag">😴 ${r.sleepHrs ? r.sleepHrs + 'h' : ''} ${r.sleepQ === 'Rough' ? 'rough sleep' : 'sleep'}</span>` : ''].join('');

function goalSheet(a, rec, pg, tg, onSave) {
  const g = { word: '', what: '', measure: '', when: '', ...(rec?.goal || {}) };
  const w = { feel: rec?.feel || 0, sleepHrs: rec?.sleepHrs || 0, sleepQ: rec?.sleepQ || '', fruitVeg: rec?.fruitVeg ?? null, milk: rec?.milk ?? null };
  let met = pg && pg.met !== undefined ? pg.met : null;
  const checks = () => smartCheck(g).map(c => `<div class="sm ${c.ok ? 'ok' : ''}"><b>${c.k}</b> ${esc(c.label)}</div>`).join('');
  const yn = (k, label) => `<div class="row wrap" style="gap:6px;align-items:center"><span class="small" style="min-width:190px">${label}</span><button class="chip ${w[k] === true ? 'on' : ''}" data-act="yn" data-k="${k}" data-v="1">Yes</button><button class="chip ${w[k] === false ? 'on' : ''}" data-act="yn" data-k="${k}" data-v="0">No</button></div>`;
  const m = modal({ title: `${a.first}'s check-in`, body: `<div class="stack">
    <div><div class="tiny" style="margin-bottom:6px">How are you feeling today?</div><div class="faces">${FACES.map((f, i) => `<button class="face ${w.feel === i + 1 ? 'on' : ''}" data-act="feel" data-v="${i + 1}"><span>${f}</span><small>${FACE_LABEL[i]}</small></button>`).join('')}</div></div>
    <div><div class="tiny" style="margin-bottom:6px">How did you sleep last night?</div><div class="row wrap" style="gap:6px">${[5, 6, 7, 8, 9, 10].map(h => `<button class="chip ${w.sleepHrs === h ? 'on' : ''}" data-act="sleep" data-v="${h}">${h === 5 ? '5 or less' : h === 10 ? '10+' : h} hrs</button>`).join('')}</div>
      <div class="row wrap" style="gap:6px;margin-top:6px">${['Great', 'OK', 'Rough'].map(q => `<button class="chip ${w.sleepQ === q ? 'on' : ''}" data-act="sleepq" data-v="${q}">${q}</button>`).join('')}</div></div>
    <div><div class="tiny" style="margin-bottom:6px">Recovery fuel since last practice</div><div class="stack" style="gap:6px">${yn('fruitVeg', '🍎 Fruits or veggies?')}${yn('milk', '🥛 Milk or chocolate milk?')}</div></div>
    ${a.goalLong || a.goalMid ? `<div class="card" style="background:#0d1428"><div class="tiny">Your bigger goals</div>${a.goalMid ? `<div class="small" style="margin-top:4px"><b>Mid-season:</b> ${esc(a.goalMid)}</div>` : ''}${a.goalLong ? `<div class="small" style="margin-top:4px"><b>Season:</b> ${esc(a.goalLong)}</div>` : ''}</div>` : ''}
    ${tg.day ? `<div class="small"><span class="tiny">Team goal today</span><br>${esc(tg.day)}</div>` : ''}
    ${pg ? `<div class="card" style="background:#0d1428"><div class="tiny">Last goal (${fmtDate(pg.date)})</div><div class="small" style="margin:4px 0 8px">${esc(goalText(pg.goal))}</div>
      <div class="row" style="gap:6px"><span class="small">Did you hit it?</span><button class="chip ${met === true ? 'on' : ''}" data-act="met" data-v="1">✓ Yes</button><button class="chip ${met === false ? 'on' : ''}" data-act="met" data-v="0">✗ Not yet</button></div></div>` : ''}
    <div class="tiny" style="margin-top:6px;color:var(--gold)">Today's goal</div>
    <div><div class="tiny" style="margin-bottom:6px">1. Pick your focus word</div><div class="row wrap" style="gap:6px">${WORDS.map(w => `<button class="chip word ${g.word === w ? 'on' : ''}" data-act="word" data-w="${w}">${w}</button>`).join('')}</div>
      <div class="small muted" id="whint" style="margin-top:4px">${g.word ? esc(WORD_HINT[g.word]) : ''}</div></div>
    <label class="field"><span class="tiny">2. What will you do? (be specific)</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Finish my single leg by running the pipe"></label>
    <label class="field"><span class="tiny">3. How many, or how will you know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. at least 5 times, or every rep"></label>
    <label class="field"><span class="tiny">4. When in practice?</span><input class="input" data-g="when" value="${esc(g.when)}" placeholder="e.g. during live goes today"></label>
    <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Your goal</div><div id="gprev" style="font-weight:700">${esc(goalText(g)) || '<span class="muted">Fill in the steps above</span>'}</div>
      <div class="smart" id="gchk" style="margin-top:10px">${checks()}</div></div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="save">Save check-in</button>`,
    onAction: async (act, el, wrap, close) => {
      const on = (sel, el2) => wrap.querySelectorAll(sel).forEach(c => c.classList.toggle('on', c === el2));
      if (act === 'feel') { w.feel = +el.dataset.v; on('.face', el); }
      if (act === 'sleep') { w.sleepHrs = +el.dataset.v; on('[data-act=sleep]', el); }
      if (act === 'sleepq') { w.sleepQ = el.dataset.v; on('[data-act=sleepq]', el); }
      if (act === 'yn') { w[el.dataset.k] = el.dataset.v === '1'; on(`[data-act=yn][data-k=${el.dataset.k}]`, el); }
      if (act === 'word') { g.word = el.dataset.w; on('.chip.word', el); wrap.querySelector('#whint').textContent = WORD_HINT[g.word]; refresh(); }
      if (act === 'met') { met = el.dataset.v === '1'; on('[data-act=met]', el); }
      if (act === 'save') {
        if (!w.feel) return toast('Tap a face for how you feel today', 'error');
        if (!w.sleepHrs) return toast('How many hours did you sleep?', 'error');
        if (w.fruitVeg === null || w.milk === null) return toast('Answer the two recovery-fuel questions', 'error');
        const bad = smartCheck(g).filter(c => !c.ok);
        if (bad.length) return toast('Not a SMART goal yet: ' + bad.map(c => c.label.split(':')[0]).join(', '), 'error');
        try { await onSave({ word: g.word, what: g.what.trim(), measure: g.measure.trim(), when: g.when.trim() }, met, pg, w); close(); toast('Check-in saved', 'success'); } catch (e) { toast(e.code || e.message, 'error'); }
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
    $('#lpool').innerHTML = pool().filter(a => !pl.has(a.id) && (!q || full(a).toLowerCase().includes(q))).map(a => `<button class="chip" data-add="${a.id}">${esc(full(a))}</button>`).join('') || `<span class="small muted">${athletes.length ? 'Everyone on the roster is placed.' : 'No one on the roster yet. Add girls below as they give you their names.'}</span>`;
    $('#cap').textContent = caption();
    const cn = $('#lcurname'); if (cn) cn.textContent = names[L.cur];
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
    <div class="card" style="margin-top:12px"><div class="row wrap between" style="gap:8px"><b>Add to <span id="lcurname"></span></b>
</div>
      <form id="lx" class="stack" style="margin-top:10px;gap:8px">
        <div class="tiny">Add someone new to the selected row</div>
        <div class="grid" style="grid-template-columns:1fr 1fr 70px;gap:6px">
          <input class="input" id="lxf" placeholder="First name" autocapitalize="words" autocomplete="off">
          <input class="input" id="lxl" placeholder="Last name" autocapitalize="words" autocomplete="off">
          <select class="input" id="lxg" aria-label="Grade"><option value="">Gr</option>${GRADES.slice(6).map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="row" style="gap:6px"><button class="btn primary grow" id="lxw" type="submit">＋ Add wrestler (saves to roster)</button><button class="btn" id="lxc" type="button">＋ Coach / other</button></div>
        <div class="small muted">Ask her to spell it. Enter adds her and puts you back on First name for the next girl.</div>
      </form>
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
  const cap = (x) => x.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const readNew = () => ({ first: cap($('#lxf').value), last: cap($('#lxl').value), grade: $('#lxg').value });
  const clearNew = () => { $('#lxf').value = ''; $('#lxl').value = ''; $('#lxg').value = ''; $('#lxf').focus(); };
  $('#lx').onsubmit = async (e) => {
    e.preventDefault(); const n = readNew();
    if (!n.first || !n.last) return toast('First and last name, please', 'error');
    const dup = athletes.find(a => a.first.toLowerCase() === n.first.toLowerCase() && a.last.toLowerCase() === n.last.toLowerCase());
    let id = dup?.id;
    if (!dup) {
      const site = L.site !== 'all' ? L.site : (user.prefs?.site || '');
      try { id = await store.put('athletes', null, { ...n, nick: '', level: '', site, active: true }); athletes.push({ id, ...n, site, active: true }); athletes.sort(sortAth); }
      catch (err) { return toast('Not saved to roster: ' + (err.code || err.message), 'error'); }
    }
    if (!placed().has(id)) L.rows[L.cur].push({ id, name: `${n.first} ${n.last}` });
    toast(dup ? `${n.first} was already on the roster` : `Added ${n.first} ${n.last}`, 'success'); clearNew(); draw();
  };
  $('#lxc').onclick = () => { const n = readNew(); const name = `${n.first} ${n.last}`.trim(); if (!name) return toast('Type a name first', 'error'); L.rows[L.cur].push({ id: null, name }); clearNew(); draw(); };
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


// ---- Check-in history --------------------------------------------------------
export async function viewCheckins(main, user, date) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, recs, runs] = await Promise.all([load(), loadWeights(), store.listRuns().catch(() => [])]);
  const byId = Object.fromEntries(athletes.map(a => [a.id, a]));
  const dayRuns = (d) => runs.filter(r => !r.test && r.date === d || (!r.date && new Date(r.startedAt).toISOString().slice(0, 10) === d));
  if (!date) {
    const days = [...new Set(recs.map(r => r.date).concat(runs.filter(r => !r.test && r.date).map(r => r.date)))].sort().reverse();
    main.innerHTML = `<div class="page-head"><div><h1>Check-in history</h1><div class="muted small">Every practice day: attendance, weights, goals</div></div><a class="btn go sm" href="#/weighin">✓ Today's check-in</a></div>
      ${days.length ? `<div class="plist">${days.map(d => { const R = recs.filter(r => r.date === d); const here = R.filter(r => !r.absent).length, out = R.filter(r => r.absent).length;
        const w = R.filter(r => typeof r.weight === 'number' && !r.absent).length, g = R.filter(r => r.goal?.what).length, runsD = dayRuns(d);
        return `<a class="prow" href="#/checkins/${d}" style="text-decoration:none;color:inherit"><div class="grow"><div class="pr-t">${fmtDate(d)}</div>
          <div class="pr-s">${here} here · ${out} not here · ${w} weighed · ${g} goals${runsD.length ? ' · ' + runsD.map(r => esc(r.practiceTitle)).join(', ') : ''}</div></div><span class="muted">›</span></a>`; }).join('')}</div>`
        : '<div class="empty">No check-ins yet. They show up here after the first weigh-in.</div>'}`;
    return;
  }
  const R = recs.filter(r => r.date === date);
  const prev = (id) => recs.filter(r => r.athleteId === id && r.date < date && typeof r.weight === 'number').sort((x, y) => y.date.localeCompare(x.date))[0];
  const rows = athletes.filter(a => R.some(r => r.athleteId === a.id) || a.active !== false).map(a => ({ a, r: R.find(x => x.athleteId === a.id) }));
  const runsD = dayRuns(date);
  main.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><a class="btn ghost sm" href="#/checkins">← All days</a>
      <button class="btn sm" id="ccsv">⬇ Export</button></div>
    <div class="page-head"><div><h1>${fmtDate(date)}</h1><div class="muted small">${R.filter(r => !r.absent).length} here · ${R.filter(r => r.absent).length} not here</div></div></div>
    ${runsD.length ? `<div class="stack" style="margin-bottom:12px">${runsD.map(r => `<a class="card" href="#/history/${r.id}" style="text-decoration:none;color:inherit;display:block"><div class="tiny">Practice${r.siteName ? ' · ' + esc(r.siteName) : ''}</div>
      <b>${esc(r.practiceTitle)}</b>${r.goal?.what ? `<div class="small" style="margin-top:4px">🎯 ${esc(goalText(r.goal))}</div>` : ''}<div class="small muted">${esc(r.status)}${r.actualSec ? ' · ' + Math.round(r.actualSec / 60) + ' min' : ''} ›</div></a>`).join('')}</div>` : '<div class="small muted" style="margin-bottom:12px">No practice was run this day.</div>'}
    <div class="card" style="padding:0;overflow-x:auto"><table class="list"><tr><th>Wrestler</th><th>Here</th><th>Weight</th><th>Feeling</th><th>Sleep</th><th>Fuel</th><th>Goal</th><th>Hit?</th></tr>
      ${rows.map(({ a, r }) => { const p = prev(a.id); const d = typeof r?.weight === 'number' && p ? Math.round((r.weight - p.weight) * 10) / 10 : null;
        return `<tr><td><b>${esc(a.first)} ${esc(a.last)}</b></td><td>${r?.absent ? '<span class="badge red">No</span>' : r ? '<span class="badge green">Yes</span>' : '<span class="muted small">no check-in</span>'}</td>
          <td>${typeof r?.weight === 'number' ? `${r.weight} ${d !== null ? `<span class="small ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}">${d > 0 ? '+' : ''}${d}</span>` : ''}` : ''}</td>
          <td style="font-size:20px">${r?.feel ? FACES[r.feel - 1] : ''}</td><td class="small">${r?.sleepHrs ? r.sleepHrs + 'h ' + (r.sleepQ || '') : ''}</td>
          <td>${r?.fruitVeg ? '🍎' : ''}${r?.milk ? '🥛' : ''}</td>
          <td class="small">${esc(goalText(r?.goal))}</td><td>${r?.met === true ? '✅' : r?.met === false ? '⬜' : ''}</td></tr>`; }).join('')}</table></div>`;
  $('#ccsv').onclick = () => {
    const out = [['last', 'first', 'date', 'here', 'weight', 'goal', 'goal_met']].concat(rows.map(({ a, r }) => [a.last, a.first, date, r?.absent ? 'no' : r ? 'yes' : '', r?.weight ?? '', goalText(r?.goal), r?.met ?? '']));
    download(`check-in-${date}.csv`, out.map(x => x.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
}

// Summary of today's check-in (for the Today page)
export async function checkinSummary(site) {
  const [{ athletes, sites }, recs] = await Promise.all([load(), loadWeights()]);
  const L = athletes.filter(a => a.active !== false && (!site || site === 'all' || !sites.length || a.site === site));
  const R = recs.filter(r => r.date === today());
  const of = (id) => R.find(r => r.athleteId === id);
  return { total: L.length, absent: L.filter(a => of(a.id)?.absent).length, weighed: L.filter(a => typeof of(a.id)?.weight === 'number').length,
    hereWeighed: L.filter(a => !of(a.id)?.absent && typeof of(a.id)?.weight === 'number').length,
    goals: L.filter(a => of(a.id)?.goal?.what).length };
}


// ---- Meets: goal before, reflection after ------------------------------------------
export async function viewMeets(main, user, id) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, meets] = await Promise.all([load(), store.list('meets').catch(() => [])]);
  meets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!id) {
    main.innerHTML = `<div class="page-head"><div><h1>Meets</h1><div class="muted small">Each girl sets a goal before and reflects after</div></div><a class="btn ghost sm" href="#/roster">← Roster</a></div>
      <form id="mf" class="card row wrap" style="gap:8px;margin-bottom:12px"><input class="input" id="mn" placeholder="Meet name (e.g. Merrill Invite)" style="max-width:260px" required><input type="date" class="input" id="md" value="${today()}" style="width:auto">
        ${sites.length ? `<select class="input" id="ms" style="width:auto">${sites.map(x => `<option value="${x.id}" ${user.prefs?.site === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}<button class="btn primary">＋ Add meet</button></form>
      <div class="plist">${meets.map(m => `<a class="prow" href="#/meets/${m.id}" style="text-decoration:none;color:inherit"><div class="grow"><div class="pr-t">${esc(m.name)}</div><div class="pr-s">${m.date ? fmtDate(m.date) : ''}${siteName(sites, m.site) ? ' · ' + esc(siteName(sites, m.site)) : ''}</div></div><span class="muted">›</span></a>`).join('') || '<div class="empty">No meets yet.</div>'}</div>`;
    $('#mf').onsubmit = async (e) => { e.preventDefault(); try { const nid = await store.put('meets', null, { name: $('#mn').value.trim(), date: $('#md').value, site: $('#ms')?.value || '' }); location.hash = `#/meets/${nid}`; } catch (err) { toast(err.code || err.message, 'error'); } };
    return;
  }
  const meet = meets.find(m => m.id === id); if (!meet) { main.innerHTML = '<div class="empty">Meet not found.</div>'; return; }
  const entries = (await store.list('meetentries').catch(() => [])).filter(e => e.meetId === id);
  const roster = athletes.filter(a => a.active !== false && (!sites.length || !meet.site || a.site === meet.site));
  const entOf = (aid) => entries.find(e => e.athleteId === aid);
  const save = async (aid, patch) => { const cur = entOf(aid) || { meetId: id, athleteId: aid }; const { id: _i, updatedAt, by, ...rest } = cur; const next = { ...rest, ...patch, meetId: id, athleteId: aid };
    await store.put('meetentries', `${id}_${aid}`, next); const k = entries.findIndex(e => e.athleteId === aid); const rec = { ...next, id: `${id}_${aid}` }; if (k >= 0) entries[k] = rec; else entries.push(rec); };
  const summary = () => {
    const lines = roster.map(a => ({ a, e: entOf(a.id) })).filter(x => x.e?.wins !== undefined || x.e?.losses !== undefined)
      .map(({ a, e }) => `${paperName(a)}: ${e.wins || 0}-${e.losses || 0}${e.place ? `, ${e.place}` : ''}${e.pins ? `, ${e.pins} pin${e.pins > 1 ? 's' : ''}` : ''}`);
    return `${meet.name}${meet.date ? ` (${fmtDate(meet.date)})` : ''}\nMerrill girls wrestling results:\n${lines.join('\n') || '(no results entered yet)'}\n\nCoach's comments: `;
  };
  const draw = () => {
    $('#ml').innerHTML = roster.map(a => { const e = entOf(a.id);
      return `<div class="wrow" data-a="${a.id}"><div class="grow" style="min-width:0"><div class="an">${esc(a.first)} ${esc(a.last)}</div>
        <div class="as">${e?.goal?.what ? '🎯 ' + esc(goalText(e.goal)) : 'No meet goal yet'}${e?.wins !== undefined ? ` · <b>${e.wins}-${e.losses}</b>` : ''}${e?.feel ? ' · ' + FACES[e.feel - 1] : ''}</div></div>
        <button class="btn sm ${e?.goal?.what ? 'primary' : ''}" data-act="mgoal">🎯 Goal</button><button class="btn sm ${e?.wentWell ? 'primary' : ''}" data-act="mref">📝 Reflect</button></div>`; }).join('') || '<div class="empty">No wrestlers on the roster for this building.</div>';
  };
  main.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><a class="btn ghost sm" href="#/meets">← Meets</a><button class="btn gold sm" id="mcopy">📰 Copy results for the paper</button></div>
    <div class="page-head"><div><h1>${esc(meet.name)}</h1><div class="muted small">${meet.date ? fmtDate(meet.date) : ''} · ${entries.filter(e => e.goal?.what).length} goals · ${entries.filter(e => e.wentWell).length} reflections</div></div></div>
    <div class="small muted" style="margin-bottom:8px">Before: each girl sets one SMART goal for this meet with a focus word. After: her record, what went well, what to work on.</div>
    <div class="plist" id="ml"></div>`;
  $('#mcopy').onclick = async () => { try { await navigator.clipboard.writeText(summary()); toast('Copied. Add a few lines from you and send it to Tina.', 'success'); } catch (e) { prompt('Copy:', summary()); } };
  main.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return; const row = b.closest('[data-a]'); if (!row) return;
    const a = athletes.find(x => x.id === row.dataset.a); const e = entOf(a.id) || {};
    if (b.dataset.act === 'mgoal') {
      const g = { word: '', what: '', measure: '', when: 'at this meet', ...(e.goal || {}) };
      const chk = () => smartCheck(g).map(c => `<div class="sm ${c.ok ? 'ok' : ''}"><b>${c.k}</b> ${esc(c.label.replace("today's practice", 'this meet').replace('Achievable today (not a season goal)', 'Achievable at this meet'))}</div>`).join('');
      const m = modal({ title: `${a.first}'s goal for ${meet.name}`, body: `<div class="stack">
        <div class="row wrap" style="gap:6px">${WORDS.map(x => `<button class="chip word ${g.word === x ? 'on' : ''}" data-act="word" data-w="${x}">${x}</button>`).join('')}</div>
        <label class="field"><span class="tiny">What will you do?</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Shoot first in every match"></label>
        <label class="field"><span class="tiny">How many, or how will you know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. in the first 30 seconds"></label>
        <label class="field"><span class="tiny">When?</span><input class="input" data-g="when" value="${esc(g.when)}"></label>
        <div class="card" style="background:#0d1428"><b id="gp">${esc(goalText(g))}</b><div class="smart" id="gc" style="margin-top:8px">${chk()}</div></div></div>`,
        footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>`,
        onAction: async (act, el, w, close) => {
          if (act === 'word') { g.word = el.dataset.w; w.querySelectorAll('.chip.word').forEach(c => c.classList.toggle('on', c === el)); w.querySelector('#gp').textContent = goalText(g); w.querySelector('#gc').innerHTML = chk(); }
          if (act === 'save') { const bad = smartCheck(g).filter(c => !c.ok && c.k !== 'A'); if (bad.length) return toast('Not SMART yet: ' + bad.map(c => c.label.split(':')[0]).join(', '), 'error');
            try { await save(a.id, { goal: { word: g.word, what: g.what.trim(), measure: g.measure.trim(), when: g.when.trim() } }); close(); draw(); } catch (err) { toast(err.code || err.message, 'error'); } }
        } });
      m.el.querySelector('.mb').addEventListener('input', (x) => { if (x.target.dataset.g) { g[x.target.dataset.g] = x.target.value; m.el.querySelector('#gp').textContent = goalText(g); m.el.querySelector('#gc').innerHTML = chk(); } });
    }
    if (b.dataset.act === 'mref') {
      const r = { feel: e.feel || 0, goalMet: e.goalMet ?? null };
      modal({ title: `${a.first}'s reflection`, body: `<div class="stack">
        ${e.goal?.what ? `<div class="card" style="background:#0d1428"><div class="tiny">Her goal</div><b>${esc(goalText(e.goal))}</b>
          <div class="row" style="gap:6px;margin-top:8px"><span class="small">Did you hit it?</span><button class="chip ${r.goalMet === true ? 'on' : ''}" data-act="gm" data-v="1">✓ Yes</button><button class="chip ${r.goalMet === false ? 'on' : ''}" data-act="gm" data-v="0">✗ Not yet</button></div></div>` : ''}
        <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:6px">
          <label class="field"><span class="tiny">Wins</span><input class="input" id="rw" inputmode="numeric" value="${e.wins ?? ''}"></label>
          <label class="field"><span class="tiny">Losses</span><input class="input" id="rl" inputmode="numeric" value="${e.losses ?? ''}"></label>
          <label class="field"><span class="tiny">Pins</span><input class="input" id="rp" inputmode="numeric" value="${e.pins ?? ''}"></label>
          <label class="field"><span class="tiny">Place</span><input class="input" id="rpl" value="${esc(e.place || '')}" placeholder="2nd"></label></div>
        <div><div class="tiny" style="margin-bottom:6px">How do you feel about today?</div><div class="faces">${FACES.map((f, i) => `<button class="face ${r.feel === i + 1 ? 'on' : ''}" data-act="feel" data-v="${i + 1}"><span>${f}</span><small>${FACE_LABEL[i]}</small></button>`).join('')}</div></div>
        <label class="field"><span class="tiny">What went well?</span><textarea class="input" id="rww" rows="2">${esc(e.wentWell || '')}</textarea></label>
        <label class="field"><span class="tiny">What will you work on in practice?</span><textarea class="input" id="rwo" rows="2">${esc(e.workOn || '')}</textarea></label></div>`,
        footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>`,
        onAction: async (act, el, w, close) => {
          if (act === 'feel') { r.feel = +el.dataset.v; w.querySelectorAll('.face').forEach(c => c.classList.toggle('on', c === el)); }
          if (act === 'gm') { r.goalMet = el.dataset.v === '1'; w.querySelectorAll('[data-act=gm]').forEach(c => c.classList.toggle('on', c === el)); }
          if (act === 'save') {
            const n = (sel) => { const v = parseInt(w.querySelector(sel).value); return Number.isFinite(v) ? v : undefined; };
            const patch = { wins: n('#rw'), losses: n('#rl'), pins: n('#rp'), place: w.querySelector('#rpl').value.trim(), feel: r.feel || undefined, goalMet: r.goalMet ?? undefined,
              wentWell: w.querySelector('#rww').value.trim(), workOn: w.querySelector('#rwo').value.trim() };
            Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
            try { await save(a.id, patch); close(); draw(); toast('Reflection saved', 'success'); } catch (err) { toast(err.code || err.message, 'error'); }
          }
        } });
    }
  };
  draw();
}
