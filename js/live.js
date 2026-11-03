// Live practice. A run is one authoritative document in Firestore that holds
// the practice snapshot and the clock. Every device (the coach remote, the
// room TV, other coaches, athletes) subscribes to it and derives the same
// countdown from server-time timestamps. Coach commands are transactions.
// A refresh, a sleeping phone, or a second device can't reset the clock.
import { esc, $, toast, modal, confirmBox, getSettings, setSettings } from './ui.js';
import { catColor, PHRASES } from './seed.js';
import { compile, newClock, segDur, elapsedMs, remainingMs, catchUp, applyCommand, remainingTotalMs, fmt, fmtDur, practiceDuration, NOW } from './engine.js';
import * as audio from './audio.js';
import * as voice from './voice.js';
import { store, can, isFirebase } from './store.js';
import { TEAM_NAME, PROGRAM_NAME, MOTTO } from './config.js';

let S = null;

export function teardownLive() {
  if (!S) return;
  clearInterval(S.tick); clearInterval(S.beat); clearTimeout(S.idleTimer);
  if (S.el) S.el.onclick = null; // the app container is reused by other pages
  document.removeEventListener('keydown', S.onKey);
  document.removeEventListener('visibilitychange', S.onVis);
  S.unwatch && S.unwatch(); S.unwatchLive && S.unwatchLive();
  try { S.rec && S.rec.abort(); } catch (e) {}
  audio.cancelScheduled(); audio.keepAwake(false);
  try { speechSynthesis.cancel(); } catch (e) {}
  S = null;
}

function applySettings() {
  const st = getSettings();
  audio.configure({ volume: st.volume, style: st.style });
  audio.configureVoice({ enabled: st.voice, rate: st.voiceRate, name: st.voiceName });
  return st;
}

function segsFor(practice, leadIn) {
  const segs = compile(practice);
  if (leadIn > 0 && segs.length) segs.unshift({ kind: 'leadin', title: 'Get ready', durationSec: leadIn, category: 'Rest', say: `Get ready. First up: ${segs[0].title}` });
  segs.forEach((s, i) => { s.index = i; });
  return segs;
}

// Where a run is right now, computed from its stored clock (used by the Live board).
export function runStatus(run) {
  const segs = segsFor({ ...run.practice }, run.leadIn || 0);
  const c = JSON.parse(JSON.stringify(run.clock || newClock())); catchUp(segs, c);
  const seg = segs[c.segIndex];
  return { seg, next: segs[c.segIndex + 1], remaining: seg ? remainingMs(segs, c) / 1000 : 0, running: c.running, done: c.done || !seg,
    index: c.segIndex, count: segs.length };
}

const motto = () => `<div class="motto">${MOTTO.map(esc).join('<span>•</span>')}</div>`;

// ----------------------------------------------------------------------
// mode: 'start' (from a practice), 'remote' (control an existing run), 'room' (TV display)
export function renderLive(el, user, { mode, practice = null, runId = null }) {
  teardownLive();
  const st = applySettings();
  S = { el, user, mode, practice, runId, run: null, segs: [], clock: newClock(), fired: {}, lastSeg: -1,
    locked: false, sound: mode !== 'room', st, online: true, finishing: false };
  el.innerHTML = shellHTML();
  bindControls();
  if (mode === 'start') showPrestart();
  else if (mode === 'remote') follow(runId);
  else startRoom(runId);
  S.tick = setInterval(loop, 200);
}

function isController() { return S.mode !== 'room' && can(S.user, 'run') && S.run && S.run.controllerUid === S.user.uid; }

function shellHTML() {
  const room = S.mode === 'room';
  return `<div class="live ${room ? 'room' : ''}" id="live">
    <div class="lt">
      <div class="row" style="gap:12px;min-width:0">
        ${room ? `<div class="brand-room"><div class="t1">${esc(TEAM_NAME)}</div><div class="t2">${esc(PROGRAM_NAME)}</div></div>` : `<span id="l-title" class="ellip">${esc(S.practice?.title || '')}</span>`}
        <span id="l-badge"></span>
      </div>
      <div class="row" style="gap:14px"><span class="sched" id="l-sched"></span><span class="clock" id="l-clock"></span></div>
    </div>
    ${room ? motto() : ''}
    <div class="prog" id="l-prog"></div>
    <div class="stage" id="l-stage"></div>
    <div class="bottom" id="l-bottom">
      <div class="next"><div class="tiny" style="color:#3b82f6">Up next</div><div class="n" id="l-next">—</div></div>
      ${room ? `<div class="right" id="l-roomctl"><button class="btn sm" data-act="sound" id="l-soundbtn">🔇 Click for sound</button><button class="btn sm" data-act="fs">⛶</button></div>` : `
      <div class="ctrls" id="l-ctrls">
        <button class="cb" data-act="prev" title="Back (←)" aria-label="Previous">⏮</button>
        <button class="cb" data-act="minus" title="−30 seconds" aria-label="Minus 30 seconds">−30</button>
        <button class="cb main" data-act="toggle" id="l-main" title="Pause / Go (space)" aria-label="Play or pause">▶</button>
        <button class="cb" data-act="plus" title="+1 minute (+)" aria-label="Add one minute">+1:00</button>
        <button class="cb" data-act="next" title="Next (→)" aria-label="Next">⏭</button>
      </div>
      <div class="right">
        <button class="btn sm" data-act="blocks" title="Jump to a block">☰</button>
        <button class="btn sm lock" data-act="lock" id="l-lock" title="Lock controls (L)">🔓</button>
        <button class="btn sm" data-act="settings" title="Sound & voice">⚙</button>
        <button class="btn sm danger" data-act="end">End</button>
      </div>`}
    </div>
    <div id="l-takeover"></div>
  </div>`;
}

