// Tablet self check-in: a locked, full-screen screen for the wrestling room.
// A girl taps her name, types her weight on a big keypad, optionally picks how she feels
// and her word for the day, then it resets for the next girl. Exiting needs the coach PIN.
import { esc, $, toast, modal } from './ui.js';
import { store } from './store.js';
import { keepAwake } from './audio.js';
import { WORDS, FACES, isHere } from './roster.js';
import { TEAM_NAME, MOTTO } from './config.js';

const KEY = 'practice-tablet';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];

export const tabletOn = () => { try { return !!JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return false; } };
const cfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
async function hash(pin) {
  const s = `bluejays-tablet:${pin}`;
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
}

// Coach turns tablet mode on (from Today or Check-in).
export async function startTablet(sites, user) {
  const m = modal({ title: '📱 Tablet check-in', body: `<div class="stack">
      <div class="small muted">This device becomes a locked check-in station. Girls tap their name and type their weight; they can't open anything else. It stays this way until you enter your PIN.</div>
      ${sites.length ? `<label class="field"><span class="tiny">Which building's girls?</span><select class="input" id="tsite"><option value="">Everyone</option>${sites.map(s => `<option value="${s.id}" ${user.prefs?.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span class="tiny">Pick a 4-digit PIN to unlock it later</span><input class="input kw" id="tpin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" style="letter-spacing:.4em"></label></div>`,
    footer: `<button class="btn" data-act="close">Cancel</button><button class="btn go lg" data-act="go">Lock it &amp; start</button>`,
    onAction: async (act, el, w, close) => {
      if (act !== 'go') return;
      const pin = w.querySelector('#tpin').value.trim();
      if (!/^\d{4}$/.test(pin)) return toast('PIN must be 4 numbers', 'error');
      const site = w.querySelector('#tsite')?.value || '';
      localStorage.setItem(KEY, JSON.stringify({ site, siteName: sites.find(s => s.id === site)?.name || '', pin: await hash(pin), by: user.name || user.email }));
      close(); location.hash = '#/tablet';
    } });
  setTimeout(() => m.el.querySelector('#tpin').focus(), 60);
}

