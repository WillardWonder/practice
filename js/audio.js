// Loud, reliable room audio for phones and laptops.
//
// What was wrong last season: the prototype built a new AudioContext for every
// whistle. Phones start a context created outside a tap in a suspended state,
// so the whistle stayed silent until the next tap (like Stop). It was also a
// quiet 0.3-gain blip at 900 Hz, where phone speakers are weak.
//
// What this does instead:
//  - one AudioContext, unlocked by the Start tap and kept awake
//  - sounds are scheduled on the audio clock ahead of time, so the horn fires
//    exactly at 0:00 even if the page's timers get throttled
//  - tones sit at 1.5–3.5 kHz, where phone speakers are loudest, run through a
//    drive stage and a limiter to be as loud as possible without harsh clipping
//  - on iPhone it requests "playback" audio and plays a silent loop, so sound
//    isn't muted by the ring/silent switch
//  - Screen Wake Lock keeps the phone from sleeping mid-practice

let ctx = null, master = null, drive = null, keepAlive = null, silentEl = null, wakeLock = null;
const scheduled = new Set();
const settings = { volume: 1, style: 'buzzer' };

export function configure(opts) { Object.assign(settings, opts); if (master) master.gain.value = gainFor(settings.volume); }
const gainFor = (v) => 0.25 + 0.75 * Math.max(0, Math.min(1, v));

function silentWavUrl() {
  const sr = 8000, n = sr; const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Must be called from a tap/click.
export async function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (!silentEl) {
    silentEl = new Audio(silentWavUrl()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.volume = 0.01;
  }
  silentEl.play().catch(() => {});
  ensureCtx();
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  // A single silent sample also unlocks iOS output.
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  return ctx.state === 'running';
}

let voiceIn = null;
function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  drive = ctx.createWaveShaper(); drive.curve = makeDrive(2.2); drive.oversample = '2x';
  master = ctx.createGain(); master.gain.value = gainFor(settings.volume);
  drive.connect(limiter); limiter.connect(master); master.connect(ctx.destination);
  // Voice gets its own clean chain (no distortion): gentle compression + makeup gain
  const vc = ctx.createDynamicsCompressor(); vc.threshold.value = -26; vc.ratio.value = 4; vc.attack.value = 0.003; vc.release.value = 0.15;
  const vg = ctx.createGain(); vg.gain.value = 1.8;
  vc.connect(vg); vg.connect(ctx.destination); voiceIn = vc;
  // A near-silent constant tone keeps mobile browsers from suspending the context.
  keepAlive = ctx.createOscillator(); const kg = ctx.createGain(); kg.gain.value = 0.0001;
  keepAlive.frequency.value = 40; keepAlive.connect(kg); kg.connect(ctx.destination); keepAlive.start();
  return ctx;
}
export function context() { try { return ensureCtx(); } catch (e) { return null; } }
export function playBuffer(buf) {
  if (!ctx || !buf) return null;
  try { speechSynthesis.cancel(); } catch (e) {}
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(voiceIn); src.start(); return src;
}

export const isUnlocked = () => !!ctx && ctx.state === 'running';

function makeDrive(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

function osc(t, dur, freq, type, peak, opts = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (opts.toFreq) o.frequency.exponentialRampToValueAtTime(opts.toFreq, t + (opts.rampTime || dur));
  if (opts.detune) o.detune.value = opts.detune;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.setValueAtTime(peak, t + Math.max(0.01, dur - 0.03));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(drive);
  if (opts.lfo) {
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opts.lfo; lg.gain.value = opts.lfoDepth || 200;
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); track(l, t);
  }
  o.start(t); o.stop(t + dur + 0.05); track(o, t);
  return o;
}

function track(node, startT) {
  node._t = startT;
  scheduled.add(node);
  node.onended = () => scheduled.delete(node);
}

