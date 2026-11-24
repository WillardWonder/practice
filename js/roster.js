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
      : `<div class="empty">${athletes.length ? 'No one matches.' : coach ? 'No wrestlers yet. Tap <b>＋ Add</b> to paste the whole team at once.' : 'No roster yet.'}</div>`;
    $('#rcount').textContent = `${list.length} wrestler${list.length === 1 ? '' : 's'}`;
    $$('[data-a]').forEach(b => b.onclick = () => coach && editAthlete(athletes.find(x => x.id === b.dataset.a), sites, weights, () => viewRoster(main, user)));
  };
  main.innerHTML = `<div class="page-head"><div><h1>Team</h1><div class="muted small" id="rcount"></div></div>
      ${coach ? `<button class="btn ghost sm" id="csv">⬇ Export</button>` : ''}</div>
    ${coach ? `<a class="todaybar" href="#/weighin" style="margin:0 0 12px"><span class="tb-ic">✓</span><span class="grow"><b>Check-in &amp; weigh-in</b><span class="small">Tap her name, enter her weight</span></span><span class="tb-go">›</span></a>
    <div class="tools">
      <a class="tool" href="#/checkins"><span>◷</span>Check-in history</a>
      <a class="tool" href="#/meets"><span>🏆</span>Meets</a>
      <a class="tool" href="#/lineup"><span>📷</span>Team photo</a>
      <a class="tool" href="#/paper"><span>📰</span>Newspaper</a>
      <a class="tool" href="#/sizes"><span>👕</span>Sizes</a>
      <button class="tool" id="tgoals"><span>🎯</span>Team goals</button>
    </div>
    <div class="section-title" style="margin-top:22px">Wrestlers</div>` : ''}
    <div class="row" style="gap:8px;margin-bottom:10px">
      <input class="input grow" id="rq" placeholder="🔍 Search names…" value="${esc(rFilter.q)}">
      ${coach ? '<button class="btn primary" id="addA">＋ Add</button>' : ''}
    </div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      ${sites.length ? `<select class="input input-sm" id="rs"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${rFilter.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <label class="small muted row" style="gap:6px"><input type="checkbox" id="ri" ${rFilter.showInactive ? 'checked' : ''}> Show inactive</label>
    </div><div class="plist" id="rl"></div>`;
  $('#rq').oninput = (e) => { rFilter.q = e.target.value; draw(); };
  $('#rs') && ($('#rs').onchange = (e) => { rFilter.site = e.target.value; draw(); });
  $('#ri').onchange = (e) => { rFilter.showInactive = e.target.checked; draw(); };
  if (coach) {
    $('#addA').onclick = () => modal({ title: 'Add wrestlers', body: `<div class="stack">
        <button class="dr" data-act="one"><span class="grow"><span class="dr-t" style="text-transform:none">One wrestler</span><span class="dr-s">Name, grade, weight class, sizes</span></span><span class="dr-plus">›</span></button>
        <button class="dr" data-act="many"><span class="grow"><span class="dr-t" style="text-transform:none">Paste a whole list</span><span class="dr-s">One name per line, from a sheet, text or email</span></span><span class="dr-plus">›</span></button>
        <div class="small muted">Tip: girls can also add themselves on the check-in tablet with “I'm new to the team”.</div></div>`,
      onAction: (act, el, w, close) => { close(); if (act === 'one') editAthlete(null, sites, weights, () => viewRoster(main, user)); if (act === 'many') pasteList(sites, user, () => viewRoster(main, user)); } });
    $('#tgoals').onclick = async () => { const tg = await teamGoals(rFilter.site || user.prefs?.site); editTeamGoals(tg, () => toast('Team goals saved', 'success')); };
    $('#csv').onclick = () => exportCsv(athletes, weights, sites);
    if ($('#qa')) $('#qa').onsubmit = async (e) => {
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
    if ($('#ql')) $('#ql').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#qa').requestSubmit(); } };
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
  const absent = 0;
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

// Here = her weight was recorded (or a coach marked her here at the end of practice). Everyone else is absent.
export const isHere = (r) => !!r && !r.absent && (typeof r.weight === 'number' || r.here === true);
let wDate = null, wSite = null;
// Check-in: a girl is checked in when her weight is recorded. Tap her name, type the weight, save.
export async function viewWeighIn(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const [{ athletes, sites }, recs] = await Promise.all([load(), loadWeights()]);
  wDate ||= today();
  if (wSite === null) wSite = sites.some(s => s.id === user.prefs?.site) ? user.prefs.site : 'all';
  let tg = await teamGoals(wSite), q = '';
  const list = () => athletes.filter(a => a.active !== false && (wSite === 'all' || !sites.length || a.site === wSite));
  const recOf = (id, date = wDate) => recs.find(w => w.athleteId === id && w.date === date);
  const isIn = (id) => isHere(recOf(id));
  const prevW = (id) => recs.filter(w => w.athleteId === id && w.date < wDate && typeof w.weight === 'number').sort((x, y) => y.date.localeCompare(x.date))[0];
  const prevGoal = (id) => recs.filter(w => w.athleteId === id && w.date < wDate && w.goal?.what).sort((x, y) => y.date.localeCompare(x.date))[0];
  const saveRec = async (id, patch) => {
    const cur = recOf(id) || { athleteId: id, date: wDate };
    const next = { ...cur, ...patch }; delete next.id; delete next.updatedAt; delete next.by; delete next.checkedIn;
    Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);
    const docId = `${wDate}_${id}`;
    await store.put('weighins', docId, next);
    const k = recs.findIndex(w => w.athleteId === id && w.date === wDate); const rec = { ...next, id: docId };
    if (k >= 0) recs[k] = rec; else recs.push(rec);
    return rec;
  };
  const match = (a) => !q || `${a.first} ${a.last} ${a.nick || ''}`.toLowerCase().includes(q.toLowerCase());
  async function voiceCheck() {
    const V = await import('./voicecheck.js');
    const L = list();
    let rec = null, rows = [];
    const m = modal({ title: '🎤 Say names and weights', body: `<div class="stack">
        <div class="small muted">Say it like <b>“Kenzie one twenty one, Ava ninety eight point five, Zoe Carter 132.”</b> Or type it. Check the list, then save.</div>
        ${V.speechSupported() ? '<button class="btn lg" data-act="mic" id="vmic" style="width:100%">🎤 Tap and talk</button>' : '<div class="small muted">Voice isn\'t available in this browser. Typing works.</div>'}
        <textarea class="input" id="vtext" rows="3" placeholder="Kenzie 121, Ava 98.5, Zoe Carter 132"></textarea>
        <div class="plist" id="vrows"></div></div>`,
      footer: `<button class="btn" data-act="close">Cancel</button><button class="btn go lg" data-act="vsave" id="vsave" disabled>✓ Check them in</button>`,
      onClose: () => rec?.stop(),
      onAction: async (act, el, w, close) => {
        if (act === 'mic') {
          if (rec) { rec.stop(); return; }
          const before = w.querySelector('#vtext').value.trim();
          rec = V.listen({ onText: (t) => { w.querySelector('#vtext').value = (before ? before + ', ' : '') + t; parse(); },
            onEnd: (err) => { rec = null; const b = w.querySelector('#vmic'); if (b) { b.textContent = '🎤 Tap and talk'; b.classList.remove('rec'); } if (err && err !== 'no-speech' && err !== 'aborted') toast(err === 'not-allowed' ? 'Allow the microphone for this site, then try again.' : 'Mic: ' + err, 'error'); } });
          el.textContent = '⏹ Listening… tap to stop'; el.classList.add('rec'); return;
        }
        if (act === 'vsave') {
          rec?.stop();
          const ok = rows.filter(r => r.athlete && r.weight);
          try { for (const r of ok) await saveRec(r.athlete.id, { weight: r.weight }); }
          catch (err) { return toast('Not saved: ' + (err.code || err.message), 'error'); }
          close(); draw(); toast(`✓ Checked in ${ok.length} girl${ok.length === 1 ? '' : 's'}`, 'success');
        }
      } });
    const w = m.el;
    const paint = () => {
      w.querySelector('#vrows').innerHTML = rows.map((r, i) => `<div class="prow" style="padding:10px 12px">
          <div class="grow" style="min-width:0">${r.athlete ? `<div class="pr-t" style="text-transform:none">${esc(r.athlete.first)} ${esc(r.athlete.last)}</div>`
            : `<select class="input input-sm" data-pick="${i}" style="width:100%"><option value="">${r.matches.length > 1 ? 'Which one?' : `“${esc(r.said || '?')}”: pick her`}</option>${(r.matches.length > 1 ? r.matches : L).map(a => `<option value="${a.id}">${esc(a.first)} ${esc(a.last)}</option>`).join('')}</select>`}
            ${r.athlete && isIn(r.athlete.id) ? '<div class="pr-s" style="color:#fde68a">Already checked in. This replaces her weight.</div>' : ''}</div>
          <input class="input input-sm" data-wt="${i}" inputmode="decimal" value="${r.weight ?? ''}" placeholder="lbs" style="width:84px;text-align:center;font-weight:800${r.weight ? '' : ';border-color:#ef4444'}">
          <button class="btn sm ghost" data-rm="${i}" aria-label="Remove">✕</button></div>`).join('');
      const ready = rows.filter(r => r.athlete && r.weight).length;
      const sv = w.querySelector('#vsave'); sv.disabled = !ready; sv.textContent = ready ? `✓ Check in ${ready}` : '✓ Check them in';
    };
    const parse = () => { rows = V.parseWeighins(w.querySelector('#vtext').value, L); paint(); };
    w.querySelector('#vtext').oninput = parse;
    w.querySelector('#vrows').onchange = (e) => {
      const p = e.target.dataset.pick, t = e.target.dataset.wt;
      if (p != null) { rows[p].athlete = L.find(a => a.id === e.target.value) || null; paint(); }
      if (t != null) { const n = parseFloat(e.target.value); rows[t].weight = n >= 40 && n <= 400 ? Math.round(n * 10) / 10 : null; paint(); }
    };
    w.querySelector('#vrows').onclick = (e) => { const k = e.target.closest('[data-rm]')?.dataset.rm; if (k != null) { rows.splice(+k, 1); paint(); } };
  }
  const draw = () => {
    const L = list(), waiting = L.filter(a => !isIn(a.id)), inn = L.filter(a => isIn(a.id));
    const pct = L.length ? Math.round(inn.length / L.length * 100) : 0;
    $('#wc').innerHTML = `<div class="ciprog"><i style="width:${pct}%"></i></div><b style="color:#86efac">${inn.length} here</b> <span class="muted">of ${L.length}</span>`;
    $('#wwait').innerHTML = waiting.filter(match).map(a => `<button class="kname" data-a="${a.id}" data-act="weigh"><b>${esc(a.first)}</b><span>${esc(a.last)}</span></button>`).join('')
      || `<div class="small muted" style="grid-column:1/-1">${waiting.length ? 'No one matches.' : L.length ? '✓ Everyone is checked in.' : 'No girls on the roster yet. Tap ＋ New girl.'}</div>`;
    $('#wint').classList.toggle('hidden', !inn.length);
    $('#win').innerHTML = inn.filter(match).map(a => { const r = recOf(a.id), p = prevW(a.id); const d = p && typeof r.weight === 'number' ? Math.round((r.weight - p.weight) * 10) / 10 : null;
      const extra = [r.feel ? FACES[r.feel - 1] : '', r.goal?.word ? esc(r.goal.word) : ''].filter(Boolean).join(' ');
      return `<div class="wrow" data-a="${a.id}" data-act="weigh">
        <div class="grow" style="min-width:0"><div class="an">${esc(a.first)} ${esc(a.last)}</div><div class="as">${d ? diffHTML(d) + ` <span class="muted">since ${fmtDate(p.date)}</span>` : ''}${extra ? ` ${extra}` : ''}${flags(r)}</div></div>
        <span class="wlock">${typeof r.weight === 'number' ? r.weight : '—'}</span></div>`; }).join('');
  };
  main.innerHTML = `<div class="page-head" style="margin-bottom:10px"><div style="flex:1"><h1>Check-in</h1>
        <label class="dpick">${wDate === today() ? 'Today' : fmtDate(wDate)} ▾<input type="date" id="wdt" value="${wDate}"></label></div>
      <button class="btn sm" data-act="tablet">📱 Tablet mode</button></div>
    <div id="wc" class="small" style="margin-bottom:12px"></div>
    <div class="row" style="gap:8px;margin-bottom:12px">
      <input class="input grow" id="wq" placeholder="🔍 Find a name…" autocomplete="off">
      <button class="btn" data-act="voice" title="Say names and weights">🎤</button>
      <button class="btn primary" data-act="newgirl">＋ New girl</button>
    </div>
    ${sites.length ? `<select class="input input-sm" id="wst" style="margin-bottom:10px"><option value="all">All buildings</option>${sites.map(s => `<option value="${s.id}" ${wSite === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
    <div class="small muted" style="margin-bottom:8px">Tap her name and enter her weight. Anyone not checked in is absent.</div>
    <div class="kgrid" id="wwait"></div>
    <div class="section-title" id="wint">✓ Here <span style="text-transform:none;letter-spacing:0;font-weight:600">· tap to fix weight or add a goal</span></div><div class="plist" id="win"></div>
    <div class="row wrap" style="gap:8px;margin-top:22px"><a class="btn ghost sm" href="#/checkins">◷ Check-in history</a><button class="btn ghost sm" id="wcsv">⬇ Export this day</button><a class="btn go sm" href="#/" style="margin-left:auto">Done → Today</a></div>`;
  $('#wq').oninput = (e) => { q = e.target.value; draw(); };
  $('#wdt').onchange = (e) => { wDate = e.target.value || today(); viewWeighIn(main, user); };
  $('#wst') && ($('#wst').onchange = async (e) => { wSite = e.target.value; tg = await teamGoals(wSite); draw(); });
  $('#wcsv').onclick = () => {
    const rows = [['last', 'first', 'date', 'status', 'weight', 'change', 'feeling_1to5', 'sleep_hrs', 'sleep', 'fruit_veg', 'milk', 'goal_word', 'goal', 'last_goal_met']].concat(list().map(a => { const r = recOf(a.id), p = prevW(a.id);
      return [a.last, a.first, wDate, isIn(a.id) ? 'here' : 'absent', r?.weight ?? '', typeof r?.weight === 'number' && p ? Math.round((r.weight - p.weight) * 10) / 10 : '', r?.feel || '', r?.sleepHrs || '', r?.sleepQ || '', r?.fruitVeg ?? '', r?.milk ?? '', r?.goal?.word || '', goalText(r?.goal), r?.prevMet ?? '']; }));
    download(`check-in-${wDate}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  // Weigh one girl: big weight box. Saving the weight = checked in.
  const weighSheet = (a) => {
    const r = recOf(a.id), p = prevW(a.id);
    const m = modal({ title: `${a.first} ${a.last}`, body: `<div class="stack" style="text-align:center">
        <div class="tiny">Weight</div>
        <input class="input kw" id="ww" inputmode="decimal" enterkeyhint="done" value="${typeof r?.weight === 'number' ? r.weight : ''}" placeholder="—" autocomplete="off">
        <div class="small muted">${p ? `Last: ${p.weight} on ${fmtDate(p.date)}` : 'First weigh-in'}</div>
        <button class="btn go xl" data-act="wsave" style="width:100%">✓ Check in</button>
        <button class="btn ghost" data-act="wmore">${isIn(a.id) ? '✓ Save + how she feels &amp; her goal' : '✓ Check in + how she feels &amp; her goal'} <span class="muted">(optional)</span></button>
        ${isIn(a.id) ? '<button class="btn ghost sm" data-act="wabs" style="color:#fca5a5">Undo check-in (she\'s not here)</button>' : ''}</div>`,
      onAction: async (act, el, w, close) => {
        if (act === 'wabs') { try { await saveRec(a.id, { weight: undefined, here: undefined }); close(); draw(); } catch (e) { toast(e.code || e.message, 'error'); } return; }
        const n = Math.round(parseFloat(w.querySelector('#ww').value) * 10) / 10;
        if (!(n > 0 && n < 500)) { w.querySelector('#ww').focus(); return toast('Type her weight to check her in', 'error'); }
        try { await saveRec(a.id, { weight: n, absent: undefined }); } catch (e) { return toast('Not saved: ' + (e.code || e.message), 'error'); }
        close(); q = ''; $('#wq').value = ''; draw(); toast(`${a.first} checked in at ${n}`, 'success');
        if (act === 'wmore') openGoal(a);
      } });
    const inp = m.el.querySelector('#ww'); setTimeout(() => { inp.focus(); inp.select(); }, 60);
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); m.el.querySelector('[data-act=wsave]').click(); } };
  };
  const openGoal = (a) => goalSheet(a, recOf(a.id), prevGoal(a.id), tg, async (goal, prevMet, pg, well) => {
    await saveRec(a.id, { ...(goal ? { goal } : {}), ...well, ...(prevMet !== null ? { prevMet } : {}) });
    if (pg && prevMet !== null) { const { id, updatedAt, by, ...rest } = pg; await store.put('weighins', pg.id, { ...rest, met: prevMet }).catch(() => {}); pg.met = prevMet; }
    draw();
  });
  // New girl: added to the roster AND checked in, in one step.
  const newGirl = () => {
    const m = modal({ title: 'New girl', body: `<div class="stack">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px"><label class="field"><span class="tiny">First name</span><input class="input" id="nf" autocapitalize="words" autocomplete="off"></label>
          <label class="field"><span class="tiny">Last name</span><input class="input" id="nl" autocapitalize="words" autocomplete="off"></label></div>
        <label class="field"><span class="tiny">Grade</span><select class="input" id="ng"><option value=""></option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select></label>
        <label class="field" style="text-align:center"><span class="tiny">Weight today</span><input class="input kw" id="nw" inputmode="decimal" placeholder="—"></label>
        <div class="small muted">Ask her to spell her name. She's added to the roster and checked in.</div></div>`,
      footer: `<button class="btn" data-act="close">Cancel</button><button class="btn go lg" data-act="nsave">✓ Add &amp; check in</button>`,
      onAction: async (act, el, w, close) => {
        if (act !== 'nsave') return;
        const capw = (x) => x.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])([a-z])/g, (mm, p1, p2) => p1 + p2.toUpperCase());
        const first = capw(w.querySelector('#nf').value), last = capw(w.querySelector('#nl').value), grade = w.querySelector('#ng').value;
        const n = Math.round(parseFloat(w.querySelector('#nw').value) * 10) / 10;
        if (!first || !last) return toast('First and last name, please', 'error');
        if (!(n > 0 && n < 500)) return toast('Type her weight', 'error');
        let a = athletes.find(x => x.first.toLowerCase() === first.toLowerCase() && x.last.toLowerCase() === last.toLowerCase());
        el.disabled = true;
        try {
          if (!a) { const site = wSite !== 'all' ? wSite : (user.prefs?.site || ''); const id = await store.put('athletes', null, { first, last, grade, nick: '', level: '', site, active: true }); a = { id, first, last, grade, site, active: true }; athletes.push(a); athletes.sort(sortAth); }
          await saveRec(a.id, { weight: n, absent: undefined });
          close(); draw(); toast(`${first} ${last} added and checked in at ${n}`, 'success');
        } catch (e) { el.disabled = false; toast('Not saved: ' + (e.code || e.message), 'error'); }
      } });
    setTimeout(() => m.el.querySelector('#nf').focus(), 60);
  };
  main.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.dataset.act === 'newgirl') return newGirl();
    if (b.dataset.act === 'voice') return voiceCheck();
    if (b.dataset.act === 'tablet') { const { startTablet } = await import('./tablet.js'); return startTablet(sites, user); }
    const a = athletes.find(x => x.id === b.closest('[data-a]')?.dataset.a); if (!a) return;
    if (b.dataset.act === 'weigh') weighSheet(a);
    if (b.dataset.act === 'goal') openGoal(a);
  };
  draw();
  if (window.innerWidth > 760) $('#wq').focus();
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
    <div class="small muted">All optional. Answer what you want, then tap Save.</div>
    <div><div class="tiny" style="margin-bottom:6px">How are you feeling today?</div><div class="faces">${FACES.map((f, i) => `<button class="face ${w.feel === i + 1 ? 'on' : ''}" data-act="feel" data-v="${i + 1}"><span>${f}</span><small>${FACE_LABEL[i]}</small></button>`).join('')}</div></div>
    <div><div class="tiny" style="margin-bottom:6px">How did you sleep last night?</div><div class="row wrap" style="gap:6px">${[5, 6, 7, 8, 9, 10].map(h => `<button class="chip ${w.sleepHrs === h ? 'on' : ''}" data-act="sleep" data-v="${h}">${h === 5 ? '5 or less' : h === 10 ? '10+' : h} hrs</button>`).join('')}</div>
      <div class="row wrap" style="gap:6px;margin-top:6px">${['Great', 'OK', 'Rough'].map(q => `<button class="chip ${w.sleepQ === q ? 'on' : ''}" data-act="sleepq" data-v="${q}">${q}</button>`).join('')}</div></div>
    <div><div class="tiny" style="margin-bottom:6px">Recovery fuel since last practice</div><div class="stack" style="gap:6px">${yn('fruitVeg', '🍎 Fruits or veggies?')}${yn('milk', '🥛 Milk or chocolate milk?')}</div></div>
    ${a.goalLong || a.goalMid ? `<div class="card" style="background:#0d1428"><div class="tiny">Your bigger goals</div>${a.goalMid ? `<div class="small" style="margin-top:4px"><b>Mid-season:</b> ${esc(a.goalMid)}</div>` : ''}${a.goalLong ? `<div class="small" style="margin-top:4px"><b>Season:</b> ${esc(a.goalLong)}</div>` : ''}</div>` : ''}
    ${tg.day ? `<div class="small"><span class="tiny">Team goal today</span><br>${esc(tg.day)}</div>` : ''}
    ${pg ? `<div class="card" style="background:#0d1428"><div class="tiny">Last goal (${fmtDate(pg.date)})</div><div class="small" style="margin:4px 0 8px">${esc(goalText(pg.goal))}</div>
      <div class="row" style="gap:6px"><span class="small">Did you hit it?</span><button class="chip ${met === true ? 'on' : ''}" data-act="met" data-v="1">✓ Yes</button><button class="chip ${met === false ? 'on' : ''}" data-act="met" data-v="0">✗ Not yet</button></div></div>` : ''}
    <div class="tiny" style="margin-top:6px;color:var(--gold)">Today's goal (optional)</div>
    <div><div class="tiny" style="margin-bottom:6px">1. Pick your focus word</div><div class="row wrap" style="gap:6px">${WORDS.map(w => `<button class="chip word ${g.word === w ? 'on' : ''}" data-act="word" data-w="${w}">${w}</button>`).join('')}</div>
      <div class="small muted" id="whint" style="margin-top:4px">${g.word ? esc(WORD_HINT[g.word]) : ''}</div></div>
    <label class="field"><span class="tiny">2. What will you do? (be specific)</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Finish my single leg by running the pipe"></label>
    <label class="field"><span class="tiny">3. How many, or how will you know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. at least 5 times, or every rep"></label>
    <label class="field"><span class="tiny">4. When in practice?</span><input class="input" data-g="when" value="${esc(g.when)}" placeholder="e.g. during live goes today"></label>
    <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Your goal</div><div id="gprev" style="font-weight:700">${esc(goalText(g)) || '<span class="muted">Fill in the steps above</span>'}</div>
      <div class="smart" id="gchk" style="margin-top:10px">${checks()}</div></div></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn primary lg" data-act="save">Save</button>`,
    onAction: async (act, el, wrap, close) => {
      const on = (sel, el2) => wrap.querySelectorAll(sel).forEach(c => c.classList.toggle('on', c === el2));
      if (act === 'feel') { w.feel = +el.dataset.v; on('.face', el); }
      if (act === 'sleep') { w.sleepHrs = +el.dataset.v; on('[data-act=sleep]', el); }
      if (act === 'sleepq') { w.sleepQ = el.dataset.v; on('[data-act=sleepq]', el); }
      if (act === 'yn') { w[el.dataset.k] = el.dataset.v === '1'; on(`[data-act=yn][data-k=${el.dataset.k}]`, el); }
      if (act === 'word') { g.word = el.dataset.w; on('.chip.word', el); wrap.querySelector('#whint').textContent = WORD_HINT[g.word]; refresh(); }
      if (act === 'met') { met = el.dataset.v === '1'; on('[data-act=met]', el); }
      if (act === 'save') {
        // Everything here is optional: save whatever she answered.
        const well = {}; ['feel', 'sleepHrs', 'sleepQ'].forEach(k => { if (w[k]) well[k] = w[k]; }); ['fruitVeg', 'milk'].forEach(k => { if (w[k] !== null) well[k] = w[k]; });
        const goal = (g.what || '').trim() ? { word: g.word, what: g.what.trim(), measure: g.measure.trim(), when: g.when.trim() } : undefined;
        try { await onSave(goal, met, pg, well); close(); toast('Saved', 'success'); } catch (e) { toast(e.code || e.message, 'error'); }
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
// ---- Team photo: shrunk to ~300 KB and saved in Firestore (lineupphotos/{id}),
// so every coach can open it and keep tagging on any device. Tags live in lineups/{id}.
const lineupId = (site) => `photo-${site && site !== 'all' ? site : 'team'}`;
// Tries four ways to read a photo so any phone's picture works (big Android photos,
// rotated photos, cloud-gallery files, blob URLs blocked, Safari HEIC).
let decodeVia = '';
async function decodeImage(file) {
  const errors = []; decodeVia = '';
  if (!file || !file.size) throw new Error('The photo came through empty. If it\'s in Google Photos, download it to the phone first, or take a screenshot of it.');
  if (window.createImageBitmap) {
    // 1) decode already shrunk: memory-safe for 50-200 MP phone photos
    try { const b = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: 1400, resizeQuality: 'high' }); decodeVia = 'bitmap-resize'; return b; } catch (e) { errors.push('bitmap-resize: ' + (e.name || e.message)); }
    // 2) full-size decode
    try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' }); decodeVia = 'bitmap'; return b; } catch (e) { errors.push('bitmap: ' + (e.name || e.message)); }
  }
  const viaImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => (i.naturalWidth ? res(i) : rej(new Error('empty'))); i.onerror = () => rej(new Error('img load failed')); i.src = src; });
  // 3) blob URL into <img>
  const url = URL.createObjectURL(file);
  try { const i = await viaImg(url); decodeVia = 'img/blob'; return i; } catch (e) { errors.push('img/blob: ' + e.message); } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
  // 4) read the bytes as a data URL into <img> (works when blob URLs are blocked)
  try {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error || new Error('read failed')); r.readAsDataURL(file); });
    const i = await viaImg(dataUrl); decodeVia = 'img/data'; return i;
  } catch (e) { errors.push('img/data: ' + (e.name || e.message)); }
  const err = new Error('decode'); err.details = `${file.type || 'unknown type'}, ${Math.round(file.size / 1024)} KB · ${errors.join(' | ')}`; throw err;
}
async function shrinkPhoto(file, maxW = 1400, q = 0.72) {
  let img;
  try { img = await decodeImage(file); }
  catch (e) {
    if (e.message !== 'decode') throw e;
    const heic = /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
    const err = new Error((heic ? "This browser can't open HEIC photos. Save the photo as JPG, or upload a screenshot of it." : "Couldn't open that image. Upload a screenshot of the photo instead, which always works.") + (e.details ? `\n\nDetails for Coach Josh: ${e.details}` : ''));
    throw err;
  }
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Couldn't read the photo size. Try a screenshot of the photo.");
  const k = Math.min(1, maxW / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); if (!ctx) throw new Error('This browser blocked the photo. Try Chrome or Safari.');
  ctx.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  let data = c.toDataURL('image/jpeg', q);
  while (data.length > 600000 && q > 0.35) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
  if (data.length > 950000) { const c2 = document.createElement('canvas'); c2.width = Math.round(w * 0.7); c2.height = Math.round(h * 0.7); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); data = c2.toDataURL('image/jpeg', 0.7); w = c2.width; h = c2.height; }
  return { data, w, h };
}
async function photoLoad(id) { try { const r = (await store.list('lineupphotos')).find(x => x.id === id); return r?.data ? r : null; } catch (e) { return null; } }
async function photoSave(id, p) { await store.put('lineupphotos', id, { data: p.data, w: p.w, h: p.h }); }
// Shrink, then save. If the save fails for any reason other than permissions, retry once with a smaller photo.
async function uploadPhoto(file, id) {
  let step = 'opening the photo', p;
  try {
    p = await shrinkPhoto(file);
    step = 'saving to the team database';
    try { await photoSave(id, p); }
    catch (e) {
      if (e?.code === 'permission-denied' || e?.code === 'unauthenticated') throw e;
      step = 'saving a smaller copy';
      p = await shrinkPhoto(file, 1000, 0.6); await photoSave(id, p);
    }
    return p;
  } catch (e) { e.step = e.step || step; throw e; }
}
const photoErrText = (err) => {
  const why = err?.code === 'permission-denied' ? 'Permission denied. The photo section of the Firestore rules isn\'t published yet.'
    : err?.code === 'unauthenticated' ? 'You\'re signed out. Sign in again and retry.'
    : (err?.message || String(err));
  return `${why}\n\nDetails for Coach Josh: failed while ${err?.step || 'uploading'} · ${err?.code || err?.name || 'error'} · ${navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 120)}`;
};
async function photoRemove(id) { try { await store.del('lineupphotos', id); } catch (e) {} }

