import { esc, $, $$, toast, modal, confirmBox, timeAgo, download, getSettings } from './ui.js';
import { store, can, canEditPractice, ROLES, ROLE_LABEL, isFirebase } from './store.js';
import { TEMPLATES, CATEGORIES, LEVELS, catColor, PHRASES } from './seed.js';
import { practiceDuration, blockDuration, fmtDur, fmt, clockTimeLabel, setNowFn } from './engine.js';
import { renderBuilder, flushSave, drillForm, readDrillForm } from './builder.js';
import { renderLive, teardownLive, settingsModal, runStatus } from './live.js';
import { readOnlyPractice, printPractice } from './print.js';
import { openShare } from './share.js';
import { runChecks } from './check.js';
import { openDictate } from './dictate.js';
import { TEAM_NAME, PROGRAM_NAME, MOTTO, OWNER_EMAIL } from './config.js';

const PRESET_VERSION = '2';
const app = $('#app');
let user = null, liveRuns = [], unLive = null, booted = false;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---- Boot ------------------------------------------------------------
store.init(async (u) => {
  user = u;
  if (u && isFirebase && can(u, 'member')) {
    const off = await store.measureOffset();
    if (Math.abs(off) > 250) setNowFn(() => Date.now() + off);
  }
  unLive && unLive(); unLive = null;
  if (u && can(u, 'member')) unLive = store.watchLiveRuns((runs) => { liveRuns = runs; const b = $('#livebar'); if (b) b.innerHTML = liveBar(); });
  // Keep the shared library up to date with new built-in drills (once per version, per device).
  if (u && isFirebase && can(u, 'library') && localStorage.getItem('practice-presets') !== PRESET_VERSION) {
    store.seedDrills().then(() => localStorage.setItem('practice-presets', PRESET_VERSION)).catch(() => {});
  }
  booted = true; route();
}).catch(e => { app.innerHTML = `<div class="login"><div class="card"><h2>Couldn't load</h2><p class="muted">${esc(e.message)}</p><p class="small muted">Check your internet connection and reload.</p></div></div>`; });

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { flushSave(); });

// ---- Router ----------------------------------------------------------
async function route() {
  if (!booted) { app.innerHTML = `<div class="login"><div class="muted">Loading…</div></div>`; return; }
  await flushSave();
  teardownLive();
  const [_, name = '', id = ''] = (location.hash || '#/').slice(1).split('/');
  // Public share pages work signed out
  if (name === 'share') return viewShare(id);
  if (!user) return viewLogin();
  if (!can(user, 'member')) return viewPending();
  const views = {
    '': viewHome, practices: viewPractices, p: viewPractice, edit: viewEdit, new: viewNew, run: viewRun, live: viewLiveRun,
    room: viewRoom, now: viewNow, library: viewLibrary, history: id ? viewRunDetail : viewHistory, admin: viewAdmin, check: viewCheck,
  };
  (views[name] || viewHome)(id);
}

