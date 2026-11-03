// Natural coach voice.
// Each line the app will say is generated once with a Gemini TTS voice
// (Firebase AI Logic, free Gemini Developer API tier) and cached in three
// places: memory, this device (IndexedDB), and Firestore (`voice/`), so every
// coach and the room TV reuse the same clips. Anything not ready yet falls
// back to the best voice the device has, never the default robot.
import { store, isFirebase, can } from './store.js';
import { FIREBASE_SDK, TTS_MODEL } from './config.js';
import { getSettings } from './ui.js';
import * as audio from './audio.js';

export const AI_VOICES = [
  ['Fenrir', 'Fired up'], ['Orus', 'Firm & steady'], ['Kore', 'Firm (female)'],
  ['Puck', 'Upbeat'], ['Aoede', 'Bright (female)'], ['Charon', 'Deep'],
];
export const AI_STYLES = {
  hype: 'Read this like an energetic wrestling coach calling out across a loud gym. Short, punchy, confident, no extra words',
  calm: 'Read this clearly and calmly, like a coach giving instructions. No extra words',
};

const mem = new Map();          // key -> AudioBuffer
const pending = new Map();      // key -> Promise
let disabled = false, aiMod = null, playing = null;

const opts = () => { const s = getSettings(); return { mode: s.voiceMode || 'ai', voice: s.aiVoice || 'Fenrir', style: s.aiStyle || 'hype' }; };
function keyFor(text, voice, style) {
  let h = 0x811c9dc5; const s = `${voice}|${style}|${text.trim().toLowerCase()}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${voice}-${style}-${(h >>> 0).toString(16)}`;
}

// ---- Device cache (IndexedDB) ------------------------------------------
let dbp = null;
function idb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return dbp ||= new Promise((res) => { const r = indexedDB.open('practice-voice', 1); r.onupgradeneeded = () => r.result.createObjectStore('clips'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
}
async function idbGet(k) { const db = await idb(); if (!db) return null; return new Promise(res => { const t = db.transaction('clips').objectStore('clips').get(k); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); }
async function idbPut(k, v) { const db = await idb(); if (!db) return; db.transaction('clips', 'readwrite').objectStore('clips').put(v, k); }

// ---- Decode ----------------------------------------------------------
function b64ToBuffer(b64, rate) {
  const bin = atob(b64), n = bin.length >> 1;
  const ctx = audio.context(); if (!ctx) return null;
  const buf = ctx.createBuffer(1, n, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; ch[i] = v / 32768; }
  return buf;
}

// ---- Generate --------------------------------------------------------
async function generate(text, voice, style) {
  if (!aiMod) {
    const ai = await import(`${FIREBASE_SDK}/firebase-ai.js`);
    aiMod = { ai, inst: ai.getAI(store.app, { backend: new ai.GoogleAIBackend() }) };
  }
  const { ai, inst } = aiMod;
  const model = ai.getGenerativeModel(inst, { model: TTS_MODEL, generationConfig: {
    responseModalities: [ai.ResponseModality?.AUDIO || 'AUDIO'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
  } });
  const res = await model.generateContent(`${AI_STYLES[style] || AI_STYLES.hype}: ${text}`);
  const part = res.response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!part) throw new Error('No audio returned');
  const rate = +((part.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000);
  return { b64: part.inlineData.data, rate };
}

async function load(text) {
  const { voice, style } = opts();
  const k = keyFor(text, voice, style);
  if (mem.has(k)) return mem.get(k);
  if (pending.has(k)) return pending.get(k);
  const p = (async () => {
    let clip = await idbGet(k);
    if (!clip && isFirebase && store.db) {
      try { const s = await store.m.getDoc(store.m.doc(store.db, 'voice', k)); if (s.exists()) clip = s.data(); } catch (e) {}
    }
    if (!clip) {
      if (disabled || !isFirebase || !store.app) return null;
      try { clip = await generate(text, voice, style); }
      catch (e) {
        const msg = String(e.message || e);
        if (/quota|429|rate|exhaust|permission|403|not found|404|App Check/i.test(msg)) { disabled = true; console.warn('AI voice off for this session:', msg); }
        return null;
      }
      if (can(store.user, 'run') && clip.b64.length < 900000) {
        store.m.setDoc(store.m.doc(store.db, 'voice', k), { b64: clip.b64, rate: clip.rate, text: text.slice(0, 200), voice, style, createdAt: Date.now() }).catch(() => {});
      }
    }
    idbPut(k, { b64: clip.b64, rate: clip.rate });
    const buf = b64ToBuffer(clip.b64, clip.rate);
    if (buf) mem.set(k, buf);
    return buf;
  })().finally(() => pending.delete(k));
  pending.set(k, p);
  return p;
}

// Prepare every line a practice will say. Calls onProgress(done, total).
export async function prepare(lines, onProgress) {
  if (opts().mode !== 'ai' || !isFirebase) return { ready: 0, total: 0 };
  const list = [...new Set(lines.filter(Boolean).map(s => s.trim()))];
  let done = 0, ready = 0, i = 0;
  const worker = async () => { while (i < list.length && !disabled) { const t = list[i++]; if (await load(t)) ready++; done++; onProgress && onProgress(done, list.length, ready); } };
  await Promise.all([worker(), worker(), worker()]);
  return { ready, total: list.length, disabled };
}

// Hooked into audio.speak(): returns true if a natural clip was played.
function speakHook(text) {
  if (opts().mode !== 'ai') return false;
  const { voice, style } = opts();
  const buf = mem.get(keyFor(text, voice, style));
  if (!buf) { load(text); return false; } // get it ready for next time
  try { playing && playing.stop(); } catch (e) {}
  playing = audio.playBuffer(buf);
  return !!playing;
}
audio.setSpeakHook(speakHook);

export async function preview(voice, style) {
  const s = getSettings();
  const save = { voice: s.aiVoice, style: s.aiStyle };
  await audio.unlock();
  const text = 'Thirty seconds! Keep your hips down. Champions are made today.';
  const k = keyFor(text, voice, style);
  if (!mem.has(k)) {
    try { const clip = await generate(text, voice, style); const b = b64ToBuffer(clip.b64, clip.rate); if (b) mem.set(k, b); }
    catch (e) { throw new Error('AI voice unavailable: ' + (e.code || e.message)); }
  }
  playing = audio.playBuffer(mem.get(k));
  return save;
}
export const isDisabled = () => disabled;