let idleT = null, tick = null;
export async function viewTablet(app) {
  if (!tabletOn()) { location.replace('#/weighin'); return; }
  const C = cfg();
  keepAwake(true);
  document.body.classList.add('tablet-mode');
  let athletes = [], recs = [], q = '';
  const reload = async () => {
    const [ath, w] = await Promise.all([store.list('athletes').catch(() => athletes), store.list('weighins', ['date', '==', today()]).catch(() => recs)]);
    athletes = ath.filter(a => a.active !== false && (!C.site || !a.site || a.site === C.site)).sort((a, b) => (a.first || '').localeCompare(b.first || '') || (a.last || '').localeCompare(b.last || ''));
    recs = w;
  };
  const recOf = (id) => recs.find(r => r.athleteId === id);
  const lastWeight = async (id) => {
    try { const all = await store.list('weighins', ['athleteId', '==', id]); return all.filter(r => r.date < today() && typeof r.weight === 'number').sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? null; } catch { return null; }
  };
  const save = async (id, patch) => {
    const docId = `${today()}_${id}`;
    const cur = recOf(id) || { athleteId: id, date: today() };
    const next = { ...cur, ...patch, athleteId: id, date: today() };
    ['id', 'updatedAt', 'by', 'absent', 'checkedIn'].forEach(k => delete next[k]);
    Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);
    await store.put('weighins', docId, next);
    const k = recs.findIndex(r => r.athleteId === id); const rec = { ...next, id: docId };
    if (k >= 0) recs[k] = rec; else recs.push(rec);
  };
  const idle = (ms = 45000) => { clearTimeout(idleT); idleT = setTimeout(() => home(), ms); };

  app.innerHTML = `<div class="tab"><header class="tab-h">
      <span class="tab-mark">BJ</span><div><div class="tab-team">${esc(TEAM_NAME)}${C.siteName ? ' · ' + esc(C.siteName) : ''}</div><div class="tab-date">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
      <div class="tab-count" id="tc"></div>
      <button class="tab-lock" id="tlock" aria-label="Coach unlock">🔒</button></header>
    <div id="tbody" class="tab-body"></div></div>`;
  $('#tlock').onclick = unlock;

  // ---- 1. Name grid
  function home() {
    clearTimeout(idleT); q = ''; $('#tbody').oninput = null;
    const waiting = athletes.filter(a => !isHere(recOf(a.id))), done = athletes.filter(a => isHere(recOf(a.id)));
    $('#tc').innerHTML = `<b>${done.length}</b> checked in`;
    $('#tbody').innerHTML = `<h1 class="tab-hi">Tap your name</h1>
      <input class="tab-search" id="tq" placeholder="🔍 Find your name" autocomplete="off">
      <div class="tab-grid" id="tg"></div>
      <button class="tab-new" data-new>＋ I'm new to the team</button>
      ${done.length ? `<div class="tab-donet">✓ Checked in today <span>(tap your name to fix your weight)</span></div><div class="tab-done">${done.map(a => `<button data-a="${a.id}">${esc(a.first)} ${esc(a.last[0] || '')}.</button>`).join('')}</div>` : ''}
      <div class="tab-motto">${MOTTO.map(esc).join(' • ')}</div>`;
    const paint = () => { const L = waiting.filter(a => !q || `${a.first} ${a.last}`.toLowerCase().includes(q.toLowerCase()));
      $('#tg').innerHTML = L.map(a => `<button class="tab-name" data-a="${a.id}"><b>${esc(a.first)}</b><span>${esc(a.last)}</span></button>`).join('')
        || `<div class="tab-empty">${waiting.length ? 'No name matches. Are you new? Tap “I\'m new”.' : athletes.length ? 'Everyone is checked in! 🎉' : 'No names yet. Tap “I\'m new”.'}</div>`; };
    paint();
    $('#tq').oninput = (e) => { q = e.target.value; paint(); idle(); };
    $('#tbody').onclick = (e) => {
      const b = e.target.closest('[data-a],[data-new]'); if (!b) return;
      if (b.dataset.new !== undefined) return newGirl();
      const a = athletes.find(x => x.id === b.dataset.a); if (a) weight(a);
    };
  }

  // ---- 2. Weight keypad
  async function weight(a, fresh = false) {
    idle();
    let val = '';
    const prev = fresh ? null : lastWeight(a.id);
    $('#tbody').innerHTML = `<div class="tab-step">
      <h1 class="tab-hi">Hi ${esc(a.first)}!</h1><div class="tab-sub">Step on the scale, then type your weight.</div>
      <div class="tab-wt" id="tw"><span class="ph">0</span><small>lbs</small></div>
      <div class="tab-warn hidden" id="twarn"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
      <div class="tab-actions"><button class="tab-btn ghost" data-back>← Not me</button><button class="tab-btn go" data-next disabled>Next ✓</button></div></div>`;
    const show = () => { $('#tw').innerHTML = `${val ? esc(val) : '<span class="ph">0</span>'}<small>lbs</small>`; const n = parseFloat(val); $('[data-next]').disabled = !(n >= 40 && n <= 400); $('#twarn').classList.add('hidden'); };
    let warned = false;
    $('#tbody').onclick = async (e) => {
      idle();
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k) { if (k === '⌫') val = val.slice(0, -1); else if (k === '.') { if (!val.includes('.') && val) val += '.'; } else if (val.replace('.', '').length < 4 && !(val.includes('.') && val.split('.')[1].length >= 1)) val += k; warned = false; return show(); }
      if (e.target.closest('[data-back]')) return home();
      const nb = e.target.closest('[data-next]'); if (!nb || nb.disabled) return;
      const n = Math.round(parseFloat(val) * 10) / 10;
      const p = await prev;
      if (!warned && p && Math.abs(n - p) > 8) { warned = true; const wn = $('#twarn'); wn.textContent = 'That\'s a big change from last time. Check the scale and your number. Tap Next again if it\'s right.'; wn.classList.remove('hidden'); return; }
      nb.disabled = true;
      try { await save(a.id, { weight: n, here: undefined }); } catch (err) { nb.disabled = false; return toast('Couldn\'t save. Tell your coach. (' + (err.code || err.message) + ')', 'error'); }
      feel(a);
    };
  }

  // ---- 3. Feel + word (optional)
  function feel(a) {
    idle(30000);
    const r = recOf(a.id) || {}; let f = r.feel || 0, word = r.goal?.word || '';
    $('#tbody').innerHTML = `<div class="tab-step">
      <h1 class="tab-hi">You're in, ${esc(a.first)}! ✓</h1><div class="tab-sub">Optional: how do you feel today?</div>
      <div class="tab-faces">${FACES.map((x, i) => `<button data-f="${i + 1}" class="${f === i + 1 ? 'on' : ''}">${x}</button>`).join('')}</div>
      <div class="tab-sub" style="margin-top:22px">Your word for today</div>
      <div class="tab-words">${WORDS.map(w => `<button data-w="${w}" class="${word === w ? 'on' : ''}">${w}</button>`).join('')}</div>
      <input class="tab-goal" id="tgoal" placeholder="My goal today (optional)" value="${esc(r.goal?.what || '')}" maxlength="140" autocomplete="off">
      <div class="tab-actions"><button class="tab-btn ghost" data-skip>Skip</button><button class="tab-btn go" data-done>Done ✓</button></div></div>`;
    $('#tgoal').oninput = () => idle(60000);
    $('#tbody').onclick = async (e) => {
      idle(30000);
      const fb = e.target.closest('[data-f]'); if (fb) { f = +fb.dataset.f; $$t('[data-f]').forEach(x => x.classList.toggle('on', x === fb)); return; }
      const wb = e.target.closest('[data-w]'); if (wb) { word = word === wb.dataset.w ? '' : wb.dataset.w; $$t('[data-w]').forEach(x => x.classList.toggle('on', x.dataset.w === word)); return; }
      if (e.target.closest('[data-skip]')) return thanks(a);
      if (e.target.closest('[data-done]')) {
        const what = $('#tgoal').value.trim();
        const patch = {}; if (f) patch.feel = f;
        if (word || what) patch.goal = { ...(r.goal || {}), word, what, date: today() };
        if (Object.keys(patch).length) await save(a.id, patch).catch(() => {});
        thanks(a);
      }
    };
  }
  const $$t = (s) => [...document.querySelectorAll('#tbody ' + s)];

  // ---- 4. Thanks → back to names
  function thanks(a) {
    clearTimeout(idleT);
    $('#tbody').innerHTML = `<div class="tab-step tab-thanks"><div class="big">✓</div><h1 class="tab-hi">See you on the mat, ${esc(a.first)}!</h1><div class="tab-sub">Next girl, tap anywhere.</div></div>`;
    $('#tbody').onclick = () => home();
    idleT = setTimeout(home, 2500);
  }

  // ---- New girl
  function newGirl() {
    idle(90000);
    let grade = '';
    $('#tbody').innerHTML = `<div class="tab-step"><h1 class="tab-hi">Welcome to the team!</h1><div class="tab-sub">Type your name the way you want it in the newspaper.</div>
      <div class="tab-nm"><input class="tab-goal" id="nf" placeholder="First name" autocapitalize="words" autocomplete="off"><input class="tab-goal" id="nl" placeholder="Last name" autocapitalize="words" autocomplete="off"></div>
      <div class="tab-sub" style="margin-top:18px">Grade</div>
      <div class="tab-words">${GRADES.map(g => `<button data-g="${g}">${g}</button>`).join('')}</div>
      <div class="tab-actions"><button class="tab-btn ghost" data-back>← Back</button><button class="tab-btn go" data-next>Next ✓</button></div></div>`;
    setTimeout(() => $('#nf').focus(), 60);
    $('#tbody').oninput = () => idle(90000);
    $('#tbody').onclick = async (e) => {
      idle(90000);
      const gb = e.target.closest('[data-g]'); if (gb) { grade = gb.dataset.g; $$t('[data-g]').forEach(x => x.classList.toggle('on', x === gb)); return; }
      if (e.target.closest('[data-back]')) { $('#tbody').oninput = null; return home(); }
      if (!e.target.closest('[data-next]')) return;
      const cap = (x) => x.trim().replace(/\s+/g, ' ').replace(/(^|[\s'-])([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
      const first = cap($('#nf').value), last = cap($('#nl').value);
      if (!first || !last) return toast('Type your first and last name', 'error');
      $('#tbody').oninput = null;
      let a = athletes.find(x => x.first.toLowerCase() === first.toLowerCase() && x.last.toLowerCase() === last.toLowerCase());
      try {
        if (!a) { const id = await store.put('athletes', null, { first, last, grade, nick: '', level: '', site: C.site || '', active: true, addedBy: 'tablet' }); a = { id, first, last, grade, site: C.site || '', active: true }; athletes.push(a); }
      } catch (err) { return toast('Couldn\'t add you. Tell your coach. (' + (err.code || err.message) + ')', 'error'); }
      weight(a, true);
    };
  }

  // ---- Coach unlock
  function unlock() {
    clearTimeout(idleT);
    let pin = '', tries = 0;
    $('#tbody').innerHTML = `<div class="tab-step"><h1 class="tab-hi">Coach PIN</h1><div class="tab-sub">Enter your 4-digit PIN to leave check-in mode.</div>
      <div class="tab-wt tab-pin" id="tp"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button data-k="${k}">${k}</button>` : '<span></span>').join('')}</div>
      <div class="tab-actions"><button class="tab-btn ghost" data-back>← Back to check-in</button><button class="tab-btn ghost" data-forgot>Forgot PIN?</button></div></div>`;
    const show = () => { $('#tp').textContent = '●'.repeat(pin.length) + '○'.repeat(4 - pin.length); };
    show(); idle(30000);
    $('#tbody').onclick = async (e) => {
      idle(30000);
      if (e.target.closest('[data-back]')) return home();
      if (e.target.closest('[data-forgot]')) {
        $('#tbody').querySelector('.tab-sub').innerHTML = 'Forgot it? <button class="tab-btn danger" data-out style="margin-left:8px">Sign this tablet out</button> You\'ll need a coach password to sign back in.';
        return;
      }
      if (e.target.closest('[data-out]')) { localStorage.removeItem(KEY); document.body.classList.remove('tablet-mode'); try { await store.signOut?.(); } catch {} location.hash = '#/'; location.reload(); return; }
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      show();
      if (pin.length === 4) {
        if (await hash(pin) === C.pin) { localStorage.removeItem(KEY); document.body.classList.remove('tablet-mode'); clearInterval(tick); keepAwake(false); location.hash = '#/weighin'; }
        else { tries++; pin = ''; const el = $('#tp'); el.classList.add('shake'); setTimeout(() => { el.classList.remove('shake'); show(); }, 400); if (tries >= 3) $('#tbody').querySelector('.tab-sub').textContent = 'Wrong PIN. Ask your coach.'; }
      }
    };
  }

  $('#tbody').innerHTML = '<div class="tab-empty">Loading…</div>';
  await reload();
  home();
  // Pick up check-ins the coach makes from a phone, and roster changes.
  clearInterval(tick);
  tick = setInterval(async () => { if (!document.body.classList.contains('tablet-mode')) return clearInterval(tick); const onHome = !!document.querySelector('#tg'); await reload(); if (onHome && !q) home(); }, 20000);
}
