import { esc, $, $$, toast, modal, confirmBox, timeAgo, download, getSettings } from './ui.js';
import { store, can, canEditPractice, ROLES, ROLE_LABEL, isFirebase } from './store.js';
import { TEMPLATES, CATEGORIES, LEVELS, catColor, PHRASES } from './seed.js';
import { practiceDuration, blockDuration, fmtDur, fmt, clockTimeLabel, setNowFn } from './engine.js';
import { renderBuilder, flushSave, drillForm, readDrillForm } from './builder.js';
import { renderLive, teardownLive, settingsModal } from './live.js';
import { readOnlyPractice, printPractice } from './print.js';
import { openShare } from './share.js';
import { runChecks } from './check.js';
import { TEAM_NAME, PROGRAM_NAME, MOTTO, OWNER_EMAIL } from './config.js';

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
    room: viewRoom, library: viewLibrary, history: id ? viewRunDetail : viewHistory, admin: viewAdmin, check: viewCheck,
  };
  (views[name] || viewHome)(id);
}

function shell(active, inner) {
  const tabs = [['', 'Home', '⌂'], ['practices', 'Practices', '▤'], ['library', 'Library', '☰'], ['history', 'History', '◷']];
  if (can(user, 'admin')) tabs.push(['admin', 'Admin', '⚙']);
  if (user.role === 'athlete') tabs.splice(2, 2);
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
  return liveRuns.map(r => `<div class="livebar"><span class="live-pill">LIVE</span><b>${esc(r.practiceTitle)}</b><span class="muted small">${esc(r.controllerName || r.coachName || '')} · started ${timeAgo(r.startedAt)}</span>
    <span class="grow"></span>${can(user, 'run') ? `<a class="btn sm gold" href="#/live/${r.id}">${r.controllerUid === user.uid ? 'Open remote' : 'Join'}</a>` : `<a class="btn sm" href="#/live/${r.id}">Follow</a>`}<a class="btn sm" href="#/room/${r.id}">📺 Display</a></div>`).join('');
}