// ---- Start a new run ---------------------------------------------------
async function showPrestart() {
  try { S.sites = await store.listSites(); } catch (e) { S.sites = []; }
  if (!S) return;
  const st = getSettings();
  const total = practiceDuration(S.practice);
  const div = document.createElement('div');
  div.className = 'prestart'; div.id = 'l-pre';
  div.innerHTML = `
    <div class="tiny">Ready to run</div>
    <h1 style="font-size:clamp(28px,5vw,56px);font-weight:900;font-style:italic;text-transform:uppercase">${esc(S.practice.title)}</h1>
    <div class="muted">${Math.round(total / 60)} min · ${S.practice.blocks.length} blocks · ends ~${new Date(Date.now() + (total + st.leadIn) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
    ${S.sites?.length ? `<label class="field" style="min-width:260px"><span class="tiny">Where is this practice?</span><select class="input" id="l-site">${S.sites.map(x => `<option value="${x.id}" ${x.id === (S.user.prefs?.site || '') ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <button class="go" data-act="start">Start</button>
    <div class="small" id="l-voice" style="color:#93c5fd"></div>
    <div class="row wrap" style="justify-content:center;gap:8px;max-width:640px">
      <button class="btn" data-act="soundcheck">🔊 Sound check</button>
      <button class="btn" data-act="settings">⚙ Sound & voice</button>
      <a class="btn" href="#/edit/${S.practice.id}">✎ Edit</a>
      <a class="btn ghost" href="#/practices">Cancel</a>
    </div>
    <div class="small muted" style="max-width:580px;line-height:1.5">
      Turn the phone's volume all the way up. The screen stays on during practice.
      ${st.leadIn ? `You'll get a ${st.leadIn}-second "get ready" countdown after you tap Start.` : ''}
      For the room TV, open <b>Room display</b> on any signed-in device. It picks up this practice automatically.
      Bluetooth page-turner clickers work as a remote: → next, ← back.
    </div>`;
  $('#live').appendChild(div);
  prepareVoice(segsFor(S.practice, st.leadIn));
}

async function startRun() {
  const ok = await audio.unlock(); audio.unlockVoice(); audio.keepAwake(true);
  if (!ok) toast('Sound is blocked on this device. Tap ⚙ and run a sound check.', 'error');
  if (!can(S.user, 'run')) return toast('Your account can view practices but not run them.', 'error');
  const st = getSettings();
  const t = NOW();
  const clock = { ...newClock(), running: true, anchor: t };
  const siteSel = $('#l-site'); const site = siteSel ? siteSel.value : '';
  const siteName = site ? (S.sites.find(x => x.id === site)?.name || '') : '';
  if (site && site !== S.user.prefs?.site) store.setMyPrefs({ site }).catch(() => {});
  const run = {
    practiceId: S.practice.id, practiceTitle: S.practice.title, levels: S.practice.levels || [], date: S.practice.date || new Date().toISOString().slice(0, 10),
    practice: { title: S.practice.title, blocks: S.practice.blocks, startTime: S.practice.startTime || '', notes: S.practice.notes || '' },
    coachUid: S.user.uid, coachName: S.user.name, controllerUid: S.user.uid, controllerName: S.user.name,
    site, siteName, status: 'live', startedAt: t, heartbeat: t, plannedSec: practiceDuration(S.practice), leadIn: st.leadIn, clock, version: 1,
  };
  try {
    S.runId = await store.createRun(run);
  } catch (e) { toast('Could not start: ' + (e.code || e.message), 'error'); return; }
  $('#l-pre')?.remove();
  history.replaceState(null, '', `#/live/${S.runId}`);
  S.mode = 'remote';
  follow(S.runId, { ...run, id: S.runId });
  setupVoiceCommands();
}

// ---- Subscribe to a run -----------------------------------------------
function follow(runId, initial) {
  S.runId = runId;
  if (initial) onRun(initial, {});
  else $('#l-stage').innerHTML = `<div class="muted">Connecting…</div>`;
  S.unwatch = store.watchRun(runId, onRun);
  if (S.mode !== 'room') {
    S.beat = setInterval(() => { if (isController() && S.run?.status === 'live') store.updateRun(runId, { heartbeat: NOW() }).catch(() => {}); }, 60000);
    audio.keepAwake(true);
  }
}

function onRun(run, meta = {}) {
  if (!S) return;
  S.online = !meta.fromCache;
  if (!run) { $('#l-stage').innerHTML = `<div class="empty">This practice session wasn't found.</div>`; return; }
  const first = !S.run;
  if (S.run && (run.version || 0) < (S.run.version || 0) && !meta.pending) return; // stale
  S.run = run;
  if (first || !S.segs.length) {
    S.practice = { ...run.practice, id: run.practiceId };
    S.segs = segsFor(S.practice, run.leadIn || 0);
    prepareVoice(S.segs);
    const tt = $('#l-title'); if (tt) tt.textContent = run.practiceTitle;
    S.lastSeg = -1;
  }
  S.clock = JSON.parse(JSON.stringify(run.clock || newClock()));
  if (run.status !== 'live') { S.clock.done = true; S.clock.running = false; S.clock.segIndex = S.segs.length; }
  paintBadge();
  paintTakeover();
  if (first && S.mode === 'remote' && run.status === 'live' && !audio.isUnlocked()) {
    const d = document.createElement('div'); d.className = 'prestart'; d.id = 'l-pre';
    d.innerHTML = `<div class="tiny">Practice is running</div><h1 style="font-size:clamp(26px,5vw,48px);font-weight:900;font-style:italic;text-transform:uppercase">${esc(run.practiceTitle)}</h1>
      <button class="go" data-act="resume" style="background:var(--blue);color:#fff">Rejoin</button><div class="small muted">The clock kept running. Tap to turn this device's sound back on.</div>`;
    $('#live').appendChild(d);
  }
  loop(true);
}

function paintBadge() {
  const b = $('#l-badge'); if (!b || !S.run) return;
  const live = S.run.status === 'live';
  b.innerHTML = `${live ? `<span class="live-pill" style="color:#f87171">Live</span>` : `<span class="badge">${esc(S.run.status)}</span>`}
    ${S.run.siteName ? `<span class="badge blue">${esc(S.run.siteName)}</span>` : ''}
    ${S.mode !== 'room' ? `<span class="badge ${S.online ? 'green' : 'red'}">${S.online ? '● Synced' : '● Offline — will sync'}</span>` : (S.online ? '' : '<span class="badge red">● Reconnecting</span>')}
    ${S.mode !== 'room' && S.run.controllerName ? `<span class="small" style="color:#64748b">Remote: ${esc(S.run.controllerName)}</span>` : ''}`;
}

function paintTakeover() {
  const t = $('#l-takeover'); if (!t || S.mode === 'room') return;
  const ctl = $('#l-ctrls');
  const mine = isController();
  if (ctl) ctl.style.opacity = mine ? '' : '.3';
  if (ctl) ctl.style.pointerEvents = mine ? '' : 'none';
  if (S.run?.status === 'live' && !mine) {
    t.innerHTML = can(S.user, 'run')
      ? `<div class="takeover"><span>${esc(S.run.controllerName || 'Another coach')} has the remote.</span><button class="btn gold sm" data-act="takeover">Take control</button></div>`
      : `<div class="takeover"><span>Following live (view only)</span></div>`;
  } else t.innerHTML = '';
}

// ---- Room display (TV) -----------------------------------------------
const ROOM_KEY = 'practice-room-site';
async function startRoom(runId) {
  audio.keepAwake(true); // TV/laptop screen stays on; re-requested whenever the tab is visible again
  if (runId) { follow(runId); return; }
  // Each TV belongs to one building, so practices at other schools don't take it over.
  let sites = [];
  try { sites = await store.listSites(); } catch (e) {}
  if (!S) return;
  S.sites = sites;
  const saved = localStorage.getItem(ROOM_KEY);
  if (sites.length && (saved === null || (saved && !sites.some(x => x.id === saved)))) return pickRoom(sites);
  S.roomSite = saved || '';
  idleRoom();
  S.unwatchLive = store.watchLiveRuns((runs) => {
    if (!S) return;
    const mine = runs.filter(r => !S.roomSite || r.site === S.roomSite);
    const latest = mine.sort((a, b) => b.startedAt - a.startedAt)[0];
    if (latest && latest.id !== S.runId) {
      S.unwatch && S.unwatch(); S.run = null; S.segs = []; S.lastSeg = -1; clearTimeout(S.idleTimer);
      follow(latest.id);
    }
  });
}

function pickRoom(sites) {
  $('#l-stage').innerHTML = `<div class="stack" style="max-width:640px;width:100%;text-align:center">
    <div class="idle"><div class="t2">Which room is this TV in?</div></div>
    <div class="small muted">This TV will only show practices running in this building. You only pick once.</div>
    ${sites.map(x => `<button class="btn xl" style="width:100%" data-act="room-pick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}
    <button class="btn lg ghost" data-act="room-pick" data-id="">Show any building</button></div>`;
}

async function idleRoom() {
  S.runId = null; S.run = null; S.segs = []; S.clock = newClock();
  const next = $('#l-next'); if (next) next.textContent = '—';
  $('#l-prog').innerHTML = ''; $('#l-sched').textContent = '';
  let today = '';
  try {
    const d = new Date().toISOString().slice(0, 10);
    const ps = (await store.listPractices()).filter(p => p.date === d);
    if (ps.length) today = `<div class="sub" style="margin-top:20px">Today: ${ps.map(p => `${esc(p.title)}${p.startTime ? ' · ' + esc(new Date(`2000-01-01T${p.startTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''}`).join(' &nbsp;|&nbsp; ')}</div>`;
  } catch (e) {}
  if (!S || S.run) return;
  const roomName = (S.sites || []).find(x => x.id === S.roomSite)?.name;
  const bd = $('#l-badge'); if (bd && (S.sites || []).length) bd.innerHTML = `<button class="btn sm ghost" data-act="room-change" style="color:#64748b">${esc(roomName || 'All buildings')} ▾</button>`;
  $('#l-stage').innerHTML = `<div class="idle"><div class="t1">${esc(TEAM_NAME)}</div><div class="t2">${esc(PROGRAM_NAME)}</div>${roomName ? `<div class="sub" style="margin-top:8px">${esc(roomName)}</div>` : ''}
    <div class="bigclock" id="l-bigclock"></div>${today}
    <div class="small" style="color:#475569;margin-top:24px">This screen switches on its own when a coach starts practice.</div></div>`;
}

// ---- Core loop -------------------------------------------------------
function loop() {
  if (!S) return;
  $('#l-clock') && ($('#l-clock').textContent = new Date(NOW()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
  const bc = $('#l-bigclock'); if (bc) bc.textContent = new Date(NOW()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!S.run || !S.segs.length) return;
  catchUp(S.segs, S.clock); // derive auto-advance locally — no writes needed
  if (S.lastSeg !== S.clock.segIndex) {
    const firstPaint = S.lastSeg === -1;
    S.lastSeg = S.clock.segIndex;
    paintStage(); reschedule();
    if (S.clock.segIndex >= S.segs.length) onDone();
    else if (!firstPaint || (NOW() - (S.run.heartbeat || 0) < 3000)) announce(S.clock.segIndex);
  }
  paintTick();
  cues();
  // last scheduled segment ended locally: make sure the run is closed (idempotent)
  if (S.clock.done && S.run.status === 'live' && can(S.user, 'run') && !S.finishing) finishRun(false);
}

function lineFor(segs, i) {
  const seg = segs[i]; if (!seg) return '';
  let line = seg.say || seg.title;
  if (seg.kind === 'rest') { const nx = segs.slice(i + 1).find(s => s.kind !== 'rest'); if (nx) line = `Rest. ${PHRASES.next(nx.title)}`; }
  if (seg.kind === 'work' && seg.description && getSettings().readDescription && !seg.assignments) line += `. ${seg.description}`;
  return line;
}
function previewFor(segs, i) {
  const seg = segs[i], nx = segs[i + 1]; if (!seg || !nx) return '';
  if (nx.kind === 'work' && !(nx.assignments && nx.blockIndex === seg.blockIndex)) return nx.assignments ? PHRASES.nextRotation : PHRASES.next(nx.title);
  return '';
}
// Every line this practice can say, so the natural voice can be made ahead of time.
function allLines(segs) {
  const out = ['Sound check. Champions are made today.', 'Paused', 'Go', 'Switch!', '30 seconds', 'Time. Coach, tap next when ready.', PHRASES.done];
  segs.forEach((s, i) => { out.push(lineFor(segs, i)); if (!s.seriesStep) out.push(previewFor(segs, i)); });
  return out;
}
function prepareVoice(segs) {
  const el = $('#l-voice');
  voice.prepare(allLines(segs), (done, total, ready) => { const e = $('#l-voice'); if (e) e.textContent = `🎙 Coach voice ${ready}/${total} ready`; })
    .then(r => { const e = $('#l-voice'); if (e && r.total) e.textContent = r.ready === r.total ? '🎙 Coach voice ready' : voice.isDisabled() ? `🎙 Natural voice unavailable, using device voice (${r.ready}/${r.total} ready)` : `🎙 ${r.ready}/${r.total} lines ready, the rest use the device voice`; });
  if (el && getSettings().voiceMode !== 'ai') el.textContent = '';
}

function announce(i) {
  const seg = S.segs[i]; if (!seg || !S.sound) return;
  const line = lineFor(S.segs, i);
  audio.speak(line);
  if ('mediaSession' in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title: seg.title, artist: S.practice.title }); } catch (e) {}
}

function cues() {
  const st = S.st, i = S.clock.segIndex, seg = S.segs[i];
  if (!seg || !S.clock.running || !S.sound) return;
  const rem = remainingMs(S.segs, S.clock) / 1000, dur = segDur(S.segs, S.clock, i), el = elapsedMs(S.clock) / 1000;
  const f = (S.fired[`${S.run.id}:${i}:${S.clock.anchor}`] ||= {});
  if (seg.switchAtHalf && !f.sw && el >= dur / 2 && rem > 2) { f.sw = true; audio.speak('Switch!'); }
  if (st.warn30 && dur >= 90 && !f.w30 && rem <= 30 && rem > 27) { f.w30 = true; audio.speak('30 seconds'); }
  if (st.previewNext && dur >= 40 && !f.nx && rem <= 15 && rem > 11 && seg.kind !== 'leadin' && !seg.seriesStep) {
    f.nx = true; const line = previewFor(S.segs, i); if (line) audio.speak(line);
  }
  if (seg.holdAtEnd && !f.hold && rem <= 0) { f.hold = true; audio.speak('Time. Coach, tap next when ready.'); }
}

// Horn and countdown are scheduled on the audio clock ahead of time, so they
// fire on the exact second even if the page's timers are throttled.
function reschedule() {
  audio.cancelScheduled();
  if (!S || !S.sound || !S.clock.running || S.clock.done || !S.segs.length) return;
  const st = getSettings(); if (!st.sound) return;
  const ev = [];
  let endIn = remainingMs(S.segs, S.clock);
  for (let k = 0, i = S.clock.segIndex; k < 3 && i < S.segs.length; k++, i++) {
    const d = segDur(S.segs, S.clock, i) * 1000;
    const startIn = endIn - d;
    if (S.segs[i].switchAtHalf) ev.push({ inMs: startIn + d / 2, kind: 'switch' });
    if (S.segs[i].seriesStep) ev.push({ inMs: endIn, kind: 'beepHigh' }); // routine: quick beep between motions, voice calls the next one
    else {
      if (st.countdown && d >= 10000) [3, 2, 1].forEach(n => ev.push({ inMs: endIn - n * 1000, kind: n === 1 ? 'beepHigh' : 'beep' }));
      ev.push({ inMs: endIn, kind: 'horn' });
    }
    if (S.segs[i].holdAtEnd) break; // waits for coach; nothing after is predictable
    endIn += segDur(S.segs, S.clock, i + 1) * 1000;
  }
  audio.schedule(ev.filter(e => e.inMs >= -50));
}

// ---- Painting --------------------------------------------------------
function kindLabel(seg) {
  if (seg.kind === 'leadin') return ['Get ready', '#facc15'];
  if (seg.kind === 'rest') return ['Rest', '#22c55e'];
  if (seg.kind === 'transition') return ['Rotate', '#facc15'];
  if (seg.assignments) return [seg.sub || 'Stations', '#eab308'];
  if (seg.rounds) return [seg.sub, catColor(seg.category)];
  return [seg.category || 'Active Move', catColor(seg.category)];
}

function paintStage() {
  const stage = $('#l-stage'); if (!stage) return;
  const i = S.clock.segIndex, seg = S.segs[i];
  paintNext(); paintProgress();
  if (!seg) { stage.innerHTML = `<div style="font-size:clamp(70px,16vw,200px);font-weight:900;font-style:italic;color:var(--gold);line-height:1">FINISH</div><div class="sub">Practice Complete</div>`; return; }
  const [kl, kc] = kindLabel(seg);
  if (seg.assignments) {
    const n = seg.assignments.length, cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    stage.innerHTML = `<div class="kind" style="color:${kc}">${esc(kl)}</div>
      <div class="sub" style="margin-bottom:6px">${esc(seg.title)}</div>
      <div class="groups" style="grid-template-columns:repeat(${cols},1fr)">${seg.assignments.map(a => `<div class="grp" style="border-color:${seg.kind === 'transition' ? '#a16207' : catColor(a.station.category) + '99'}">
        <div class="gl">GROUP ${a.group}${seg.kind === 'transition' ? ' → NEXT' : ''}</div><div class="gs">${esc(a.station.title)}</div>${a.station.description ? `<div class="gd">${esc(a.station.description)}</div>` : ''}</div>`).join('')}</div>
      <div class="timer small" id="l-timer">0:00</div>`;
  } else {
    const calm = seg.kind === 'rest' || seg.kind === 'leadin';
    stage.innerHTML = `<div class="kind" style="color:${kc}">${esc(kl)}</div>
      <div class="now" style="${calm ? 'color:#e2e8f0' : ''}">${esc(seg.kind === 'leadin' ? S.segs[1]?.title || '' : seg.title)}</div>
      ${seg.kind === 'leadin' ? '<div class="sub">First up</div>' : ''}
      ${seg.rounds && seg.kind === 'work' ? '' : seg.sub ? `<div class="sub">${esc(seg.sub)}</div>` : ''}
      ${seg.kind === 'work' && seg.description ? `<div class="desc">${esc(seg.description)}</div>` : ''}
      ${seg.kind === 'work' && seg.cues?.length ? `<div class="cues">${seg.cues.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="timer ${calm ? 'rest' : ''}" id="l-timer">0:00</div>
      ${seg.switchAtHalf ? '<div class="tiny" style="color:#60a5fa">Switch called at halfway</div>' : ''}
      ${seg.holdAtEnd ? '<div class="tiny" style="color:#94a3b8">Coach-paced — waits for Next</div>' : ''}`;
  }
}

function paintNext() {
  const n = $('#l-next'); if (!n) return;
  const i = S.clock.segIndex, nx = S.segs[i + 1];
  n.textContent = i >= S.segs.length ? 'Done' : nx ? (nx.kind === 'rest' ? `Rest ${fmtDur(nx.durationSec)}` : nx.assignments ? `${nx.title} · ${nx.sub}` : nx.sub && nx.rounds ? `${nx.title} · ${nx.sub}` : nx.title) : 'Finish';
}

function paintProgress() {
  const p = $('#l-prog'); if (!p) return;
  const total = S.segs.reduce((s, x, i) => s + segDur(S.segs, S.clock, i), 0) || 1;
  p.innerHTML = S.segs.map((s, i) => `<i class="${i === S.clock.segIndex ? 'cur' : ''}" style="width:${segDur(S.segs, S.clock, i) / total * 100}%;background:${i < S.clock.segIndex ? catColor(s.category) : '#1e293b'}"></i>`).join('');
}

function paintTick() {
  const t = $('#l-timer'), seg = S.segs[S.clock.segIndex];
  const m = $('#l-main');
  if (m) { m.textContent = S.clock.running ? '❚❚' : '▶'; m.classList.toggle('running', S.clock.running); }
  if (S.clock.done || !seg) { $('#l-sched').textContent = ''; return; }
  const rem = remainingMs(S.segs, S.clock) / 1000;
  if (t) {
    t.textContent = rem < 0 ? '+' + fmt(-rem) : fmt(rem);
    t.classList.toggle('warn', rem <= 10 && seg.kind === 'work' && S.clock.running);
    t.classList.toggle('paused', !S.clock.running);
  }
  const end = new Date(NOW() + remainingTotalMs(S.segs, S.clock));
  $('#l-sched').textContent = `${S.clock.running ? '' : 'PAUSED · '}ends ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const cur = $('#l-prog .cur');
  if (cur) { const d = segDur(S.segs, S.clock, S.clock.segIndex); const frac = Math.min(1, elapsedMs(S.clock) / 1000 / d);
    cur.style.background = `linear-gradient(90deg, ${catColor(seg.category)} ${frac * 100}%, #1e293b ${frac * 100}%)`; }
}

// ---- Commands --------------------------------------------------------
async function command(cmd, arg) {
  if (!S?.run || S.run.status !== 'live' || !isController()) return;
  // optimistic local update so the remote responds instantly
  S.clock = applyCommand(S.segs, S.clock, cmd, arg);
  S.lastSeg = S.lastSeg === S.clock.segIndex ? S.lastSeg : -3;
  loop(); reschedule();
  if (cmd === 'pause') audio.speak('Paused'); if (cmd === 'play') audio.speak('Go');
  const by = { uid: S.user.uid, name: S.user.name, cmd, at: NOW() };
  try {
    const leadIn = S.run.leadIn || 0;
    await store.runCommand(S.runId, (r) => {
      const segs = segsFor({ ...r.practice }, r.leadIn || leadIn);
      return { clock: applyCommand(segs, r.clock, cmd, arg), lastCmd: by };
    });
  } catch (e) { toast('Command not saved: ' + (e.code || e.message), 'error'); }
}

function act(a, el) {
  if (!S) return;
  if (a === 'start') return startRun();
  if (a === 'resume') { $('#l-pre')?.remove(); audio.unlock().then(() => { audio.unlockVoice(); audio.keepAwake(true); reschedule(); }); return; }
  if (a === 'soundcheck') { audio.unlock().then(() => { applySettings(); audio.test(); audio.speak('Sound check. Champions are made today.'); }); return; }
  if (a === 'settings') return settingsModal();
  if (a === 'sound') { audio.unlock().then(ok => { audio.unlockVoice(); S.sound = true; audio.keepAwake(true); reschedule(); const b = $('#l-soundbtn'); if (b) b.textContent = ok ? '🔊' : '🔇 Blocked'; }); return; }
  if (a === 'fs') { document.documentElement.requestFullscreen?.().catch(() => {}); return; }
  if (a === 'takeover') return takeover();
  if (a === 'room-pick') { localStorage.setItem(ROOM_KEY, el.dataset.id); const u = S.user, host = S.el; teardownLive(); renderLive(host, u, { mode: 'room' }); return; }
  if (a === 'room-change') { localStorage.removeItem(ROOM_KEY); S.unwatchLive && S.unwatchLive(); S.unwatchLive = null; S.unwatch && S.unwatch(); S.run = null; S.segs = []; pickRoom(S.sites || []); return; }
  if (a === 'blocks') return blocksMenu();
  if (S.mode === 'room') return;
  if (a === 'lock') { S.locked = !S.locked; $('#live').classList.toggle('locked', S.locked); $('#l-lock').textContent = S.locked ? '🔒' : '🔓'; toast(S.locked ? 'Controls locked. Tap 🔒 to unlock.' : 'Unlocked'); return; }
  if (S.locked) return;
  if (a === 'toggle') command(S.clock.running ? 'pause' : 'play');
  else if (a === 'next') { if (S.clock.segIndex >= S.segs.length - 1) return confirmEnd(); command('next'); }
  else if (a === 'prev') command('prev');
  else if (a === 'plus') { command('add', 60); toast('+1:00'); }
  else if (a === 'minus') command('add', -30);
  else if (a === 'end') confirmEnd();
}

async function takeover() {
  if (!can(S.user, 'run')) return;
  try {
    await store.runCommand(S.runId, () => ({ controllerUid: S.user.uid, controllerName: S.user.name }));
    toast('You have the remote', 'success');
  } catch (e) { toast('Could not take control: ' + (e.code || e.message), 'error'); }
}

function blocksMenu() {
  if (!S.segs.length) return;
  const items = S.segs.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'leadin');
  modal({ title: 'Jump to…', body: `<div class="stack">${items.map(({ s, i }) => `<button class="btn" style="width:100%;justify-content:flex-start;${i === S.clock.segIndex ? 'border-color:var(--gold)' : ''}" data-act="j" data-i="${i}" ${isController() ? '' : 'disabled'}>
      <span style="width:10px;height:10px;border-radius:50%;background:${catColor(s.category)}"></span>
      <span class="grow" style="text-align:left;overflow:hidden;text-overflow:ellipsis">${esc(s.title)}${s.sub ? ' · ' + esc(s.sub) : ''}</span><span class="muted small">${fmtDur(s.durationSec)}</span></button>`).join('')}</div>`,
    onAction: (a, el, w, close) => { if (a === 'j') { close(); command('jump', +el.dataset.i); } } });
}

function bindControls() {
  S.el.onclick = (e) => {
    if (!S) return;
    const b = e.target.closest('[data-act]');
    if (b) return act(b.dataset.act, b);
    if (e.target.closest('#l-timer') && S.mode !== 'room') act('toggle');
    if (S.mode === 'room' && !S.sound) act('sound');
  };
  S.onKey = (e) => {
    if (e.target.matches('input, textarea, select') || document.querySelector('.overlay')) return;
    const k = e.key;
    if (S.mode === 'start' && (k === ' ' || k === 'Enter')) { e.preventDefault(); return act('start'); }
    if (k === ' ' || k === 'Enter' || k === 'k') { e.preventDefault(); act('toggle'); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === 'n') { e.preventDefault(); act('next'); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'p') { e.preventDefault(); act('prev'); }
    else if (k === '+' || k === '=') act('plus');
    else if (k === '-') act('minus');
    else if (k === 'l' || k === 'L') act('lock');
  };
  document.addEventListener('keydown', S.onKey);
  S.onVis = () => { if (document.visibilityState === 'visible' && S) { audio.keepAwake(S.mode !== 'start' || S.started); S.lastSeg = S.lastSeg; loop(); reschedule(); } };
  document.addEventListener('visibilitychange', S.onVis);
}

function setupVoiceCommands() {
  const st = getSettings();
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!st.voiceCommands || !R) return;
  const rec = new R(); rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
  rec.onresult = (e) => {
    const t = e.results[e.results.length - 1][0].transcript.toLowerCase();
    if (!/\bcoach\b/.test(t)) return;
    if (/pause|stop|hold/.test(t)) { if (S.clock.running) act('toggle'); }
    else if (/\b(go|start|resume)\b/.test(t)) { if (!S.clock.running) act('toggle'); }
    else if (/next|skip/.test(t)) act('next');
    else if (/back|previous/.test(t)) act('prev');
    else if (/minute|more time/.test(t)) act('plus');
  };
  rec.onend = () => { if (S && S.run?.status === 'live') try { rec.start(); } catch (e) {} };
  try { rec.start(); S.rec = rec; toast('Voice commands on: say "Coach, pause" or "Coach, next"'); } catch (e) {}
}

export function settingsModal(onDone) {
  const st = getSettings();
  const vs = audio.voices();
  const tg = (k, label, sub) => `<div class="toggle ${st[k] ? 'on' : ''}" data-act="t" data-k="${k}"><div><b>${label}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><div class="sw"></div></div>`;
  modal({ title: 'Sound & voice (this device)', body: `<div class="stack">
    ${tg('sound', 'Horn & countdown', 'Horn at every change, 3-2-1 beeps before it')}
    <div><div class="tiny" style="margin-bottom:6px">Horn sound</div><div class="seg" style="display:flex">${[['buzzer', 'Gym buzzer (loudest)'], ['horn', 'Air horn'], ['whistle', 'Whistle']].map(([v, l]) => `<button class="${st.style === v ? 'on' : ''}" data-act="style" data-v="${v}">${l}</button>`).join('')}</div></div>
    <label class="field"><span class="tiny">Volume boost</span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" id="s-vol" style="width:100%"></label>
    ${tg('countdown', '3-2-1 countdown beeps')}
    ${tg('voice', 'Voice announcements', 'Says each drill, "Rest", "Switch!", "Rotate!"')}
    <div><div class="tiny" style="margin-bottom:6px">Voice</div><div class="seg" style="display:flex">${[['ai', '🎙 Natural coach voice'], ['device', 'Device voice']].map(([v, l]) => `<button class="${(st.voiceMode || 'ai') === v ? 'on' : ''}" data-act="vmode" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div id="s-ai" class="${(st.voiceMode || 'ai') === 'ai' ? '' : 'hidden'}">
      <div class="tiny" style="margin:6px 0">Coach voice</div>
      <div class="row wrap" style="gap:6px">${voice.AI_VOICES.map(([v, l]) => `<button class="chip ${st.aiVoice === v ? 'on' : ''}" data-act="aiv" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="seg" style="display:flex;margin-top:8px">${[['hype', '🔥 Fired up'], ['calm', 'Calm']].map(([v, l]) => `<button class="${(st.aiStyle || 'hype') === v ? 'on' : ''}" data-act="ais" data-v="${v}">${l}</button>`).join('')}</div>
      <button class="btn" data-act="vprev" style="width:100%;margin-top:8px">▶ Hear this voice</button>
      <div class="small muted" style="margin-top:6px">Lines are made once and shared with every coach, so it only takes a few seconds the first time a drill is used.</div>
    </div>
    ${tg('warn30', '"30 seconds" warning', 'On drills 1:30 or longer')}
    ${tg('previewNext', '"Next up" preview', '15 seconds before a change')}
    ${tg('readDescription', 'Read the description out loud too')}
    ${vs.length ? `<label class="field"><span class="tiny">Device voice (backup)</span><select class="input" id="s-voice"><option value="">Best available</option>${vs.map(v => `<option ${v.name === st.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span class="tiny">"Get ready" countdown after Start</span><select class="input" id="s-lead">${[0, 5, 10, 15, 30].map(s => `<option value="${s}" ${st.leadIn === s ? 'selected' : ''}>${s ? s + ' seconds' : 'None'}</option>`).join('')}</select></label>
    ${(window.SpeechRecognition || window.webkitSpeechRecognition) ? tg('voiceCommands', 'Voice commands (beta)', 'Say "Coach, pause", "Coach, go", "Coach, next", or "Coach, add a minute". Works best in Chrome on Android. Takes effect at the next Start.') : ''}
    <div class="small muted">If the phone and the room TV are both playing sound, turn sound off on one of them.</div>
    <button class="btn lg" data-act="test" style="width:100%">🔊 Test horn</button>
  </div>`,
    onAction: (a, el, w) => {
      if (a === 't') { const k = el.dataset.k; const v = !getSettings()[k]; setSettings({ [k]: v }); el.classList.toggle('on', v); }
      if (a === 'style') { setSettings({ style: el.dataset.v }); w.querySelectorAll('[data-act=style]').forEach(b => b.classList.toggle('on', b === el)); applySettings(); audio.unlock().then(() => audio.schedule([{ inMs: 0, kind: 'horn' }])); }
      if (a === 'test') audio.unlock().then(() => { applySettings(); audio.test(); });
      if (a === 'vmode') { setSettings({ voiceMode: el.dataset.v }); w.querySelectorAll('[data-act=vmode]').forEach(b => b.classList.toggle('on', b === el)); w.querySelector('#s-ai').classList.toggle('hidden', el.dataset.v !== 'ai'); if (el.dataset.v === 'device') audio.unlock().then(() => audio.speak('Sound check. Champions are made today.')); }
      if (a === 'aiv' || a === 'ais') { setSettings(a === 'aiv' ? { aiVoice: el.dataset.v } : { aiStyle: el.dataset.v }); w.querySelectorAll(`[data-act=${a}]`).forEach(b => b.classList.toggle('on', b === el)); }
      if (a === 'aiv' || a === 'ais' || a === 'vprev') { const s2 = getSettings(); el.disabled = true; voice.preview(s2.aiVoice, s2.aiStyle).catch(e => toast(e.message, 'error')).finally(() => { el.disabled = false; }); if (S && S.segs.length) prepareVoice(S.segs); }
      applySettings(); if (S) { S.st = getSettings(); reschedule(); }
    },
    onClose: () => { if (S) { S.st = applySettings(); reschedule(); } onDone && onDone(); } });
  const m = document.querySelector('.overlay:last-child');
  m.querySelector('#s-vol')?.addEventListener('input', (e) => { setSettings({ volume: +e.target.value }); applySettings(); });
  m.querySelector('#s-voice')?.addEventListener('change', (e) => { setSettings({ voiceName: e.target.value }); applySettings(); audio.speak('Champions are made today.'); });
  m.querySelector('#s-lead')?.addEventListener('change', (e) => setSettings({ leadIn: +e.target.value }));
}

// ---- Finish ----------------------------------------------------------
async function confirmEnd() {
  if (!isController() && !can(S.user, 'admin')) return;
  if (await confirmBox('End practice?', 'This saves the run to history as ended early.', 'End practice')) finishRun(true);
}

function buildLog(segs, clock, early) {
  const reached = clock.segIndex; // index the practice was on when it ended
  return segs.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'leadin').map(({ s, i }) => ({
    title: s.title + (s.sub && (s.rounds || s.assignments) ? ` · ${s.sub}` : ''), kind: s.kind, category: s.category || '',
    plannedSec: s.durationSec, adjustSec: clock.adjust?.[i] || 0, overtimeSec: clock.overtime?.[i] || 0,
    skipped: !!clock.skipped?.[i] || (early && i > reached),
  }));
}

// Idempotent: the transaction only closes a run that is still live, so a
// double tap or two devices finishing at once write one record.
async function finishRun(early) {
  if (!S?.runId || S.finishing) return;
  S.finishing = true;
  try {
    await store.runCommand(S.runId, (r) => {
      const segs = segsFor({ ...r.practice }, r.leadIn || 0);
      const c = JSON.parse(JSON.stringify(r.clock)); catchUp(segs, c);
      const endedAt = NOW();
      const log = buildLog(segs, c, early);
      const pausedMs = (c.pausedMs || 0) + (!c.running && c.pausedAt ? endedAt - c.pausedAt : 0);
      return { status: early ? 'ended' : 'completed', endedAt, actualSec: Math.round((endedAt - r.startedAt) / 1000), pausedSec: Math.round(pausedMs / 1000), log,
        clock: { ...c, running: false, done: true, segIndex: segs.length }, endedBy: S.user.name };
    });
  } catch (e) { S.finishing = false; toast('Could not close the run: ' + (e.code || e.message), 'error'); }
}

function onDone() {
  audio.cancelScheduled();
  if (S.sound && S.run?.status !== 'ended') audio.speak(PHRASES.done);
  if (S.mode === 'room') { S.idleTimer = setTimeout(() => { if (S && S.mode === 'room') { S.unwatch && S.unwatch(); idleRoom(); } }, 120000); return; }
  audio.keepAwake(false);
  if (!can(S.user, 'run')) return;
  setTimeout(showSummary, 600);
}

function showSummary() {
  if (!S || $('.done-screen')) return;
  const r = S.run || {};
  const planned = practiceDuration(S.practice);
  const div = document.createElement('div'); div.className = 'done-screen';
  div.innerHTML = `<div style="max-width:560px;width:100%;text-align:center" class="stack">
    <div style="font-size:clamp(70px,16vw,160px);font-weight:900;font-style:italic;color:var(--gold);line-height:1">FINISH</div>
    <div style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;color:#64748b">${r.status === 'ended' ? 'Ended early' : 'Practice Complete'}</div>
    ${motto()}
    <div class="grid c3" style="text-align:left;margin-top:10px">
      <div class="card stat"><div class="tiny">Planned</div><div class="v">${fmt(planned)}</div></div>
      <div class="card stat"><div class="tiny">Actual</div><div class="v" id="d-actual">${r.actualSec ? fmt(r.actualSec) : '…'}</div></div>
      <div class="card stat"><div class="tiny">Skipped</div><div class="v" id="d-skipped">${r.log ? r.log.filter(l => l.skipped).length : '…'}</div></div>
    </div>
    <div class="card" style="text-align:left"><div class="stack">
      <label class="field"><span class="tiny">How many wrestlers?</span><input class="input" id="d-att" inputmode="numeric" placeholder="e.g. 24"></label>
      <div><div class="tiny" style="margin-bottom:6px">How'd it go?</div><div class="row wrap" style="gap:6px">${[1, 2, 3, 4, 5].map(n => `<button class="chip" data-r="${n}">${'★'.repeat(n)}</button>`).join('')}</div></div>
      <label class="field"><span class="tiny">Coaching reflection</span><textarea class="input" id="d-notes" placeholder="What worked, what to change for next time…"></textarea></label>
    </div></div>
    <div class="row wrap" style="justify-content:center;gap:10px">
      <button class="btn go lg" id="d-save">Save reflection</button>
      <a class="btn lg" href="#/history/${S.runId}">View record</a>
      <a class="btn lg ghost" href="#/">Home</a>
    </div></div>`;
  $('#live').appendChild(div);
  let rating = 0;
  div.querySelectorAll('[data-r]').forEach(b => b.onclick = (e) => { e.stopPropagation(); rating = +b.dataset.r; div.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', +x.dataset.r === rating)); });
  const save = div.querySelector('#d-save');
  save.onclick = async (e) => {
    e.stopPropagation(); save.disabled = true;
    try {
      await store.updateRun(S.runId, { attendance: parseInt(div.querySelector('#d-att').value) || null, rating: rating || null, notes: div.querySelector('#d-notes').value.trim() });
      toast('Saved to history', 'success'); location.hash = `#/history/${S.runId}`;
    } catch (err) { save.disabled = false; toast('Could not save: ' + (err.code || err.message), 'error'); }
  };
  const iv = setInterval(() => { if (!S || !$('#d-actual')) return clearInterval(iv); if (S.run?.actualSec) { $('#d-actual').textContent = fmt(S.run.actualSec); $('#d-skipped').textContent = (S.run.log || []).filter(l => l.skipped).length; clearInterval(iv); } }, 500);
}