function shell(active, inner) {
  const tabs = [['', 'Home', '⌂'], ['practices', 'Practices', '▤'], ['now', 'Live', '●'], ['library', 'Library', '☰'], ['history', 'History', '◷']];
  if (can(user, 'admin')) tabs.push(['admin', 'Admin', '⚙']);
  if (user.role === 'athlete') { tabs.splice(3, 2); }
  app.innerHTML = `
    ${!isFirebase ? `<div class="demo-banner">Local Demo mode: data stays in this browser only. ${user.role !== 'owner' ? '' : ''}Preview as:
      <select id="demorole" style="background:transparent;border:1px solid #a16207;border-radius:8px;padding:2px 6px">${ROLES.filter(r => r !== 'pending').map(r => `<option value="${r}" ${user.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>` : ''}
    <header class="topbar"><div class="topbar-inner">
      <a class="brand" href="#/"><span class="mark">BJ</span><span class="txt">${esc(PROGRAM_NAME)}<small>${esc(TEAM_NAME)}</small></span></a>
      <nav class="nav">${tabs.map(([h, l]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="userchip">
        <a class="btn sm" href="#/room" title="Open on the TV in the wrestling room">📺 Room display</a>
        <button class="btn sm ghost" id="usermenu" title="${esc(user.email)}">${esc(user.name || user.email)} <span class="badge ${user.role === 'owner' || user.role === 'admin' ? 'gold' : ''}">${ROLE_LABEL[user.role]}</span></button>
      </div></div></header>
    <div id="livebar">${liveBar()}</div>
    <main class="page">${inner}</main>
    <nav class="tabbar">${tabs.map(([h, l, ic]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}"><span class="ic">${ic}</span>${l}</a>`).join('')}</nav>`;
  $('#usermenu').onclick = userMenu;
  const dr = $('#demorole'); if (dr) dr.onchange = () => store.setDemoRole(dr.value);
}

function liveBar() {
  if (!liveRuns.length) return '';
  if (liveRuns.length > 1) return `<div class="livebar"><span class="live-pill">LIVE</span><b>${liveRuns.length} practices running</b><span class="muted small">${liveRuns.map(r => esc(r.siteName || 'No building')).join(' · ')}</span><span class="grow"></span><a class="btn sm gold" href="#/now">See all live</a></div>`;
  return liveRuns.map(r => `<div class="livebar"><span class="live-pill">LIVE</span>${r.siteName ? `<span class="badge blue">${esc(r.siteName)}</span>` : ''}<b>${esc(r.practiceTitle)}</b><span class="muted small">${esc(r.controllerName || r.coachName || '')} · started ${timeAgo(r.startedAt)}</span>
    <span class="grow"></span>${can(user, 'run') ? `<a class="btn sm gold" href="#/live/${r.id}">${r.controllerUid === user.uid ? 'Open remote' : 'Join'}</a>` : `<a class="btn sm" href="#/live/${r.id}">Follow</a>`}<a class="btn sm" href="#/room/${r.id}">📺 Display</a></div>`).join('');
}

function userMenu() {
  modal({ title: user.name || user.email, body: `<div class="stack">
    <div class="muted small">${esc(user.email)} · ${ROLE_LABEL[user.role]}</div>
    <label class="field" id="mysite-wrap"><span class="tiny">My building</span><select class="input" id="mysite"><option value="">Loading…</option></select></label>
    <button class="btn lg" style="width:100%" data-act="sound">🔊 Sound & voice settings (this device)</button>
    <a class="btn lg" style="width:100%" href="#/check">✓ Check my access</a>
    ${isFirebase ? '<button class="btn lg danger" style="width:100%" data-act="out">Sign out</button>' : ''}
    <div class="motto small" style="margin-top:12px">${MOTTO.map(esc).join('<span>•</span>')}</div></div>`,
    onAction: async (a, el, w, close) => {
      if (a === 'out') { close(); await store.signOut(); location.hash = '#/'; }
      if (a === 'sound') { close(); settingsModal(); }
      if (el.tagName === 'A') close();
    } });
  $$('.overlay a').forEach(a => a.addEventListener('click', () => $('.overlay')?.remove()));
  store.listSites().then(sites => {
    const sel = $('#mysite'); if (!sel) return;
    if (!sites.length) { $('#mysite-wrap').innerHTML = `<div class="small muted">${can(user, 'admin') ? 'Add your buildings under Admin → Buildings.' : ''}</div>`; return; }
    sel.innerHTML = `<option value="">Not set</option>` + sites.map(x => `<option value="${x.id}" ${user.prefs?.site === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    sel.onchange = () => store.setMyPrefs({ site: sel.value }).then(() => toast('Saved', 'success')).catch(e => toast(e.code || e.message, 'error'));
  }).catch(() => {});
}

// ---- Auth views --------------------------------------------------------
function viewLogin() {
  app.innerHTML = `<div class="login"><div class="card pad-lg stack">
    <div class="tiny">${esc(TEAM_NAME)}</div>
    <h1>${esc(PROGRAM_NAME)}</h1>
    <div class="motto small" style="justify-content:flex-start">${MOTTO.map(esc).join('<span>•</span>')}</div>
    <button class="btn lg" style="width:100%;background:#fff;color:#111" id="g">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Sign in with Google</button>
    <div class="divider">or with email</div>
    <form id="ef" class="stack">
      <input class="input" type="email" id="em" placeholder="Email" autocomplete="username" required>
      <input class="input" type="password" id="pw" placeholder="Password" autocomplete="current-password" required>
      <button class="btn primary lg" style="width:100%" type="submit">Sign in</button>
    </form>
    <div class="row between"><button class="btn ghost sm" id="forgot">Forgot password?</button><button class="btn ghost sm" id="su">Create an account</button></div>
    <div class="small muted">Accounts are limited to <b>@mapsedu.org</b> emails, approved program staff, and people an admin coach has invited.</div>
  </div></div>`;
  $('#g').onclick = () => store.signInGoogle().catch(e => toast(authMsg(e), 'error'));
  $('#ef').onsubmit = (e) => { e.preventDefault(); store.signInEmail($('#em').value, $('#pw').value).catch(err => toast(authMsg(err), 'error')); };
  $('#su').onclick = signUpModal;
  $('#forgot').onclick = () => { const em = $('#em').value; if (!em) return toast('Type your email first', 'error'); store.resetPassword(em).then(() => toast('Reset email sent', 'success')).catch(e => toast(authMsg(e), 'error')); };
}
const authMsg = (e) => ({ 'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'No account with that email.',
  'auth/popup-closed-by-user': 'Sign-in window closed.', 'auth/unauthorized-domain': 'This website isn\'t authorized in Firebase yet (Authentication → Settings → Authorized domains).',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.', 'auth/email-already-in-use': 'That email already has an account. Sign in instead, or use Forgot password.', 'auth/weak-password': 'Use at least 8 characters.' }[e.code] || e.message);

function signUpModal() {
  modal({ title: 'Create an account', body: `<form class="stack" id="suf">
      <input class="input" id="sn" placeholder="Your name" required>
      <input class="input" type="email" id="se" placeholder="Email (@mapsedu.org or approved staff)" required>
      <input class="input" type="password" id="sp" placeholder="Password (8+ characters)" minlength="8" required>
      <div class="small muted">We'll email you a link to confirm the address before you can get in.</div>
      <button class="btn primary lg" style="width:100%">Create account</button></form>`,
    onAction: () => {} });
  $('#suf').onsubmit = async (e) => {
    e.preventDefault();
    const em = $('#se').value.trim();
    // Invited people may use any email. The invite list can't be read before
    // sign-in, so the security rules make the final call after the email is verified.
    if (!store.isAllowedEmail(em) && !(await confirmBox('Were you invited?', 'This email isn\'t @mapsedu.org or on the staff list. It will only work if an admin coach has invited this exact address.', 'I was invited, continue', false))) return;
    try { await store.signUp(em, $('#sp').value, $('#sn').value.trim()); $('.overlay')?.remove(); toast('Check your email for the confirmation link', 'success'); }
    catch (err) { toast(authMsg(err), 'error'); }
  };
}

function viewPending() {
  if (user.role === 'denied') {
    app.innerHTML = `<div class="login"><div class="card pad-lg stack"><div class="tiny">${esc(TEAM_NAME)}</div><h1>Not on the list</h1>
      <p><b>${esc(user.email)}</b> isn't approved for this program. Accounts are limited to @mapsedu.org emails and approved program staff.</p>
      <p class="small muted">Ask an admin coach to add <b>${esc(user.email)}</b> under Admin → Invite by email, then sign out and back in.</p>
      <button class="btn danger" id="out">Sign out</button></div></div>`;
    $('#out').onclick = () => store.signOut(); return;
  }
  if (user.role === 'unverified') {
    app.innerHTML = `<div class="login"><div class="card pad-lg stack"><div class="tiny">${esc(TEAM_NAME)}</div><h1>Confirm your email</h1>
      <p>We sent a link to <b>${esc(user.email)}</b>. Click it, then come back and tap <b>I've confirmed</b>.</p>
      <button class="btn primary lg" id="re">I've confirmed</button><button class="btn" id="rs">Resend email</button><button class="btn danger" id="out">Sign out</button></div></div>`;
    $('#re').onclick = async () => { try { user = await store.reloadUser(); route(); } catch (e) { toast(e.code || e.message, 'error'); } };
    $('#rs').onclick = () => store.resendVerification().then(() => toast('Sent', 'success')).catch(e => toast(authMsg(e), 'error'));
    $('#out').onclick = () => store.signOut(); return;
  }
  app.innerHTML = `<div class="login"><div class="card pad-lg stack">
    <div class="tiny">${esc(TEAM_NAME)}</div><h1>Almost there</h1>
    <p>You're signed in as <b>${esc(user.email)}</b>, but an admin coach still needs to approve your account.</p>
    ${user.error ? `<p class="small" style="color:#fca5a5">${esc(user.error)}</p>` : ''}
    ${user.email === OWNER_EMAIL ? '<p class="small" style="color:#fde68a">You\'re the owner. Sign out and use <b>Sign in with Google</b> so your email is verified.</p>' : ''}
    <button class="btn" id="re">Check again</button><button class="btn danger" id="out">Sign out</button></div></div>`;
  $('#re').onclick = () => location.reload();
  $('#out').onclick = () => store.signOut();
}

// ---- Home ------------------------------------------------------------
async function viewHome() {
  shell('', `<div class="muted">Loading…</div>`);
  const ps = await store.listPractices().catch(e => { toast(e.message, 'error'); return []; });
  ps.forEach(p => { cache[p.id] = p; });
  const t = today();
  const active = ps.filter(p => !p.canceled);
  const todays = active.filter(p => p.date === t);
  const saved = active.filter(p => p.date !== t).slice(0, 8);
  const coach = can(user, 'edit');
  $('main').innerHTML = `
    <div class="hero">
      <div><div class="tiny">${esc(TEAM_NAME)}</div><h1>${esc(PROGRAM_NAME)}</h1>
      <div class="motto" style="justify-content:flex-start">${MOTTO.map(esc).join('<span>•</span>')}</div></div>
      <div class="muted">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
    ${coach ? `<div class="big3">
      <button class="b3 run" data-act="pickrun"><b>▶</b>Run a saved practice</button>
      <a class="b3 new" href="#/new/blank"><b>＋</b>Build a new one</a>
      <button class="b3 dict" data-dictate><b>🎤</b>Say it, AI builds it</button>
    </div>` : ''}
    ${todays.length ? `<div class="section-title">Today</div><div class="plist">${todays.map(prow).join('')}</div>` : ''}
    <div class="section-title">${coach ? 'Saved practices' : 'Practices'}</div>
    ${saved.length ? `<div class="plist">${saved.map(prow).join('')}</div>${active.length > saved.length + todays.length ? '<a class="btn" href="#/practices" style="margin-top:10px">See all practices →</a>' : ''}`
      : `<div class="empty">${coach ? 'No saved practices yet. Build one or start from a template below.' : 'Nothing posted yet.'}</div>`}
    ${coach ? `<div class="section-title">Start from a template</div>
      <div class="grid c4">${TEMPLATES.map(tp => `<a class="tpl" href="#/new/${tp.key}" style="border-color:${tp.accent}33;text-decoration:none;color:inherit"><div class="n" style="color:${tp.accent}">${esc(tp.name)}</div><div class="b">${esc(tp.blurb)}</div></a>`).join('')}</div>` : ''}
    <div class="section-title">Room TV</div>
    <div class="card row wrap between"><div><b>Open the room display on the TV</b><div class="small muted">Sign in once on the TV with a view-only account. It shows the motto and clock, then switches on by itself when practice starts.</div></div><a class="btn" href="#/room">📺 Room display</a></div>`;
  bindRows();
  const pr = $('[data-act=pickrun]'); if (pr) pr.onclick = () => pickToRun(active);
}

const pDate = (p) => p.date ? new Date(p.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';
function prow(p) {
  const total = practiceDuration(p);
  const live = liveRuns.find(r => r.practiceId === p.id);
  const meta = [`${Math.round(total / 60)} min`, `${(p.blocks || []).length} blocks`, pDate(p), p.canceled ? 'canceled' : '', (p.levels || []).join(', ')].filter(Boolean).join(' · ');
  return `<div class="prow" data-open="${p.id}">
    <div class="grow" style="min-width:0">
      <div class="pr-t">${esc(p.title)}${live ? ' <span class="badge red">LIVE</span>' : ''}</div>
      <div class="catbar" style="margin:6px 0">${catbar(p)}</div>
      <div class="pr-s">${esc(meta)}</div>
    </div>
    ${live ? `<a class="btn gold lg" href="#/live/${live.id}" data-stop>Open</a>` : can(user, 'run') && (p.blocks || []).length ? `<a class="btn go lg pr-run" href="#/run/${p.id}" data-stop aria-label="Run ${esc(p.title)}">▶</a>` : ''}
  </div>`;
}
function catbar(p) {
  const total = practiceDuration(p) || 1;
  return (p.blocks || []).map(b => `<i style="width:${(blockDuration(b) / total * 100).toFixed(2)}%;background:${catColor(b.category)}"></i>`).join('');
}
function bindRows() {
  bindDictate();
  $$('[data-open]').forEach(c => c.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; practiceMenu(cache[c.dataset.open]); }));
}
function bindDictate() {
  $$('[data-dictate]').forEach(b => b.onclick = () => openDictate(user, (p, run) => { location.hash = run ? `#/run/${p.id}` : `#/edit/${p.id}`; }));
}

// One simple menu for every practice
function practiceMenu(p) {
  if (!p) return;
  const edit = canEditPractice(user, p);
  const total = practiceDuration(p);
  modal({ title: p.title, body: `<div class="muted small" style="margin-bottom:12px">${Math.round(total / 60)} min · ${(p.blocks || []).length} blocks${p.ownerName ? ' · by ' + esc(p.ownerName) : ''}${p.date ? ' · ' + pDate(p) : ''}</div>
    <div class="stack">
      ${can(user, 'run') && (p.blocks || []).length ? '<button class="btn go xl" style="width:100%" data-act="run">▶ Run it now</button>' : ''}
      ${can(user, 'edit') ? '<button class="btn lg" style="width:100%" data-act="again">⧉ Use again: make a copy for today</button>' : ''}
      ${edit ? '<button class="btn lg" style="width:100%" data-act="edit">✎ Edit</button>' : '<button class="btn lg" style="width:100%" data-act="view">👁 View</button>'}
      <button class="btn lg" style="width:100%" data-act="print">🖨 Print</button>
    </div>`,
    onAction: async (a, el, w, close) => {
      close();
      if (a === 'run') location.hash = `#/run/${p.id}`;
      if (a === 'again') duplicate(p.id, { title: p.title, date: today() });
      if (a === 'edit') location.hash = `#/edit/${p.id}`;
      if (a === 'view') location.hash = `#/p/${p.id}`;
      if (a === 'print') printPractice(p);
    } });
}

function pickToRun(list) {
  let q = '';
  const rows = () => list.filter(p => (p.blocks || []).length && (!q || (p.title + ' ' + (p.blocks || []).map(b => b.title).join(' ')).toLowerCase().includes(q.toLowerCase())))
    .map(p => `<button class="dr" data-act="go" data-id="${p.id}"><span class="grow"><span class="dr-t">${esc(p.title)}</span><span class="dr-s">${Math.round(practiceDuration(p) / 60)} min · ${(p.blocks || []).length} blocks${p.date ? ' · last set ' + pDate(p) : ''}</span></span><span class="dr-plus" style="background:var(--green);color:#052e12">▶</span></button>`).join('') || '<div class="empty">No saved practices yet.</div>';
  const m = modal({ title: 'Run a saved practice', wide: true, body: `<input class="input" id="rq" placeholder="🔍 Search…"><div class="drs" id="rl">${rows()}</div>`,
    onAction: (a, el, w, close) => { if (a === 'go') { close(); location.hash = `#/run/${el.dataset.id}`; } } });
  m.el.querySelector('#rq').oninput = (e) => { q = e.target.value; m.el.querySelector('#rl').innerHTML = rows(); };
}

const cache = {};
async function duplicate(id, overrides = {}) {
  const p = await store.getPractice(id);
  const c = JSON.parse(JSON.stringify(p)); delete c.id; delete c.createdAt; delete c.canceled;
  Object.assign(c, { title: p.title + ' (copy)', ownerUid: null, ownerName: null, date: '', visibility: 'team', coEdit: false }, overrides);
  await store.savePractice(c); toast(overrides.date ? 'Copied for today' : 'Duplicated', 'success'); location.hash = `#/edit/${c.id}`;
}

// ---- Practices -------------------------------------------------------
let pFilter = { q: '', tab: 'all', level: '' };
async function viewPractices() {
  shell('practices', `<div class="muted">Loading…</div>`);
  const ps = await store.listPractices().catch(e => { toast(e.message, 'error'); return []; });
  ps.forEach(p => { cache[p.id] = p; });
  const draw = () => {
    const f = pFilter, q = f.q.toLowerCase(), t = today();
    const list = ps.filter(p => (!q || (p.title + ' ' + (p.notes || '') + ' ' + (p.blocks || []).map(b => b.title).join(' ')).toLowerCase().includes(q))
      && (!f.level || (p.levels || []).includes(f.level))
      && (f.tab === 'all' ? !p.canceled : f.tab === 'mine' ? p.ownerUid === user.uid : f.tab === 'upcoming' ? p.date >= t && !p.canceled : f.tab === 'canceled' ? p.canceled : true));
    $('#plist').innerHTML = list.length ? list.map(prow).join('') : `<div class="empty">No practices match.</div>`;
    bindRows();
  };
  $('main').innerHTML = `<div class="page-head"><h1>Practices</h1>
      <div class="row wrap">${can(user, 'edit') ? `<button class="btn" data-dictate>🎤 Dictate</button><a class="btn primary" href="#/new/blank">＋ New</a>` : ''}</div></div>
    <input class="input" id="q" placeholder="🔍 Search practices or drills…" value="${esc(pFilter.q)}" style="margin-bottom:10px">
    <div class="row wrap" style="gap:8px;margin-bottom:14px">
      <div class="seg">${[['all', 'All'], ['upcoming', 'Upcoming'], ['mine', 'Mine'], ['canceled', 'Canceled']].map(([k, l]) => `<button data-tab="${k}" class="${pFilter.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <select class="input" id="lv" style="width:auto"><option value="">All levels</option>${LEVELS.map(l => `<option ${pFilter.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${can(user, 'edit') ? '<label class="btn sm ghost">Import file<input type="file" id="imp" accept=".json" hidden></label>' : ''}
    </div>
    <div class="plist" id="plist"></div>`;
  $('#q').oninput = (e) => { pFilter.q = e.target.value; draw(); };
  $('#lv').onchange = (e) => { pFilter.level = e.target.value; draw(); };
  $$('[data-tab]').forEach(b => b.onclick = () => { pFilter.tab = b.dataset.tab; $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const imp = $('#imp'); if (imp) imp.onchange = async () => {
    try {
      const data = JSON.parse(await imp.files[0].text()); const p = data.practice || data;
      if (!Array.isArray(p.blocks)) throw new Error('Not a practice file');
      const c = { title: p.title || 'Imported practice', blocks: p.blocks, levels: p.levels || [], notes: p.notes || '', startTime: p.startTime || '', endTime: p.endTime || '', visibility: 'team' };
      await store.savePractice(c); toast('Imported', 'success'); location.hash = `#/edit/${c.id}`;
    } catch (e) { toast('Could not import: ' + e.message, 'error'); }
  };
  draw();
}

// ---- Single practice -------------------------------------------------
async function viewPractice(id) {
  shell('practices', `<div class="muted">Loading…</div>`);
  const p = await store.getPractice(id).catch(() => null);
  if (!p) { $('main').innerHTML = `<div class="empty">That practice isn't available to your account.</div>`; return; }
  const live = liveRuns.find(r => r.practiceId === p.id);
  $('main').innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><a class="btn ghost sm" href="#/practices">← Practices</a>
    <div class="row wrap" style="gap:8px">
      ${live ? `<a class="btn gold" href="#/live/${live.id}">Follow live</a>` : ''}
      <button class="btn sm" id="pr">Print</button>
      ${can(user, 'edit') ? `<button class="btn sm" id="dp">Duplicate</button>` : ''}
      ${canEditPractice(user, p) ? `<a class="btn sm" href="#/edit/${p.id}">✎ Edit</a>` : ''}
      ${can(user, 'run') ? `<a class="btn go" href="#/run/${p.id}">▶ Run</a>` : ''}</div></div>${readOnlyPractice(p)}`;
  $('#pr').onclick = () => printPractice(p);
  const dp = $('#dp'); if (dp) dp.onclick = () => duplicate(p.id);
}

async function viewShare(id) {
  app.innerHTML = `<main class="page"><div class="muted">Loading…</div></main>`;
  const p = await store.getPublicPractice(id).catch(() => null);
  if (!p) { app.innerHTML = `<main class="page"><div class="empty">This practice isn't shared publicly${user ? '' : '. If you\'re a coach on this team, <a href="#/">sign in</a>'}.</div></main>`; return; }
  app.innerHTML = `<main class="page"><div class="row between wrap" style="margin-bottom:12px"><div class="tiny">${esc(TEAM_NAME)} · ${esc(PROGRAM_NAME)}</div>
    <div class="row" style="gap:8px"><button class="btn sm" id="pr">Print</button>${user && can(user, 'edit') ? '<button class="btn primary sm" id="cp">Copy into our practices</button>' : user ? '' : '<a class="btn sm" href="#/">Coach sign in</a>'}</div></div>
    ${readOnlyPractice(p)}<p class="small muted" style="text-align:center;margin-top:24px">${esc(PHRASES.printFooter)}</p></main>`;
  $('#pr').onclick = () => printPractice(p);
  const cp = $('#cp'); if (cp) cp.onclick = () => duplicate(p.id, { title: p.title });
}

async function viewEdit(id) {
  shell('practices', `<div class="muted">Loading…</div>`);
  const p = await store.getPractice(id).catch(() => null);
  if (!p) { $('main').innerHTML = `<div class="empty">Practice not found.</div>`; return; }
  if (!canEditPractice(user, p)) { location.replace(`#/p/${id}`); return; }
  renderBuilder($('main'), p, user);
}

async function viewNew(key) {
  if (!can(user, 'edit')) { location.hash = '#/'; return; }
  shell('practices', '');
  const tp = TEMPLATES.find(t => t.key === key) || TEMPLATES[0];
  const p = { ...tp.build(), date: today(), startTime: '15:30', endTime: '17:00', levels: [], visibility: 'team', notes: '' };
  renderBuilder($('main'), p, user, { isNew: true });
}

async function viewRun(id) {
  if (!can(user, 'run')) { location.hash = `#/p/${id}`; return; }
  const live = liveRuns.find(r => r.practiceId === id);
  if (live) { location.replace(`#/live/${live.id}`); return; }
  const p = await store.getPractice(id).catch(() => null);
  if (!p) { shell('', `<div class="empty">Practice not found.</div>`); return; }
  if (!(p.blocks || []).length) { toast('Add some drills first', 'error'); location.hash = `#/edit/${id}`; return; }
  app.innerHTML = '';
  renderLive(app, user, { mode: 'start', practice: p });
}
function viewLiveRun(id) { app.innerHTML = ''; renderLive(app, user, { mode: 'remote', runId: id }); }
function viewRoom(id) { app.innerHTML = ''; renderLive(app, user, { mode: 'room', runId: id || null }); }

// ---- Live now: every building at once ----------------------------------------
let nowTimer = null;
function viewNow() {
  shell('now', `<div class="page-head"><h1>Live now</h1><span class="muted small">Every building, updating live</span></div><div class="grid c2" id="board"></div>`);
  const paint = () => {
    const el = $('#board'); if (!el) { clearInterval(nowTimer); return; }
    if (!liveRuns.length) { el.innerHTML = `<div class="empty" style="grid-column:1/-1">No practices running right now.</div>`; return; }
    el.innerHTML = liveRuns.slice().sort((a, b) => (a.siteName || '').localeCompare(b.siteName || '')).map(r => {
      const st = runStatus(r);
      const seg = st.seg;
      return `<div class="card nowcard" style="border-left:8px solid ${seg ? catColor(seg.category) : '#334155'}">
        <div class="row between"><span class="badge blue">${esc(r.siteName || 'No building set')}</span><span class="small muted">${esc(r.controllerName || r.coachName || '')}</span></div>
        <div class="nc-p">${esc(r.practiceTitle)}</div>
        <div class="row between" style="align-items:flex-end;margin-top:6px">
          <div style="min-width:0"><div class="tiny">${seg ? (seg.kind === 'rest' ? 'Rest' : seg.kind === 'leadin' ? 'Getting ready' : esc(seg.category || '')) : 'Done'}</div>
            <div class="nc-s">${seg ? esc(seg.kind === 'leadin' ? 'Get ready' : seg.title) : 'Finished'}</div>
            ${seg?.sub ? `<div class="small muted">${esc(seg.sub)}</div>` : ''}</div>
          <div class="nc-t ${st.running ? '' : 'paused'}">${seg ? (st.remaining < 0 ? '+' + fmt(-st.remaining) : fmt(st.remaining)) : ''}</div></div>
        <div class="catbar" style="margin:10px 0 8px">${Array.from({ length: st.count }, (_, i) => `<i style="width:${100 / st.count}%;background:${i < st.index ? '#3b82f6' : i === st.index ? '#facc15' : '#1e293b'}"></i>`).join('')}</div>
        <div class="row wrap" style="gap:6px"><span class="small muted grow">${st.running ? '' : '⏸ Paused · '}${st.next ? 'Next: ' + esc(st.next.title) : ''}</span>
          ${can(user, 'run') ? `<a class="btn sm" href="#/live/${r.id}">${r.controllerUid === user.uid ? 'Remote' : 'Join'}</a>` : `<a class="btn sm" href="#/live/${r.id}">Follow</a>`}<a class="btn sm" href="#/room/${r.id}">📺</a></div></div>`;
    }).join('');
  };
  paint(); clearInterval(nowTimer); nowTimer = setInterval(paint, 1000);
}

// ---- Library ---------------------------------------------------------
let libQ = '', libCat = '';
async function viewLibrary() {
  shell('library', `<div class="muted">Loading…</div>`);
  let drills = await store.listDrills().catch(e => { toast(e.message, 'error'); return []; });
  const canEditDrill = (d) => can(user, 'admin') || (can(user, 'library') && d.createdBy === user.uid);
  const draw = () => {
    const q = libQ.toLowerCase();
    const list = drills.filter(d => (!libCat || d.category === libCat) && (!q || (d.title + ' ' + (d.description || '') + ' ' + (d.cues || []).join(' ')).toLowerCase().includes(q)));
    $('#dl').innerHTML = CATEGORIES.map(c => { const items = list.filter(d => d.category === c.id).sort((a, b) => a.title.localeCompare(b.title)); return items.length ? `
      <div class="section-title" style="border-color:${c.color};color:${c.color}">${c.id} Drills · ${items.length}</div>
      <div class="grid c3">${items.map(d => `<button class="drill" data-d="${d.id}"><span class="cat" style="background:${c.color}"></span><span class="t" style="padding-right:16px">${d.type === 'series' ? '⟳ ' : ''}${esc(d.title)}</span>
        <span class="d muted">${fmtDur(d.durationSec)} · ${d.type === 'series' ? d.moves.length + ' motions, each called out' : esc(d.description || c.id)}</span>
        ${(d.cues || []).length ? `<span class="d" style="color:#93c5fd">${d.cues.map(esc).join(' · ')}</span>` : ''}
        ${(d.levels || []).length ? `<span class="d muted">${d.levels.map(esc).join(', ')}</span>` : ''}</button>`).join('')}</div>` : ''; }).join('') || '<div class="empty">No drills match.</div>';
    $$('[data-d]').forEach(b => b.onclick = () => openDrill(drills.find(d => d.id === b.dataset.d)));
  };
  const openDrill = (d) => {
    if (d?.type === 'series') {
      return modal({ title: d.title, body: `<div class="stack"><div class="small muted">Routine · ${d.moves.length} motions · ${fmtDur(d.durationSec)} total. Each motion is called and timed on its own.</div>
        ${d.moves.map((mv, i) => `<div class="row between" style="border-bottom:1px solid var(--line);padding:8px 0"><span><b>${i + 1}.</b> ${esc(mv.title)}</span><span class="muted">${fmtDur(mv.sec)}</span></div>`).join('')}
        <div class="small muted">To change it: add it to a practice, tap it, edit the motions, then tap "Save this routine to the library".</div></div>`,
        footer: canEditDrill(d) ? '<button class="btn danger" data-act="del">Delete</button>' : '',
        onAction: async (a, el, w, close) => { if (a === 'del' && await confirmBox('Delete routine?', `Remove "${d.title}" from the library?`, 'Delete')) { await store.deleteDrill(d.id); drills = drills.filter(x => x.id !== d.id); close(); draw(); } } });
    }
    const editable = d ? canEditDrill(d) : can(user, 'library');
    modal({ title: d ? (editable ? 'Edit move' : d.title) : 'New move', body: editable ? drillForm(d || {}) : `<div class="stack"><div class="badge">${esc(d.category)}</div><p>${esc(d.description || '')}</p>${(d.cues || []).map(c => `<span class="badge blue">${esc(c)}</span>`).join(' ')}${d.videoUrl ? `<p><a href="${esc(d.videoUrl)}" target="_blank" rel="noopener">▶ Technique video</a></p>` : ''}<p class="small muted">Default ${fmtDur(d.durationSec)}</p></div>`,
      footer: editable ? `${d ? '<button class="btn danger" data-act="del">Delete</button>' : ''}<span class="grow"></span><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save">Save</button>` : '',
      onAction: async (a, el, w, close) => {
        if (a === 'dlevel') { el.classList.toggle('on'); return; }
        if (a === 'del') { if (await confirmBox('Delete move?', `Remove "${d.title}" from the library? Practices that already use it keep their copy.`, 'Delete')) { await store.deleteDrill(d.id); drills = drills.filter(x => x.id !== d.id); close(); draw(); } }
        if (a === 'save') { const nd = readDrillForm(w, d ? { ...d } : {}); if (!nd) return;
          try { const saved = await store.saveDrill(nd); drills = drills.filter(x => x.id !== saved.id).concat(saved); close(); draw(); toast('Saved', 'success'); } catch (e) { toast(e.code || e.message, 'error'); } }
      } });
  };
  $('main').innerHTML = `<div class="page-head"><div><h1>Drill Library</h1><div class="muted small">${drills.length} moves shared by every coach. Last season's full list is included.</div></div>
    ${can(user, 'library') ? '<button class="btn primary" id="nd">＋ New custom move</button>' : ''}</div>
    <div class="row wrap" style="gap:8px;margin-bottom:6px"><input class="input" id="lq" placeholder="Search moves, descriptions, cues…" value="${esc(libQ)}" style="max-width:360px">
      ${['', ...CATEGORIES.filter(c => c.id !== 'Rest').map(c => c.id)].map(c => `<button class="chip ${libCat === c ? 'on' : ''}" data-c="${c}">${c ? `<span class="dot" style="background:${catColor(c)}"></span>` : ''}${c || 'All'}</button>`).join('')}</div>
    <div id="dl"></div>`;
  $('#lq').oninput = (e) => { libQ = e.target.value; draw(); };
  $$('[data-c]').forEach(b => b.onclick = () => { libCat = b.dataset.c; $$('[data-c]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const nd = $('#nd'); if (nd) nd.onclick = () => openDrill(null);
  draw();
}

// ---- History ---------------------------------------------------------
async function viewHistory() {
  if (user.role === 'athlete') { location.hash = '#/'; return; }
  shell('history', `<div class="muted">Loading…</div>`);
  let runs = (await store.listRuns().catch(e => { toast(e.message, 'error'); return []; })).filter(r => !r.test);
  const done = runs.filter(r => r.status === 'completed' || r.status === 'ended');
  const weekAgo = Date.now() - 7 * 864e5;
  const catMin = {};
  done.forEach(r => (r.log || []).forEach(l => { if (!l.skipped && l.kind !== 'rest') catMin[l.category || 'Other'] = (catMin[l.category || 'Other'] || 0) + (l.plannedSec + (l.adjustSec || 0) + (l.overtimeSec || 0)) / 60; }));
  const catTotal = Object.values(catMin).reduce((a, b) => a + b, 0) || 1;
  $('main').innerHTML = `<div class="page-head"><h1>History</h1><button class="btn sm" id="csv">Export CSV</button></div>
    <div class="grid c4">
      <div class="card stat"><div class="tiny">Practices run</div><div class="v">${done.length}</div></div>
      <div class="card stat"><div class="tiny">Last 7 days</div><div class="v">${done.filter(r => r.startedAt > weekAgo).length}</div></div>
      <div class="card stat"><div class="tiny">Mat time logged</div><div class="v">${Math.round(done.reduce((s, r) => s + (r.actualSec || 0) - (r.pausedSec || 0), 0) / 3600 * 10) / 10}h</div></div>
      <div class="card stat"><div class="tiny">Avg wrestlers</div><div class="v">${(() => { const a = done.filter(r => r.attendance); return a.length ? Math.round(a.reduce((s, r) => s + r.attendance, 0) / a.length) : '—'; })()}</div></div>
    </div>
    ${done.length ? `<div class="card" style="margin-top:14px"><div class="tiny" style="margin-bottom:8px">Where the time went (completed blocks only)</div>
      <div class="catbar" style="height:14px">${Object.entries(catMin).sort((a, b) => b[1] - a[1]).map(([c, m]) => `<i title="${esc(c)} ${Math.round(m)} min" style="width:${m / catTotal * 100}%;background:${catColor(c)}"></i>`).join('')}</div>
      <div class="row wrap small" style="gap:12px;margin-top:8px">${Object.entries(catMin).sort((a, b) => b[1] - a[1]).map(([c, m]) => `<span><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${catColor(c)}"></span> ${esc(c)} ${Math.round(m)}m</span>`).join('')}</div></div>` : ''}
    <div class="card" style="margin-top:14px;padding:0;overflow-x:auto"><table class="list">
      <tr><th>Date</th><th>Practice</th><th>Building</th><th>Coach</th><th>Status</th><th>Planned → actual</th><th>Wrestlers</th><th></th></tr>
      ${runs.map(r => `<tr class="click" data-r="${r.id}"><td>${new Date(r.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}<div class="small muted">${new Date(r.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></td>
        <td><b>${esc(r.practiceTitle)}</b>${r.notes ? `<div class="small muted">${esc(r.notes.slice(0, 80))}</div>` : ''}</td><td class="small">${esc(r.siteName || '')}</td><td>${esc(r.coachName || '')}</td>
        <td>${runBadge(r)}</td><td class="small">${fmt(r.plannedSec || 0)} → ${r.actualSec ? fmt(r.actualSec) : '—'}</td><td>${r.attendance ?? '—'}</td><td>${r.rating ? '★'.repeat(r.rating) : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No practices run yet. Runs show up here after you press Start.</td></tr>'}
    </table></div>`;
  $$('[data-r]').forEach(tr => tr.onclick = () => location.hash = `#/history/${tr.dataset.r}`);
  $('#csv').onclick = () => {
    const rows = [['date', 'practice', 'building', 'coach', 'status', 'planned_min', 'actual_min', 'paused_min', 'wrestlers', 'rating', 'notes']].concat(runs.map(r => [new Date(r.startedAt).toISOString(), r.practiceTitle, r.siteName || '', r.coachName, r.status, Math.round((r.plannedSec || 0) / 60), Math.round((r.actualSec || 0) / 60), Math.round((r.pausedSec || 0) / 60), r.attendance ?? '', r.rating ?? '', r.notes || '']));
    download(`practice-history-${today()}.csv`, rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
}
const stale = (r) => r.status === 'live' && Date.now() - (r.heartbeat || 0) > 3 * 3600e3;
const runBadge = (r) => stale(r) ? '<span class="badge">Abandoned</span>' : r.status === 'live' ? '<span class="badge red">Live</span>' : r.status === 'completed' ? '<span class="badge green">Completed</span>' : '<span class="badge gold">Ended early</span>';

async function viewRunDetail(id) {
  shell('history', `<div class="muted">Loading…</div>`);
  const r = await store.getRun(id).catch(() => null);
  if (!r) { $('main').innerHTML = `<div class="empty">Not found.</div>`; return; }
  const coach = can(user, 'edit');
  $('main').innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><a class="btn ghost sm" href="#/history">← History</a>
    <div class="row wrap" style="gap:8px">
      ${r.status === 'live' && !stale(r) ? `<a class="btn gold" href="#/live/${r.id}">Open live</a>` : ''}
      ${coach && stale(r) ? '<button class="btn sm" id="close">Close abandoned session</button>' : ''}
      ${coach ? '<button class="btn sm" id="dup">Duplicate as new practice</button>' : ''}
      ${can(user, 'admin') ? '<button class="btn sm danger" id="del">Delete record</button>' : ''}</div></div>
    <div class="card pad-lg">
      <div class="tiny">${new Date(r.startedAt).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${esc(r.coachName || '')}${r.siteName ? ' · ' + esc(r.siteName) : ''}</div>
      <h1 style="font-size:30px;font-weight:900;text-transform:uppercase;font-style:italic;margin-top:6px">${esc(r.practiceTitle)}</h1>
      <div class="row wrap" style="margin-top:10px;gap:8px">${runBadge(r)}<span class="badge">Planned ${fmt(r.plannedSec || 0)}</span>${r.actualSec ? `<span class="badge">Actual ${fmt(r.actualSec)}</span>` : ''}${r.pausedSec ? `<span class="badge">Paused ${fmt(r.pausedSec)}</span>` : ''}${r.endedBy ? `<span class="small muted">closed by ${esc(r.endedBy)}</span>` : ''}</div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(260px,1fr);margin-top:14px;align-items:start">
      <div class="card" style="padding:0;overflow-x:auto"><table class="list"><tr><th>Block</th><th>Planned</th><th>Changes</th><th></th></tr>
        ${(r.log || []).map(l => `<tr style="${l.skipped ? 'opacity:.5' : ''}"><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${catColor(l.category)}"></span> ${esc(l.title)}</td>
          <td class="small">${fmtDur(l.plannedSec)}</td><td class="small">${l.adjustSec ? (l.adjustSec > 0 ? '+' : '') + fmtDur(Math.abs(l.adjustSec)).replace(' min', 'm') + (l.adjustSec < 0 ? ' cut' : '') : ''}${l.overtimeSec ? ` +${l.overtimeSec}s over` : ''}</td>
          <td>${l.skipped ? '<span class="badge">Skipped</span>' : '<span class="badge green">Done</span>'}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${r.status === 'live' ? 'Still running.' : 'No block log.'}</td></tr>`}
      </table></div>
      <div class="card stack">
        <div class="tiny">Coaching reflection</div>
        ${coach && r.status !== 'live' ? `<label class="field"><span class="tiny">Wrestlers</span><input class="input" id="att" inputmode="numeric" value="${r.attendance ?? ''}"></label>
          <div class="row" style="gap:4px">${[1, 2, 3, 4, 5].map(n => `<button class="chip ${r.rating === n ? 'on' : ''}" data-rt="${n}">${'★'.repeat(n)}</button>`).join('')}</div>
          <textarea class="input" id="nt" rows="5" placeholder="What worked, what to change…">${esc(r.notes || '')}</textarea><button class="btn primary" id="sv">Save reflection</button>
          <div class="small muted">The plan and the block log are locked. Only the reflection can be edited.</div>`
          : `<p>${esc(r.notes || 'No notes.')}</p><div class="small muted">${r.attendance ? r.attendance + ' wrestlers' : ''} ${r.rating ? '★'.repeat(r.rating) : ''}</div>`}
      </div>
    </div>
    <div class="section-title">Plan as it was run</div>${readOnlyPractice({ ...r.practice, levels: r.levels })}`;
  let rating = r.rating || 0;
  $$('[data-rt]').forEach(b => b.onclick = () => { rating = +b.dataset.rt; $$('[data-rt]').forEach(x => x.classList.toggle('on', x === b)); });
  const sv = $('#sv'); if (sv) sv.onclick = async () => { try { await store.updateRun(id, { notes: $('#nt').value.trim(), attendance: parseInt($('#att').value) || null, rating: rating || null }); toast('Saved', 'success'); } catch (e) { toast(e.code || e.message, 'error'); } };
  const dup = $('#dup'); if (dup) dup.onclick = async () => {
    const c = { title: r.practiceTitle, blocks: r.practice.blocks, levels: r.levels || [], notes: r.practice.notes || '', startTime: r.practice.startTime || '', endTime: '', date: '', visibility: 'team' };
    await store.savePractice(c); toast('New practice made from this run', 'success'); location.hash = `#/edit/${c.id}`;
  };
  const cl = $('#close'); if (cl) cl.onclick = async () => { try { await store.runCommand(id, (x) => ({ status: 'ended', endedAt: x.heartbeat || Date.now(), actualSec: Math.round(((x.heartbeat || Date.now()) - x.startedAt) / 1000), endedBy: user.name + ' (abandoned)', log: x.log || [] })); route(); } catch (e) { toast(e.code || e.message, 'error'); } };
  const del = $('#del'); if (del) del.onclick = async () => { if (await confirmBox('Delete record?', 'This permanently removes this practice record from history.', 'Delete')) { await store.deleteRun(id); location.hash = '#/history'; } };
}

// ---- Admin -----------------------------------------------------------
async function viewAdmin() {
  if (!can(user, 'admin')) { location.hash = '#/'; return; }
  shell('admin', `<div class="muted">Loading…</div>`);
  const [users, invites, sites] = await Promise.all([store.listUsers().catch(() => []), store.listInvites().catch(() => []), store.listSites().catch(() => [])]);
  const assignable = ROLES.filter(r => r !== 'owner');
  $('main').innerHTML = `<div class="page-head"><h1>Admin</h1></div>
    ${!isFirebase ? '<div class="card" style="border-color:#a16207">Local Demo mode: user management needs Firebase.</div>' : ''}
    <div class="section-title">Coaches & accounts</div>
    <div class="card" style="padding:0;overflow-x:auto"><table class="list"><tr><th>Name</th><th>Email</th><th>Role</th><th>Last seen</th></tr>
      ${users.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)).map(u => `<tr><td>${esc(u.name || '')}</td><td>${esc(u.email)}</td>
        <td>${u.role === 'owner' ? '<span class="badge gold">Owner</span>' : `<select class="input" data-uid="${u.uid}" style="width:auto;padding:6px 10px">${assignable.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`}</td>
        <td class="small muted">${u.lastSeen?.toMillis ? timeAgo(u.lastSeen.toMillis()) : ''}</td></tr>`).join('')}</table></div>
    <div class="small muted" style="margin-top:6px">Admin Coach: everything, including this page. Coach: build, run, share. Viewer: read-only. Athlete: sees practices shared with athletes and the live screen. Pending: no access.</div>
    <div class="section-title">Buildings</div>
    <div class="card"><div class="small muted" style="margin-bottom:8px">Each live practice is tagged with its building. Each room TV is set to one building and only shows practices there.</div>
      <div class="row wrap" style="gap:6px" id="sites">${sites.map(x => `<span class="chip on">${esc(x.name)} <button class="btn ghost sm" data-delsite="${x.id}" style="padding:0 4px;color:#111">✕</button></span>`).join('') || '<span class="muted small">None yet.</span>'}</div>
      <form class="row wrap" id="sitef" style="gap:8px;margin-top:10px"><input class="input" id="sitename" placeholder="e.g. Merrill High School, Prairie River MS" style="max-width:340px" required><button class="btn primary">Add building</button></form></div>
    <div class="section-title">Invite by email</div>
    <div class="card"><form class="row wrap" id="inv" style="gap:8px"><input class="input" type="email" id="ie" placeholder="coach@school.org" required style="max-width:320px">
      <select class="input" id="ir" style="width:auto">${['coach', 'admin', 'viewer', 'athlete'].map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select><button class="btn primary">Add invite</button></form>
      <div class="small muted" style="margin-top:8px">Works for any email, even outside the list. Tell them to open the site and either <b>Sign in with Google</b> (Gmail) or <b>Create an account</b> with this exact email. They'll get this role as soon as their email is confirmed. Already tried and got "Not on the list"? Just add the invite and have them sign out and back in.</div>
      ${invites.length ? `<table class="list" style="margin-top:10px">${invites.map(i => `<tr><td>${esc(i.id)}</td><td>${ROLE_LABEL[i.role]}</td><td style="text-align:right"><button class="btn sm ghost" data-delinv="${esc(i.id)}">Remove</button></td></tr>`).join('')}</table>` : ''}</div>
    <div class="section-title">Setup</div>
    <div class="grid c2">
      <div class="card stack"><b>Test accounts</b><div class="small muted">Creates or repairs coach@test.com (Admin Coach), test@test.com (Viewer), and student@test.com (Athlete), and sets their roles.</div><button class="btn" id="seedU">Create test accounts</button><pre id="seedOut" class="small muted" style="white-space:pre-wrap;margin:0"></pre></div>
      <div class="card stack"><b>Drill library</b><div class="small muted">Loads last season's full drill list into the shared library. Drills already there are skipped.</div><button class="btn" id="seedD">Load drill library</button></div>
      <div class="card stack"><b>Check permissions</b><div class="small muted">Runs real read and write checks against Firebase as you. Sign in as each test account and run it to confirm each role.</div><a class="btn" href="#/check">Run access check</a></div>
    </div>`;
  $$('[data-uid]').forEach(s => s.onchange = async () => { try { await store.setUser(s.dataset.uid, { role: s.value }); toast('Role updated', 'success'); } catch (e) { toast(e.code || e.message, 'error'); } });
  $('#sitef').onsubmit = async (e) => { e.preventDefault(); try { await store.saveSite($('#sitename').value.trim()); viewAdmin(); } catch (err) { toast(err.code || err.message, 'error'); } };
  $$('[data-delsite]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove building?', 'Past practice records keep the building name.', 'Remove')) { await store.deleteSite(b.dataset.delsite); viewAdmin(); } });
  $('#inv').onsubmit = async (e) => { e.preventDefault(); try { await store.saveInvite($('#ie').value, $('#ir').value); toast('Invite added', 'success'); viewAdmin(); } catch (err) { toast(err.code || err.message, 'error'); } };
  $$('[data-delinv]').forEach(b => b.onclick = async () => { await store.deleteInvite(b.dataset.delinv); viewAdmin(); });
  $('#seedU').onclick = async () => { $('#seedU').disabled = true; $('#seedOut').textContent = 'Working…'; try { $('#seedOut').textContent = (await store.seedTestAccounts()).join('\n'); } catch (e) { $('#seedOut').textContent = e.message; } $('#seedU').disabled = false; };
  $('#seedD').onclick = async () => { try { const n = await store.seedDrills(); toast(`Added ${n} drills`, 'success'); } catch (e) { toast(e.code || e.message, 'error'); } };
}

async function viewCheck() {
  shell('', `<div class="page-head"><h1>Access check</h1></div><div class="card"><p class="muted">Signed in as <b>${esc(user.email)}</b> (${ROLE_LABEL[user.role]}). Each check tries a real read or write against Firebase and compares the result with what your role should allow.</p><button class="btn primary" id="go">Run checks</button><div id="out" style="margin-top:14px"></div></div>`);
  $('#go').onclick = async () => {
    $('#out').innerHTML = '<div class="muted">Running…</div>';
    const res = await runChecks(store, user);
    const pass = res.filter(r => r.ok).length;
    $('#out').innerHTML = `<div class="badge ${pass === res.length ? 'green' : 'red'}" style="margin-bottom:10px">${pass}/${res.length} as expected</div><table class="list">${res.map(r => `<tr><td>${r.ok ? '✅' : '❌'}</td><td>${esc(r.name)}</td><td class="small muted">expected ${r.expect ? 'allowed' : 'blocked'} · got ${r.got ? 'allowed' : 'blocked'}${r.err ? ' (' + esc(r.err) + ')' : ''}</td></tr>`).join('')}</table>`;
  };
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