// ---- Sound kinds ------------------------------------------------------
function hornAt(t, long = true) {
  const d = long ? 1.4 : 0.7;
  if (settings.style === 'whistle') {
    // Referee whistle: pea-whistle warble near 3 kHz
    osc(t, d, 3100, 'square', 0.5, { lfo: 28, lfoDepth: 260 });
    osc(t, d, 3150, 'triangle', 0.35, { lfo: 28, lfoDepth: 240 });
  } else if (settings.style === 'horn') {
    // Air horn: stacked saws, rich harmonics land in the phone speaker's range
    [466, 554, 698, 932].forEach((f, i) => osc(t, d, f, 'sawtooth', 0.22, { detune: i * 6 - 9 }));
    osc(t, d, 1864, 'square', 0.18);
  } else {
    // Gym buzzer (default): loudest on small speakers
    osc(t, d, 1480, 'square', 0.4, { detune: -8 });
    osc(t, d, 1500, 'square', 0.4, { detune: 8 });
    osc(t, d, 2960, 'square', 0.25);
  }
}

function beepAt(t, high = false) {
  osc(t, 0.16, high ? 2600 : 2000, 'square', 0.5);
  osc(t, 0.16, high ? 3900 : 3000, 'square', 0.2);
}

function doubleWhistleAt(t) {
  osc(t, 0.25, 3000, 'square', 0.5, { lfo: 30, lfoDepth: 250 });
  osc(t + 0.35, 0.25, 3000, 'square', 0.5, { lfo: 30, lfoDepth: 250 });
}

// ---- Public API ------------------------------------------------------
// Cancels sounds that haven't started yet. Sounds already playing (like the
// horn that just marked the end of a drill) are allowed to finish.
export function cancelScheduled() {
  const now = ctx ? ctx.currentTime : 0;
  scheduled.forEach(n => {
    if (n._t > now + 0.02) { try { n.onended = null; n.stop(); } catch (e) {} scheduled.delete(n); }
  });
}

// events: [{ inMs, kind: 'horn'|'beep'|'beepHigh'|'switch'|'short' }]
export function schedule(events) {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const e of events) {
    const t = now + e.inMs / 1000;
    if (t < now - 0.05) continue;
    const at = Math.max(t, now + 0.01);
    if (e.kind === 'horn') hornAt(at, true);
    else if (e.kind === 'short') hornAt(at, false);
    else if (e.kind === 'beep') beepAt(at);
    else if (e.kind === 'beepHigh') beepAt(at, true);
    else if (e.kind === 'switch') doubleWhistleAt(at);
  }
}

export function test() { schedule([{ inMs: 0, kind: 'beep' }, { inMs: 400, kind: 'beep' }, { inMs: 800, kind: 'horn' }]); }

// ---- Voice ------------------------------------------------------------
const voice = { enabled: true, rate: 1.05, name: '' };
export function configureVoice(o) { Object.assign(voice, o); }
export function voices() { return (window.speechSynthesis?.getVoices() || []).filter(v => /^en/i.test(v.lang)); }
// Pick the most natural voice the device has. Robot-sounding defaults rank last.
const RANK = [/natural/i, /neural/i, /premium/i, /enhanced/i, /online/i, /^Google US English$/i, /Google UK English (Female|Male)/i,
  /\b(Ava|Zoe|Evan|Nathan|Samantha|Allison|Susan|Tom|Aria|Jenny|Guy|Davis|Andrew|Emma|Brian)\b/i];
export function bestVoice() {
  const vs = voices(); if (!vs.length) return null;
  const score = (v) => { const i = RANK.findIndex(r => r.test(v.name)); return (i < 0 ? 100 : i) + (/en-US/i.test(v.lang) ? 0 : 0.5) + (v.localService ? 0.2 : 0); };
  return vs.slice().sort((a, b) => score(a) - score(b))[0];
}
let speakHook = null;
export function setSpeakHook(f) { speakHook = f; }
export function speak(text, { interrupt = true } = {}) {
  if (!voice.enabled || !text) return;
  if (speakHook && speakHook(text)) return;
  if (!window.speechSynthesis) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = voice.rate; u.volume = 1; u.pitch = 1;
  const v = voices().find(v => v.name === voice.name) || bestVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
export function unlockVoice() {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
}

// ---- Wake lock -------------------------------------------------------
export async function keepAwake(on) {
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
  return !!wakeLock;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
});
export const hasWakeLock = () => !!wakeLock;