// Turn face taps into rows: split by the biggest vertical gaps, front row = lowest in the photo,
// then left to right within each row.
export function rowsFromTags(tags, n) {
  if (!tags.length) return Array.from({ length: n }, () => []);
  const byY = tags.slice().sort((a, b) => a.y - b.y);
  const k = Math.min(n, byY.length);
  // Only split where faces are clearly at different heights (rows are usually 10-20% of the photo apart,
  // faces in one row wobble a few %), so a half-tagged photo never breaks one row in two.
  const gaps = byY.slice(1).map((t, i) => ({ i: i + 1, g: t.y - byY[i].y })).filter(x => x.g >= 6).sort((a, b) => b.g - a.g).slice(0, k - 1).map(x => x.i).sort((a, b) => a - b);
  const groups = []; let start = 0; [...gaps, byY.length].forEach(cut => { groups.push(byY.slice(start, cut)); start = cut; });
  const rows = groups.reverse().map(g => g.sort((a, b) => a.x - b.x).map(t => ({ id: t.id || null, name: t.name })));
  while (rows.length < n) rows.push([]);
  return rows;
}

const ROW_NAMES = (n) => n === 1 ? ['From left'] : Array.from({ length: n }, (_, i) => i === 0 ? 'Front row' : i === n - 1 ? 'Back row' : ['Second row', 'Third row', 'Fourth row'][i - 1]);
let L = null;
export async function viewLineup(main, user) {
  if (!can(user, 'edit')) { location.hash = '#/roster'; return; }
  main.innerHTML = '<div class="muted">Loading…</div>';
  const { athletes, sites } = await load();
  if (!L) { try { L = JSON.parse(localStorage.getItem('practice-lineup') || 'null'); } catch (e) { L = null; } }
  const siteGuess = L?.site || (sites.some(s => s.id === user.prefs?.site) ? user.prefs.site : 'all');
  try { const saved = (await store.list('lineups')).find(x => x.id === lineupId(siteGuess)); if (saved?.state && (!L || (saved.updatedAt || 0) > (L.savedAt || 0))) L = { ...saved.state, savedAt: saved.updatedAt }; } catch (e) {}
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
  L.tags ||= [];
  let shareT = null;
  const saveShared = () => { clearTimeout(shareT); shareT = setTimeout(async () => { L.savedAt = Date.now(); const { savedAt, ...state } = L;
    try { await store.put('lineups', lineupId(L.site), { state, site: L.site }); const st = $('#lsave'); if (st) st.textContent = '✓ Saved for every coach'; } catch (e) { const st = $('#lsave'); if (st) st.textContent = '⚠ Not saved to the team: ' + (e.code || e.message); } }, 600); };
  const draw = () => {
    if (L.tags.length) L.rows = rowsFromTags(L.tags, L.rowsCount);
    const pl = placed(), names = ROW_NAMES(L.rowsCount);
    paintTags();
    $('#rows').innerHTML = L.rows.map((r, i) => `<div class="lrow ${L.cur === i ? 'cur' : ''}" data-row="${i}">
        <div class="row between"><b>${names[i]}</b><span class="small muted">${r.length} · ${L.cur === i ? 'adding here' : 'tap to add here'}</span></div>
        <div class="lnames">${r.map((x, k) => `<span class="lchip" data-k="${k}"><span class="ln">${k + 1}</span>${esc(x.name)}<button data-act="rm" aria-label="Remove">✕</button></span>`).join('') || '<span class="small muted">Tap names below, left to right.</span>'}</div></div>`).join('');
    const q = ($('#lq')?.value || '').toLowerCase();
    $('#lpool').innerHTML = pool().filter(a => !pl.has(a.id) && (!q || full(a).toLowerCase().includes(q))).map(a => `<button class="chip" data-add="${a.id}">${esc(full(a))}</button>`).join('') || `<span class="small muted">${athletes.length ? 'Everyone on the roster is placed.' : 'No one on the roster yet. Add girls below as they give you their names.'}</span>`;
    $('#cap').textContent = caption();
    const cn = $('#lcurname'); if (cn) cn.textContent = names[L.cur];
    try { localStorage.setItem('practice-lineup', JSON.stringify(L)); } catch (e) {}
    saveShared();
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
    <div class="card" style="margin-bottom:12px"><div class="row wrap between" style="gap:8px"><b>📷 Tag the team photo</b>
        <span class="row" style="gap:6px"><label class="btn primary sm"><span id="lupl">Upload photo</span><input type="file" id="lphoto" accept="image/*" hidden></label><button class="btn sm ghost hidden" id="lphdel">Remove photo</button></span></div>
      <div class="small muted" style="margin-top:6px">Upload the photo, then tap it to open <b>full screen</b>. Pinch or double-tap to zoom, tap each face, and pick or type her name. Rows and left-to-right order build themselves. Saved for every coach. <span id="lsave"></span> <a href="#/phototest" style="color:var(--gold)">Upload not working? Run the photo test</a></div>
      <div class="phprev hidden" id="phwrap"><div class="ph" id="ph"><img id="phimg" alt="Team photo"><div id="phtags"></div></div><div class="phopen">⤢ Tap to tag full screen</div></div></div>
    <div class="small muted" style="margin-bottom:8px" id="lhow">No photo? Tap a row, then tap names in order from <b>left to right</b> as you look at the photo. Drag a name to fix the order; ✕ removes it.</div>
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
  // ---- photo tagging ----
  const short = (n) => n === 'Front row' ? 'F' : n === 'Back row' ? 'B' : n === 'From left' ? '' : n.split(' ')[0][0];
  const tagsHTML = () => {
    const names = ROW_NAMES(L.rowsCount);
    const pos = {}; L.rows.forEach((r, ri) => r.forEach((x, k) => { pos[(x.id || '') + '|' + x.name] = `${short(names[ri])}${k + 1}`; }));
    return L.tags.map((t, i) => `<button class="ptag" data-tag="${i}" style="left:${t.x}%;top:${t.y}%"><span class="pd">${pos[(t.id || '') + '|' + t.name] || ''}</span><span class="pn">${esc(t.name.split(' ')[0])}</span></button>`).join('');
  };
  function paintTags() {
    const box = $('#phtags'); if (box) box.innerHTML = tagsHTML();
    const fs = document.getElementById('fstags'); if (fs) fs.innerHTML = tagsHTML();
    const fc = document.getElementById('fscount'); if (fc) fc.textContent = `${L.tags.length} tagged`;
    $('#lhow')?.classList.toggle('hidden', !!L.tags.length);
  }
  let photo = null;
  const showPhoto = (p) => {
    photo = p; if (!p) return;
    $('#phimg').src = p.data;
    ['phwrap', 'lphdel'].forEach(id => $('#' + id).classList.remove('hidden')); $('#lupl').textContent = 'Replace photo';
  };
  photoLoad(lineupId(L.site)).then(showPhoto);
  $('#lphoto').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#lupl').textContent = 'Uploading…';
    try { const p = await uploadPhoto(f, lineupId(L.site)); showPhoto(p); toast('Photo saved. Tap it to tag faces.', 'success'); openFull(); }
    catch (err) { console.error(err); $('#lupl').textContent = photo ? 'Replace photo' : 'Upload photo';
      modal({ title: 'Photo not saved', body: `<p style="white-space:pre-wrap">${esc(photoErrText(err))}</p><p class="small muted">Run the photo test below and send Coach Josh a screenshot.</p>`,
        footer: '<a class="btn" href="#/phototest" data-act="close">🧪 Run the photo test</a><button class="btn primary" data-act="close">OK</button>' }); }
    e.target.value = '';
  };
  $('#lphdel').onclick = async () => { if (!(await confirmBox('Remove the photo?', 'Removes the photo and its name tags for every coach. Names stay on the roster.', 'Remove'))) return;
    await photoRemove(lineupId(L.site)); photo = null; L.tags = []; L.rows = Array.from({ length: L.rowsCount }, () => []);
    ['phwrap', 'lphdel'].forEach(id => $('#' + id).classList.add('hidden')); $('#lupl').textContent = 'Upload photo'; draw(); };
  $('#phwrap').onclick = () => openFull();

  // Full-screen viewer: pinch / wheel / double-tap zoom, drag to pan, tap a face to tag.
  function openFull() {
    if (!photo) return;
    const fs = document.createElement('div'); fs.className = 'fsview';
    fs.innerHTML = `<div class="fsbar"><b>Tap a face</b><span id="fscount" class="small muted"></span><span class="grow"></span>
        <button class="btn sm" data-z="-">−</button><button class="btn sm" data-z="+">＋</button><button class="btn sm" data-z="0">Fit</button><button class="btn primary sm" data-z="x">Done</button></div>
      <div class="fsstage" id="fsstage"><div class="fsinner" id="fsinner"><img src="${photo.data}" id="fsimg" draggable="false"><div id="fstags"></div></div></div>
      <div class="fshint small">Pinch or double-tap to zoom · drag to move · tap a face to name her · tap a tag to change it</div>`;
    document.body.appendChild(fs); paintTags();
    const stage = fs.querySelector('#fsstage'), inner = fs.querySelector('#fsinner'), img = fs.querySelector('#fsimg');
    let sc = 1, tx = 0, ty = 0, base = 1;
    const fit = () => { const r = stage.getBoundingClientRect(); base = Math.min(r.width / photo.w, r.height / photo.h); inner.style.width = photo.w * base + 'px'; inner.style.height = photo.h * base + 'px'; sc = 1; tx = (r.width - photo.w * base) / 2; ty = (r.height - photo.h * base) / 2; apply(); };
    const apply = () => { inner.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; inner.style.setProperty('--inv', 1 / sc); };
    const zoomAt = (f, cx, cy) => { const n = Math.max(1, Math.min(8, sc * f)); const k = n / sc; tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; sc = n; if (sc === 1) fit(); else apply(); };
    const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pts = new Map(); let down = null, pinch = null, lastTap = 0;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e));
      if (pts.size === 1) down = { p: local(e), tx, ty, t: Date.now(), moved: false, target: e.target };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), sc, tx, ty, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; down = null; } });
    stage.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, local(e));
      if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const n = Math.max(1, Math.min(8, pinch.sc * d / pinch.d)); const k = n / pinch.sc;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; sc = n; tx = m[0] - (pinch.m[0] - pinch.tx) * k; ty = m[1] - (pinch.m[1] - pinch.ty) * k; apply(); return; }
      if (down) { const p = local(e); const dx = p[0] - down.p[0], dy = p[1] - down.p[1]; if (Math.hypot(dx, dy) > 8) down.moved = true; if (down.moved && sc > 1) { tx = down.tx + dx; ty = down.ty + dy; apply(); } } });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (down && !down.moved && e.type === 'pointerup') {
        const p = local(e), now = Date.now();
        const tagEl = down.target.closest && down.target.closest('[data-tag]');
        if (tagEl) { const i = +tagEl.dataset.tag, t = L.tags[i]; tagSheet(t.x, t.y, i); }
        else if (now - lastTap < 300) { zoomAt(sc > 1.5 ? 1 / sc : 2.5, p[0], p[1]); lastTap = 0; clearTimeout(down.timer); }
        else { lastTap = now; const r = img.getBoundingClientRect(); const cx = e.clientX, cy = e.clientY;
          if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) { const x = Math.round((cx - r.left) / r.width * 1000) / 10, y = Math.round((cy - r.top) / r.height * 1000) / 10;
            const tmr = setTimeout(() => { if (lastTap === now) tagSheet(x, y); }, 280); down.timer = tmr; } } }
      if (pts.size === 0) down = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]); }, { passive: false });
    fs.querySelector('.fsbar').onclick = (e) => { const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return; const r = stage.getBoundingClientRect();
      if (z === 'x') { fs.remove(); window.removeEventListener('resize', fit); draw(); } else if (z === '0') fit(); else zoomAt(z === '+' ? 1.5 : 1 / 1.5, r.width / 2, r.height / 2); };
    window.addEventListener('resize', fit);
    if (img.complete) fit(); else img.onload = fit;
  }
  const tagSheet = (x, y, idx = null) => {
    const t = idx !== null ? L.tags[idx] : null;
    const taken = new Set(L.tags.filter((_, i) => i !== idx).map(z => z.id).filter(Boolean));
    let q = '';
    const list = () => pool().filter(a => !taken.has(a.id) && (!q || full(a).toLowerCase().includes(q.toLowerCase()))).map(a => `<button class="dr" data-act="pick" data-id="${a.id}"><span class="grow"><span class="dr-t" style="text-transform:none">${esc(full(a))}</span></span><span class="dr-plus">✓</span></button>`).join('')
      || `<div class="small muted">${q ? 'Not on the roster. Add her below.' : 'Everyone on the roster is tagged. Add someone new below.'}</div>`;
    const set = (id, name) => { const tag = { x, y, id, name }; if (idx !== null) L.tags[idx] = tag; else L.tags.push(tag); draw(); };
    const m = modal({ title: t ? `Who is this? (now: ${t.name})` : 'Who is this?', body: `<div class="stack">
        <input class="input" id="tq" placeholder="🔍 Type her name…" autocomplete="off">
        <div class="drs" id="tl" style="max-height:38vh;overflow-y:auto">${list()}</div>
        <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Not on the roster yet? Add her</div>
          <div class="grid" style="grid-template-columns:1fr 1fr 64px;gap:6px"><input class="input" id="tf" placeholder="First" autocapitalize="words"><input class="input" id="tln" placeholder="Last" autocapitalize="words">
            <select class="input" id="tg"><option value="">Gr</option>${GRADES.slice(6).map(g => `<option>${g}</option>`).join('')}</select></div>
          <div class="row" style="gap:6px;margin-top:6px"><button class="btn primary grow" data-act="newgirl">＋ Add wrestler</button><button class="btn" data-act="newother">＋ Coach / other</button></div></div></div>`,
      footer: t ? '<button class="btn danger" data-act="untag">Remove this tag</button><span class="grow"></span><button class="btn" data-act="close">Cancel</button>' : '',
      onAction: async (act, el, w, close) => {
        if (act === 'pick') { const a = athletes.find(z => z.id === el.dataset.id); set(a.id, full(a)); close(); }
        if (act === 'untag') { L.tags.splice(idx, 1); close(); draw(); }
        if (act === 'newgirl' || act === 'newother') {
          const first = cap(w.querySelector('#tf').value), last = cap(w.querySelector('#tln').value), grade = w.querySelector('#tg').value;
          if (!first) return toast('Type a name', 'error');
          if (act === 'newother') { set(null, `${first} ${last}`.trim()); close(); return; }
          if (!last) return toast('First and last name, please', 'error');
          const dup = athletes.find(a => a.first.toLowerCase() === first.toLowerCase() && a.last.toLowerCase() === last.toLowerCase());
          let id = dup?.id;
          if (!dup) { const site = L.site !== 'all' ? L.site : (user.prefs?.site || '');
            try { id = await store.put('athletes', null, { first, last, grade, nick: '', level: '', site, active: true }); athletes.push({ id, first, last, grade, site, active: true }); athletes.sort(sortAth); }
            catch (err) { return toast('Not saved to roster: ' + (err.code || err.message), 'error'); } }
          set(id, `${first} ${last}`); close(); toast(dup ? `${first} was already on the roster` : `Added ${first} ${last} to the roster`, 'success');
        }
      } });
    const qi = m.el.querySelector('#tq'); qi.oninput = () => { q = qi.value; m.el.querySelector('#tl').innerHTML = list(); m.el.querySelector('#tf').value = q.split(' ')[0] || ''; m.el.querySelector('#tln').value = q.split(' ').slice(1).join(' '); };
    if (window.innerWidth > 760) setTimeout(() => qi.focus(), 50);
  };
  const resize = (n) => { while (L.rows.length < n) L.rows.push([]); if (L.rows.length > n) { const extra = L.rows.splice(n).flat(); L.rows[n - 1].push(...extra); } L.rowsCount = n; L.cur = Math.min(L.cur, n - 1); };
  $('#lrc').onchange = (e) => { resize(+e.target.value); draw(); };
  $('#lst') && ($('#lst').onchange = async (e) => { L.site = e.target.value; try { const saved = (await store.list('lineups')).find(x => x.id === lineupId(L.site)); if (saved?.state) L = { ...saved.state, site: e.target.value }; } catch (err) {} viewLineup(main, user); });
  $('#lnp').onchange = (e) => { L.notPictured = e.target.checked; draw(); };
  $('#lclr').onclick = async () => { if (await confirmBox('Start over?', 'Clears every row.', 'Clear')) { L.rows = Array.from({ length: L.rowsCount }, () => []); L.tags = []; L.cur = 0; draw(); } };
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
    if (add) { if (L.tags.length) return toast('You\'re tagging the photo. Tap her face in the photo instead.', 'error'); const a = athletes.find(x => x.id === add.dataset.add); L.rows[L.cur].push({ id: a.id, name: full(a) }); draw(); return; }
    if (e.target.closest('[data-act=rm]')) { const r = +e.target.closest('[data-row]').dataset.row, k = +e.target.closest('[data-k]').dataset.k;
      if (L.tags.length) { const x = L.rows[r][k]; const ti = L.tags.findIndex(t => (t.id || null) === (x.id || null) && t.name === x.name); if (ti >= 0) L.tags.splice(ti, 1); } else L.rows[r].splice(k, 1); draw(); return; }
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
export function practiceGoalSheet(p, onSave, { reason = '', onSkip = null } = {}) {
  const old = p.goal?.what ? p.goal : null;
  const g = { word: '', what: '', measure: '', when: '', ...(goalIsToday(p) ? p.goal : {}) };
  const checks = () => smartCheck(g).map(c => `<div class="sm ${c.ok ? 'ok' : ''}"><b>${c.k}</b> ${esc(c.label.replace('she', 'the team').replace('She', 'The team'))}</div>`).join('');
  const m = modal({ title: '🎯 Today\'s practice goal', body: `<div class="stack">
    ${reason ? `<div class="small" style="color:#fde68a">${esc(reason)}</div>` : ''}
    <div class="small muted">Optional. The SMART checklist is a guide, not a requirement.</div>
    ${old && !goalIsToday(p) ? `<div class="card" style="background:#0d1428"><div class="tiny">This practice's goal from ${fmtDate(old.date)}</div><div style="margin:6px 0 8px;font-weight:700">${esc(goalText(old))}</div>
      <div class="small muted" style="margin-bottom:8px">It's a new day, so set today's goal. Reuse it or change it.</div><button class="btn sm" data-act="reuse">↺ Use it again for today</button></div>` : ''}
    <div><div class="tiny" style="margin-bottom:6px">1. Focus word for the team</div><div class="row wrap" style="gap:6px">${WORDS.map(w => `<button class="chip word ${g.word === w ? 'on' : ''}" data-act="word" data-w="${w}">${w}</button>`).join('')}</div></div>
    <label class="field"><span class="tiny">2. What will the team do?</span><input class="input" data-g="what" value="${esc(g.what)}" placeholder="e.g. Every girl gets off bottom with a stand-up"></label>
    <label class="field"><span class="tiny">3. How many, or how will we know?</span><input class="input" data-g="measure" value="${esc(g.measure)}" placeholder="e.g. within 30 seconds, 5 times each"></label>
    <label class="field"><span class="tiny">4. When in practice?</span><input class="input" data-g="when" value="${esc(g.when)}" placeholder="e.g. in the bottom-position live goes"></label>
    <div class="card" style="background:#0d1428"><div class="tiny" style="margin-bottom:6px">Today's goal</div><div id="gprev" style="font-weight:700">${esc(goalText(g)) || '<span class="muted">Fill in the steps above</span>'}</div>
      <div class="smart" id="gchk" style="margin-top:10px">${checks()}</div></div></div>`,
    footer: `${onSkip ? '<button class="btn" data-act="skip">Skip, no goal today</button>' : '<button class="btn" data-act="close">Cancel</button>'}<button class="btn primary lg" data-act="save">Set today's goal</button>`,
    onAction: async (act, el, w, close) => {
      if (act === 'skip') { close(); return onSkip(); }
      const sync = () => { w.querySelectorAll('[data-g]').forEach(i => { i.value = g[i.dataset.g] || ''; }); w.querySelectorAll('.chip.word').forEach(c => c.classList.toggle('on', c.dataset.w === g.word)); refresh(); };
      if (act === 'word') { g.word = el.dataset.w; sync(); }
      if (act === 'reuse') { Object.assign(g, { word: old.word, what: old.what, measure: old.measure, when: old.when }); sync(); }
      if (act === 'save') {
        if (!(g.what || '').trim()) return toast('Type a goal, or tap Skip', 'error');
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
      ${days.length ? `<div class="plist">${days.map(d => { const R = recs.filter(r => r.date === d); const hereIds = new Set(R.filter(isHere).map(r => r.athleteId)); const here = hereIds.size, out = athletes.filter(a => a.active !== false && !hereIds.has(a.id)).length;
        const w = R.filter(r => typeof r.weight === 'number' && !r.absent).length, g = R.filter(r => r.goal?.what).length, runsD = dayRuns(d);
        return `<a class="prow" href="#/checkins/${d}" style="text-decoration:none;color:inherit"><div class="grow"><div class="pr-t">${fmtDate(d)}</div>
          <div class="pr-s">${here} here · ${out} absent · ${w} weighed · ${g} goals${runsD.length ? ' · ' + runsD.map(r => esc(r.practiceTitle)).join(', ') : ''}</div></div><span class="muted">›</span></a>`; }).join('')}</div>`
        : '<div class="empty">No check-ins yet. They show up here after the first weigh-in.</div>'}`;
    return;
  }
  const R = recs.filter(r => r.date === date);
  const prev = (id) => recs.filter(r => r.athleteId === id && r.date < date && typeof r.weight === 'number').sort((x, y) => y.date.localeCompare(x.date))[0];
  const rows = athletes.filter(a => R.some(r => r.athleteId === a.id) || a.active !== false).map(a => ({ a, r: R.find(x => x.athleteId === a.id) }));
  const runsD = dayRuns(date);
  main.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><a class="btn ghost sm" href="#/checkins">← All days</a>
      <button class="btn sm" id="ccsv">⬇ Export</button></div>
    <div class="page-head"><div><h1>${fmtDate(date)}</h1><div class="muted small">${rows.filter(({ r }) => isHere(r)).length} here · ${rows.filter(({ r }) => !isHere(r)).length} absent</div></div></div>
    ${runsD.length ? `<div class="stack" style="margin-bottom:12px">${runsD.map(r => `<a class="card" href="#/history/${r.id}" style="text-decoration:none;color:inherit;display:block"><div class="tiny">Practice${r.siteName ? ' · ' + esc(r.siteName) : ''}</div>
      <b>${esc(r.practiceTitle)}</b>${r.goal?.what ? `<div class="small" style="margin-top:4px">🎯 ${esc(goalText(r.goal))}</div>` : ''}<div class="small muted">${esc(r.status)}${r.actualSec ? ' · ' + Math.round(r.actualSec / 60) + ' min' : ''} ›</div></a>`).join('')}</div>` : '<div class="small muted" style="margin-bottom:12px">No practice was run this day.</div>'}
    <div class="card" style="padding:0;overflow-x:auto"><table class="list"><tr><th>Wrestler</th><th>Here</th><th>Weight</th><th>Feeling</th><th>Sleep</th><th>Fuel</th><th>Goal</th><th>Hit?</th></tr>
      ${rows.map(({ a, r }) => { const p = prev(a.id); const d = typeof r?.weight === 'number' && p ? Math.round((r.weight - p.weight) * 10) / 10 : null;
        return `<tr><td><b>${esc(a.first)} ${esc(a.last)}</b></td><td>${isHere(r) ? '<span class="badge green">Yes</span>' : '<span class="badge red">Absent</span>'}</td>
          <td>${typeof r?.weight === 'number' ? `${r.weight} ${d !== null ? `<span class="small ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}">${d > 0 ? '+' : ''}${d}</span>` : ''}` : ''}</td>
          <td style="font-size:20px">${r?.feel ? FACES[r.feel - 1] : ''}</td><td class="small">${r?.sleepHrs ? r.sleepHrs + 'h ' + (r.sleepQ || '') : ''}</td>
          <td>${r?.fruitVeg ? '🍎' : ''}${r?.milk ? '🥛' : ''}</td>
          <td class="small">${esc(goalText(r?.goal))}</td><td>${r?.met === true ? '✅' : r?.met === false ? '⬜' : ''}</td></tr>`; }).join('')}</table></div>`;
  $('#ccsv').onclick = () => {
    const out = [['last', 'first', 'date', 'here', 'weight', 'goal', 'goal_met']].concat(rows.map(({ a, r }) => [a.last, a.first, date, isHere(r) ? 'yes' : 'no', r?.weight ?? '', goalText(r?.goal), r?.met ?? '']));
    download(`check-in-${date}.csv`, out.map(x => x.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
}

// Summary of today's check-in (for the Today page)
export async function checkinSummary(site) {
  const [{ athletes, sites }, recs] = await Promise.all([load(), loadWeights()]);
  const L = athletes.filter(a => a.active !== false && (!site || site === 'all' || !sites.length || a.site === site));
  const R = recs.filter(r => r.date === today());
  const of = (id) => R.find(r => r.athleteId === id);
  const here = L.filter(a => isHere(of(a.id))).length;
  return { total: L.length, here, absent: L.length - here, weighed: L.filter(a => typeof of(a.id)?.weight === 'number').length, hereWeighed: here,
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
          if (act === 'save') { if (!(g.what || '').trim()) return toast('Type a goal first', 'error');
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


// ---- Quick check-in: tap your name, weight (optional), done ---------------------
export async function viewKiosk(main, user) { return viewWeighIn(main, user); }


// ---- Photo test: runs every upload step on this device and shows which one fails.
export async function viewPhotoTest(main, user) {
  main.innerHTML = `<div class="page-head"><div><h1>Photo test</h1><div class="small muted">Checks each step of the team-photo upload on this phone.</div></div><a class="btn ghost sm" href="#/lineup">← Team photo</a></div>
    <div class="card stack"><b>1. Pick the team photo (or any photo)</b>
      <label class="btn primary lg" style="width:100%">📷 Choose a photo<input type="file" id="ptf" accept="image/*" hidden></label></div>
    <div class="plist" id="ptout" style="margin-top:12px"></div>
    <div class="row wrap hidden" id="ptdone" style="gap:8px;margin-top:12px"><button class="btn" id="ptcopy">📋 Copy results</button><span class="small muted">Then text it to Coach Josh, or screenshot this screen.</span></div>`;
  const lines = [];
  const add = (ok, label, detail = '') => { lines.push(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'} ${label}${detail ? ' · ' + detail : ''}`);
    $('#ptout').insertAdjacentHTML('beforeend', `<div class="prow"><span style="font-size:20px">${ok === true ? '✅' : ok === false ? '❌' : 'ℹ️'}</span><div class="grow" style="min-width:0"><div class="pr-t" style="text-transform:none">${esc(label)}</div>${detail ? `<div class="pr-s" style="word-break:break-word">${esc(detail)}</div>` : ''}</div></div>`); };
  $('#ptf').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#ptout').innerHTML = ''; lines.length = 0; $('#ptdone').classList.add('hidden');
    add(null, 'Device', navigator.userAgent);
    add(null, 'Signed in as', `${user.email} · ${user.role}`);
    add(!!f.size, 'Photo received', `${f.type || 'no type'} · ${Math.round(f.size / 1024)} KB · ${f.name || ''}`);
    let p = null;
    try { p = await shrinkPhoto(f); add(true, 'Opened and shrunk the photo', `via ${decodeVia} · ${p.w}×${p.h} · ${Math.round(p.data.length / 1024)} KB`); }
    catch (err) { add(false, 'Opening the photo', err.message); }
    const tid = `test-${(user.uid || user.email || 'me').replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
    try { await store.put('lineupphotos', tid, { data: 'x', w: 1, h: 1 }); add(true, 'Saved a tiny test to the database'); }
    catch (err) { add(false, 'Saving a tiny test to the database', `${err.code || err.name || ''} ${err.message || ''}`); }
    if (p) {
      const t0 = Date.now();
      try { await store.put('lineupphotos', tid, { data: p.data, w: p.w, h: p.h }); add(true, 'Saved the full photo', `${((Date.now() - t0) / 1000).toFixed(1)} s`); }
      catch (err) { add(false, 'Saving the full photo', `${err.code || err.name || ''} ${err.message || ''}`);
        try { const q = await shrinkPhoto(f, 1000, 0.6); await store.put('lineupphotos', tid, { data: q.data, w: q.w, h: q.h }); add(true, 'Saved a smaller copy', `${Math.round(q.data.length / 1024)} KB`); }
        catch (err2) { add(false, 'Saving a smaller copy', `${err2.code || err2.name || ''} ${err2.message || ''}`); } }
      try { const back = (await store.list('lineupphotos')).find(x => x.id === tid); add(!!back?.data, 'Read it back', back?.data ? `${Math.round(back.data.length / 1024)} KB` : 'not found'); }
      catch (err) { add(false, 'Reading it back', `${err.code || ''} ${err.message || ''}`); }
    }
    try { await store.del('lineupphotos', tid); } catch {}
    const bad = lines.find(l => l.startsWith('FAIL'));
    add(bad ? false : true, bad ? 'Result: something failed (see the ❌ above)' : 'Result: everything works on this phone. Try the upload again.');
    $('#ptdone').classList.remove('hidden');
    e.target.value = '';
  };
  $('#ptcopy').onclick = async () => { const t = 'Photo test\n' + lines.join('\n'); try { await navigator.clipboard.writeText(t); toast('Copied', 'success'); } catch { prompt('Copy this:', t); } };
}
