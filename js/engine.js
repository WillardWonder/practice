// Turns a practice into a timeline of segments, and runs a clock based on
// wall-clock time, so a throttled or backgrounded tab never drifts.
import { PHRASES } from './seed.js';

export const GROUP = (i) => String.fromCharCode(65 + i);

export function blockDuration(b) {
  if (b.type === 'series') return (b.moves || []).reduce((s, m) => s + (m.sec || 0), 0);
  if (b.type === 'goes') return b.rounds * b.workSec + Math.max(0, b.rounds - 1) * b.restSec;
  if (b.type === 'rotation') {
    const r = b.mode === 'split' ? 1 : b.stations.length;
    return r * b.stationSec + Math.max(0, r - 1) * (b.transitionSec || 0);
  }
  return b.durationSec || 0;
}

export const practiceDuration = (p) => (p.blocks || []).reduce((s, b) => s + blockDuration(b), 0);

export function compile(practice) {
  const segs = [];
  (practice.blocks || []).forEach((b, bi) => {
    const base = { blockIndex: bi, blockId: b.id, category: b.category, description: b.description || '', cues: b.cues || [] };
    if (b.type === 'drill') {
      segs.push({ ...base, kind: 'work', title: b.title, durationSec: b.durationSec, switchAtHalf: !!b.switchAtHalf,
        holdAtEnd: !!b.holdAtEnd, say: PHRASES.start(b.title) });
    } else if (b.type === 'series') {
      const n = (b.moves || []).length;
      b.moves.forEach((m, k) => segs.push({ ...base, kind: 'work', title: m.title, description: m.description || '', cues: [],
        sub: `${m.section || b.title} · ${k + 1} of ${n}`, durationSec: m.sec, seriesStep: k < n - 1,
        say: k === 0 ? `${b.title}. ${m.section ? m.section + '. ' : ''}${m.title}` : (m.section && m.section !== b.moves[k - 1].section ? `${m.section}. ${m.title}` : m.title) }));
    } else if (b.type === 'rest') {
      segs.push({ ...base, kind: 'rest', title: b.title && b.title !== 'Rest' ? b.title : 'Rest', durationSec: b.durationSec, say: 'Rest' });
    } else if (b.type === 'goes') {
      for (let r = 0; r < b.rounds; r++) {
        segs.push({ ...base, kind: 'work', title: b.title, sub: `Go ${r + 1} of ${b.rounds}`, durationSec: b.workSec,
          switchAtHalf: !!b.switchAtHalf, round: r + 1, rounds: b.rounds,
          say: r === 0 ? `${PHRASES.start(b.title)}. Go 1 of ${b.rounds}. Wrestle!` : `Go ${r + 1} of ${b.rounds}. Wrestle!` });
        if (r < b.rounds - 1 && b.restSec > 0)
          segs.push({ ...base, kind: 'rest', title: 'Rest', sub: `${b.title} · next: Go ${r + 2}`, durationSec: b.restSec, say: 'Rest' });
      }
    } else if (b.type === 'rotation') {
      const n = b.stations.length;
      const rounds = b.mode === 'split' ? 1 : n;
      for (let r = 0; r < rounds; r++) {
        const assignments = b.stations.map((_, g) => ({ group: GROUP(g), station: b.stations[(g + r) % n] }));
        segs.push({ ...base, kind: 'work', title: b.title || 'Station Rotation',
          sub: b.mode === 'split' ? `${n} groups` : `Rotation ${r + 1} of ${rounds}`, durationSec: b.stationSec,
          assignments, round: r + 1, rounds,
          say: r === 0 ? PHRASES.rotationStart : `Rotate. Rotation ${r + 1} of ${rounds}` });
        if (r < rounds - 1 && b.transitionSec > 0) {
          const nextA = b.stations.map((_, g) => ({ group: GROUP(g), station: b.stations[(g + r + 1) % n] }));
          segs.push({ ...base, kind: 'transition', title: 'Rotate', sub: 'Move to your next station', durationSec: b.transitionSec,
            assignments: nextA, say: 'Rotate! Move to your next station' });
        }
      }
    }
  });
  segs.forEach((s, i) => { s.index = i; });
  return segs.filter(s => s.durationSec > 0).map((s, i) => ({ ...s, index: i }));
}

// ---- Clock -------------------------------------------------------------
// All devices use one time base: the server's clock (set via setNowFn once the
// offset between this device and Firestore is measured). That's what keeps the
// TV, the coach's phone, and everyone else showing the same second.
let nowFn = () => Date.now();
export const setNowFn = (f) => { nowFn = f; };
export const NOW = () => nowFn();
// state: { segIndex, running, anchor (epoch ms when elapsed was 0), pausedElapsed (ms), adjust: {idx: sec}, done }
export const newClock = () => ({ segIndex: 0, running: false, anchor: 0, pausedElapsed: 0, adjust: {}, done: false });

export function segDur(segs, clock, i) {
  const s = segs[i]; if (!s) return 0;
  return Math.max(5, s.durationSec + (clock.adjust?.[i] || 0));
}