function userMenu() {
  modal({ title: user.name || user.email, body: `<div class="stack">
    <div class="muted small">${esc(user.email)} · ${ROLE_LABEL[user.role]}</div>
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
    <div class="small muted">Accounts are limited to <b>@mapsedu.org</b> emails and approved program staff. School Google accounts can use the Google button.</div>
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
    if (!store.isAllowedEmail(em)) return toast('That email isn\'t approved. Use your @mapsedu.org address or ask Coach Stutting to add you.', 'error');
    try { await store.signUp(em, $('#sp').value, $('#sn').value.trim()); $('.overlay')?.remove(); toast('Check your email for the confirmation link', 'success'); }
    catch (err) { toast(authMsg(err), 'error'); }
  };
}

function viewPending() {
  if (user.role === 'denied') {
    app.innerHTML = `<div class="login"><div class="card pad-lg stack"><div class="tiny">${esc(TEAM_NAME)}</div><h1>Not on the list</h1>
      <p><b>${esc(user.email)}</b> isn't approved for this program. Accounts are limited to @mapsedu.org emails and approved program staff.</p>
      <p class="small muted">If you're on staff, ask an admin coach to send you an invite, then sign in again.</p>
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
  const t = today();
  const todays = ps.filter(p => p.date === t && !p.canceled);
  const upcoming = ps.filter(p => p.date > t && !p.canceled).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const recent = ps.slice(0, 6);
  const coach = can(user, 'edit');
  $('main').innerHTML = `
    <div class="hero">
      <div><div class="tiny">${esc(TEAM_NAME)}</div><h1>${esc(PROGRAM_NAME)}</h1>
      <div class="motto" style="justify-content:flex-start">${MOTTO.map(esc).join('<span>•</span>')}</div></div>
      <div class="muted">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="section-title">Today</div>
    ${todays.length ? `<div class="grid c2">${todays.map(p => todayCard(p)).join('')}</div>`
      : `<div class="empty">${coach ? 'No practice set for today yet. Start one below or set a date on an existing practice.' : 'No practice posted for today yet.'}</div>`}
    ${coach ? `<div class="section-title">Start a new practice</div>
      <div class="grid c4">${TEMPLATES.map(tp => `<a class="tpl" href="#/new/${tp.key}" style="border-color:${tp.accent}33;text-decoration:none;color:inherit"><div class="n" style="color:${tp.accent}">${esc(tp.name)}</div><div class="b">${esc(tp.blurb)}</div></a>`).join('')}</div>` : ''}
    ${upcoming.length ? `<div class="section-title">Coming up</div><div class="grid c2">${upcoming.map(practiceCard).join('')}</div>` : ''}
    <div class="section-title">Recently edited</div>
    ${recent.length ? `<div class="grid c2">${recent.map(practiceCard).join('')}</div>` : `<div class="empty">No practices yet.</div>`}
    <div class="section-title">Room display</div>
    <div class="card row wrap between"><div><b>Put the room TV on ${esc(location.host || 'this site')}/#/room</b><div class="small muted">Sign in once on the TV's browser with a view-only account. It shows the motto and clock, then switches on its own when a coach starts practice.</div></div><a class="btn" href="#/room">📺 Open room display</a></div>`;
  bindCards();
}

function todayCard(p) {
  const total = practiceDuration(p);
  const live = liveRuns.find(r => r.practiceId === p.id);
  return `<div class="card pcard" data-open="${p.id}" style="border-color:rgba(34,197,94,.4)">
    <div class="row between"><span class="tiny">${p.startTime ? clockTimeLabel(p.startTime, 0) + ' – ' + clockTimeLabel(p.startTime, total) : 'Today'}</span>${live ? '<span class="live-pill" style="color:#f87171;font-size:12px;font-weight:800">LIVE</span>' : ''}</div>
    <h3 style="font-size:24px">${esc(p.title)}</h3>
    <div class="catbar">${catbar(p)}</div>
    <div class="row wrap"><span class="muted small">${Math.round(total / 60)} min · ${p.blocks.length} blocks</span><span class="grow"></span>
      ${live ? `<a class="btn gold lg" href="#/live/${live.id}" data-stop>Open live</a>` : can(user, 'run') ? `<a class="btn go lg" href="#/run/${p.id}" data-stop>▶ Run</a>` : ''}</div></div>`;
}

function catbar(p) {
  const total = practiceDuration(p) || 1;
  return (p.blocks || []).map(b => `<i style="width:${(blockDuration(b) / total * 100).toFixed(2)}%;background:${catColor(b.category)}"></i>`).join('');
}
function statusOf(p) {
  if (p.canceled) return ['Canceled', 'red'];
  if (liveRuns.some(r => r.practiceId === p.id)) return ['Live', 'red'];
  if (p.lastRunStatus === 'completed' && p.date && p.date <= today()) return ['Completed', 'green'];
  if (p.date) return p.date >= today() ? ['Scheduled', 'blue'] : ['Past', ''];
  return ['Draft', ''];
}
function practiceCard(p) {
  const total = practiceDuration(p);
  const [st, sc] = statusOf(p);
  return `<div class="card pcard" data-open="${p.id}">
    <div class="row between"><span class="tiny">${p.date ? new Date(p.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}</span><span class="badge ${sc}">${st}</span></div>
    <h3>${esc(p.title)}</h3>
    <div class="catbar">${catbar(p)}</div>
    <div class="row wrap" style="gap:6px"><span class="muted small">${Math.round(total / 60)} min · ${(p.blocks || []).length} blocks${p.ownerName ? ' · ' + esc(p.ownerName) : ''}</span>
      ${(p.levels || []).map(l => `<span class="badge">${esc(l)}</span>`).join('')}${p.visibility === 'public' ? '<span class="badge gold">Public</span>' : p.visibility === 'athletes' ? '<span class="badge blue">Athletes</span>' : ''}</div>
    <div class="row wrap" style="gap:6px">
      ${can(user, 'run') && (p.blocks || []).length ? `<a class="btn sm go" href="#/run/${p.id}" data-stop>▶ Run</a>` : ''}
      ${canEditPractice(user, p) ? `<a class="btn sm" href="#/edit/${p.id}" data-stop>✎ Edit</a>` : `<a class="btn sm" href="#/p/${p.id}" data-stop>View</a>`}
      ${can(user, 'edit') ? `<button class="btn sm" data-dup="${p.id}">Duplicate</button>` : ''}
      <span class="grow"></span><span class="small muted">${timeAgo(p.updatedAt)}</span></div></div>`;
}
function bindCards() {
  $$('[data-open]').forEach(c => c.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop],[data-dup],a,button')) return;
    const id = c.dataset.open; location.hash = canEditPractice(user, { id, ...(cache[id] || {}) }) ? `#/edit/${id}` : `#/p/${id}`;
  }));
  $$('[data-dup]').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); await duplicate(b.dataset.dup); }));
}
const cache = {};
async function duplicate(id, overrides = {}) {
  const p = await store.getPractice(id);
  const c = JSON.parse(JSON.stringify(p)); delete c.id; delete c.createdAt; delete c.lastRunStatus; delete c.canceled;
  Object.assign(c, { title: p.title + ' (copy)', ownerUid: null, ownerName: null, date: '', visibility: 'team', coEdit: false }, overrides);
  await store.savePractice(c); toast('Duplicated. Set the date and go.', 'success'); location.hash = `#/edit/${c.id}`;
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
      && (f.tab === 'all' ? !p.canceled : f.tab === 'mine' ? p.ownerUid === user.uid : f.tab === 'scheduled' ? p.date >= t && !p.canceled : f.tab === 'drafts' ? !p.date && !p.canceled : f.tab === 'canceled' ? p.canceled : true))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
    $('#plist').innerHTML = list.length ? list.map(practiceCard).join('') : `<div class="empty" style="grid-column:1/-1">No practices match.</div>`;
    bindCards();
  };
  $('main').innerHTML = `<div class="page-head"><h1>Practices</h1>
      <div class="row wrap">${can(user, 'edit') ? `<label class="btn">Import file<input type="file" id="imp" accept=".json" hidden></label><a class="btn primary" href="#/new/blank">＋ New practice</a>` : ''}</div></div>
    <div class="row wrap" style="gap:10px;margin-bottom:14px">
      <input class="input" id="q" placeholder="Search practices or drills…" value="${esc(pFilter.q)}" style="max-width:340px">
      <div class="seg">${[['all', 'All'], ['scheduled', 'Scheduled'], ['drafts', 'Drafts'], ['mine', 'Mine'], ['canceled', 'Canceled']].map(([k, l]) => `<button data-tab="${k}" class="${pFilter.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <select class="input" id="lv" style="width:auto"><option value="">All levels</option>${LEVELS.map(l => `<option ${pFilter.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="grid c2" id="plist"></div>`;
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
      <div class="grid c3">${items.map(d => `<button class="drill" data-d="${d.id}"><span class="cat" style="background:${c.color}"></span><span class="t" style="padding-right:16px">${esc(d.title)}</span>
        <span class="d muted">${fmtDur(d.durationSec)} · ${esc(d.description || c.id)}</span>
        ${(d.cues || []).length ? `<span class="d" style="color:#93c5fd">${d.cues.map(esc).join(' · ')}</span>` : ''}
        ${(d.levels || []).length ? `<span class="d muted">${d.levels.map(esc).join(', ')}</span>` : ''}</button>`).join('')}</div>` : ''; }).join('') || '<div class="empty">No drills match.</div>';
    $$('[data-d]').forEach(b => b.onclick = () => openDrill(drills.find(d => d.id === b.dataset.d)));
  };
  const openDrill = (d) => {
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
      <tr><th>Date</th><th>Practice</th><th>Coach</th><th>Status</th><th>Planned → actual</th><th>Wrestlers</th><th></th></tr>
      ${runs.map(r => `<tr class="click" data-r="${r.id}"><td>${new Date(r.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}<div class="small muted">${new Date(r.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></td>
        <td><b>${esc(r.practiceTitle)}</b>${r.notes ? `<div class="small muted">${esc(r.notes.slice(0, 80))}</div>` : ''}</td><td>${esc(r.coachName || '')}</td>
        <td>${runBadge(r)}</td><td class="small">${fmt(r.plannedSec || 0)} → ${r.actualSec ? fmt(r.actualSec) : '—'}</td><td>${r.attendance ?? '—'}</td><td>${r.rating ? '★'.repeat(r.rating) : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No practices run yet. Runs show up here after you press Start.</td></tr>'}
    </table></div>`;
  $$('[data-r]').forEach(tr => tr.onclick = () => location.hash = `#/history/${tr.dataset.r}`);
  $('#csv').onclick = () => {
    const rows = [['date', 'practice', 'coach', 'status', 'planned_min', 'actual_min', 'paused_min', 'wrestlers', 'rating', 'notes']].concat(runs.map(r => [new Date(r.startedAt).toISOString(), r.practiceTitle, r.coachName, r.status, Math.round((r.plannedSec || 0) / 60), Math.round((r.actualSec || 0) / 60), Math.round((r.pausedSec || 0) / 60), r.attendance ?? '', r.rating ?? '', r.notes || '']));
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
      <div class="tiny">${new Date(r.startedAt).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${esc(r.coachName || '')}</div>
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
  const [users, invites] = await Promise.all([store.listUsers().catch(() => []), store.listInvites().catch(() => [])]);
  const assignable = ROLES.filter(r => r !== 'owner');
  $('main').innerHTML = `<div class="page-head"><h1>Admin</h1></div>
    ${!isFirebase ? '<div class="card" style="border-color:#a16207">Local Demo mode: user management needs Firebase.</div>' : ''}
    <div class="section-title">Coaches & accounts</div>
    <div class="card" style="padding:0;overflow-x:auto"><table class="list"><tr><th>Name</th><th>Email</th><th>Role</th><th>Last seen</th></tr>
      ${users.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)).map(u => `<tr><td>${esc(u.name || '')}</td><td>${esc(u.email)}</td>
        <td>${u.role === 'owner' ? '<span class="badge gold">Owner</span>' : `<select class="input" data-uid="${u.uid}" style="width:auto;padding:6px 10px">${assignable.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`}</td>
        <td class="small muted">${u.lastSeen?.toMillis ? timeAgo(u.lastSeen.toMillis()) : ''}</td></tr>`).join('')}</table></div>
    <div class="small muted" style="margin-top:6px">Admin Coach: everything, including this page. Coach: build, run, share. Viewer: read-only. Athlete: sees practices shared with athletes and the live screen. Pending: no access.</div>
    <div class="section-title">Invite by email</div>
    <div class="card"><form class="row wrap" id="inv" style="gap:8px"><input class="input" type="email" id="ie" placeholder="coach@school.org" required style="max-width:320px">
      <select class="input" id="ir" style="width:auto">${['coach', 'admin', 'viewer', 'athlete'].map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select><button class="btn primary">Add invite</button></form>
      <div class="small muted" style="margin-top:8px">They sign in with Google (or an email account you create in Firebase) and get this role on their first sign-in.</div>
      ${invites.length ? `<table class="list" style="margin-top:10px">${invites.map(i => `<tr><td>${esc(i.id)}</td><td>${ROLE_LABEL[i.role]}</td><td style="text-align:right"><button class="btn sm ghost" data-delinv="${esc(i.id)}">Remove</button></td></tr>`).join('')}</table>` : ''}</div>
    <div class="section-title">Setup</div>
    <div class="grid c2">
      <div class="card stack"><b>Test accounts</b><div class="small muted">Creates or repairs coach@test.com (Admin Coach), test@test.com (Viewer), and student@test.com (Athlete), and sets their roles.</div><button class="btn" id="seedU">Create test accounts</button><pre id="seedOut" class="small muted" style="white-space:pre-wrap;margin:0"></pre></div>
      <div class="card stack"><b>Drill library</b><div class="small muted">Loads last season's full drill list into the shared library. Drills already there are skipped.</div><button class="btn" id="seedD">Load drill library</button></div>
      <div class="card stack"><b>Check permissions</b><div class="small muted">Runs real read and write checks against Firebase as you. Sign in as each test account and run it to confirm each role.</div><a class="btn" href="#/check">Run access check</a></div>
    </div>`;
  $$('[data-uid]').forEach(s => s.onchange = async () => { try { await store.setUser(s.dataset.uid, { role: s.value }); toast('Role updated', 'success'); } catch (e) { toast(e.code || e.message, 'error'); } });
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