export function elapsedMs(clock, now = NOW()) {
  return clock.running ? now - clock.anchor : clock.pausedElapsed;
}

export function remainingMs(segs, clock, now = NOW()) {
  return segDur(segs, clock, clock.segIndex) * 1000 - elapsedMs(clock, now);
}

// Advance through any segments that have finished. Returns list of indexes entered.
export function catchUp(segs, clock, now = NOW()) {
  const entered = [];
  while (clock.running && !clock.done) {
    const d = segDur(segs, clock, clock.segIndex) * 1000;
    if (now - clock.anchor < d) break;
    if (segs[clock.segIndex]?.holdAtEnd) break; // coach-paced block: waits at 0:00 for Next
    clock.anchor += d;
    if (clock.segIndex >= segs.length - 1) { clock.done = true; clock.running = false; clock.pausedElapsed = 0; clock.segIndex = segs.length; entered.push(segs.length); break; }
    clock.segIndex++;
    entered.push(clock.segIndex);
  }
  return entered;
}

export function play(clock, now = NOW()) {
  if (clock.running || clock.done) return;
  if (clock.pausedAt) clock.pausedMs = (clock.pausedMs || 0) + (now - clock.pausedAt);
  clock.pausedAt = 0;
  clock.anchor = now - clock.pausedElapsed; clock.running = true;
}
export function pause(clock, now = NOW()) {
  if (!clock.running) return;
  clock.pausedElapsed = now - clock.anchor; clock.running = false; clock.pausedAt = now;
}
export function jump(segs, clock, i, now = NOW()) {
  clock.done = false;
  clock.segIndex = Math.max(0, Math.min(segs.length - 1, i));
  clock.pausedElapsed = 0; clock.anchor = now;
}
// Apply a named coach command to a clock (pure; used inside transactions).
export function applyCommand(segs, clock, cmd, arg, now = NOW()) {
  const c = JSON.parse(JSON.stringify(clock));
  catchUp(segs, c, now);
  if (c.done && cmd !== 'jump') return c;
  const running = c.running;
  switch (cmd) {
    case 'play': play(c, now); break;
    case 'pause': pause(c, now); break;
    case 'next': {
      const el = elapsedMs(c, now), d = segDur(segs, c, c.segIndex) * 1000;
      c.skipped = { ...(c.skipped || {}) };
      if (el < d * 0.9) c.skipped[c.segIndex] = 1;
      else if (el > d) { c.overtime = { ...(c.overtime || {}) }; c.overtime[c.segIndex] = Math.round((el - d) / 1000); }
      if (c.segIndex >= segs.length - 1) { c.done = true; c.running = false; c.segIndex = segs.length; break; }
      jump(segs, c, c.segIndex + 1, now); if (running) c.running = true; break;
    }
    case 'prev': {
      const back = elapsedMs(c, now) < 5000 ? c.segIndex - 1 : c.segIndex;
      jump(segs, c, back, now); if (running) c.running = true; break;
    }
    case 'jump': {
      if (arg > c.segIndex) { // jumping ahead: anything passed over counts as skipped
        c.skipped = { ...(c.skipped || {}) };
        const el = elapsedMs(c, now), d = segDur(segs, c, c.segIndex) * 1000;
        for (let k = c.segIndex; k < arg; k++) if (k > c.segIndex || el < d * 0.9) c.skipped[k] = 1;
      }
      jump(segs, c, arg, now); if (running) c.running = true; break;
    }
    case 'add': {
      if (arg < 0) { const rem = remainingMs(segs, c, now) / 1000; arg = -Math.min(-arg, Math.max(0, rem - 3)); }
      addTime(c, arg); break;
    }
  }
  if (c.running && cmd === 'jump' || (c.running && (cmd === 'next' || cmd === 'prev'))) { c.anchor = now; c.pausedElapsed = 0; }
  return c;
}
export function addTime(clock, sec) {
  clock.adjust = { ...(clock.adjust || {}) };
  clock.adjust[clock.segIndex] = (clock.adjust[clock.segIndex] || 0) + sec;
}

export function remainingTotalMs(segs, clock, now = NOW()) {
  if (clock.done) return 0;
  let t = Math.max(0, remainingMs(segs, clock, now));
  for (let i = clock.segIndex + 1; i < segs.length; i++) t += segDur(segs, clock, i) * 1000;
  return t;
}

export function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDur(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

export function parseDur(str, fallback) {
  str = String(str).trim().toLowerCase();
  if (!str) return fallback;
  let m;
  if ((m = str.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = str.match(/^(\d+(?:\.\d+)?)\s*s(ec)?$/))) return Math.round(+m[1]);
  if ((m = str.match(/^(\d+(?:\.\d+)?)\s*(m|min)?$/))) return Math.round(+m[1] * 60);
  return fallback;
}

export function clockTimeLabel(startHHMM, offsetSec) {
  if (!startHHMM) return '';
  const [h, m] = startHHMM.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m, 0); d.setSeconds(d.getSeconds() + offsetSec);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function minutesBetween(a, b) {
  if (!a || !b) return 0;
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
