// Quick Dictate: say what you want, get a runnable practice.
// Uses Gemini through Firebase AI Logic (free Gemini Developer API tier, no
// API key in the page). If the AI can't be reached, it falls back to a local
// keyword builder that matches drills from the library.
import { esc, modal, toast } from './ui.js';
import { store, isFirebase } from './store.js';
import { CATEGORIES, makeRest, newId, drillToBlock } from './seed.js';
import { practiceDuration, fmtDur, minutesBetween } from './engine.js';
import { readOnlyPractice } from './print.js';
import { FIREBASE_SDK, AI_MODELS } from './config.js';

let modelCache = null;

async function getModel() {
  if (modelCache) return modelCache;
  if (!isFirebase || !store.app) throw new Error('AI needs Firebase');
  const ai = await import(`${FIREBASE_SDK}/firebase-ai.js`);
  const inst = ai.getAI(store.app, { backend: new ai.GoogleAIBackend() });
  modelCache = { ai, inst };
  return modelCache;
}

async function generate(prompt) {
  const { ai, inst } = await getModel();
  let lastErr;
  for (const name of AI_MODELS) {
    try {
      const model = ai.getGenerativeModel(inst, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.35 } });
      const res = await model.generateContent(prompt);
      const text = res.response.text();
      return JSON.parse(text.replace(/^```json\s*|```\s*$/g, ''));
    } catch (e) {
      lastErr = e; const msg = String(e.message || e);
      if (/not found|404|unsupported|does not exist|is not supported/i.test(msg)) continue; // try the next model name
      throw e;
    }
  }
  throw lastErr;
}

function buildPrompt(drills, transcript, history, defaults) {
  const lib = drills.map(d => `${d.id} | ${d.title} | ${d.category} | ${Math.round(d.durationSec / 60)}m${d.type === 'series' ? ' | ROUTINE (fixed length; add as a drill block with this drillId)' : d.description ? ' | ' + d.description : ''}`).join('\n');
  return `You are the practice planner for Bluejays Girls Wrestling ("Champion Making Process").
Turn the coach's spoken request into a practice plan using ONLY these building blocks.

DRILL LIBRARY (id | title | category | default minutes | description):
${lib}

CATEGORIES: ${CATEGORIES.map(c => c.id).join(', ')}

BLOCK TYPES (JSON):
- {"type":"drill","drillId":"<library id or null>","title":"...","category":"...","minutes":5,"description":"optional","cues":["optional"],"switchAtHalf":false,"holdAtEnd":false}
- {"type":"rest","minutes":1,"title":"Rest"}  (water breaks)
- {"type":"goes","title":"Live Goes","category":"Live","rounds":3,"workSec":60,"restSec":30,"description":"optional","switchAtHalf":false}  (repeated live wrestling bouts)
- {"type":"rotation","mode":"rotate","title":"Station Rotation","stationMinutes":5,"transitionSec":30,"stations":[{"drillId":"...","title":"..."}]}  (groups rotate through every station; mode "split" = each group stays on one move)

RULES:
1. Prefer library drills (use their exact title and drillId). Only invent a drill (drillId null) if the coach names something not in the library.
2. If the coach gives a total time, the blocks must add up to it (within 2 minutes). Fill the time sensibly using library default minutes, then stretch or trim.
3. Do NOT ask about anything you can reasonably decide: use library default minutes, add a short water break about every 25-30 minutes of work, start with a warm-up and end with a cool down unless told otherwise.
4. Ask questions ONLY when the answer changes the plan a lot and can't be inferred, e.g. the total length when nothing hints at it, or the station length when the coach wants stations but gave no time and the total doesn't determine it. Max 3 short questions. Give 2-4 likely options for each.
5. "Live wrestling drills" or "live goes" means goes blocks or Live/Situational drills. "Stations" means a rotation block.
6. Keep titles short. Use the coach's language.
${defaults}

Respond with JSON only, one of:
{"status":"questions","questions":[{"id":"q1","question":"...","options":["...","..."]}]}
{"status":"plan","title":"...","focus":"one line or empty","totalMinutes":90,"blocks":[ ... ]}

CONVERSATION SO FAR:
${history.map(h => `${h.role.toUpperCase()}: ${h.text}`).join('\n')}
COACH: ${transcript}`;
}

const num = (v, d) => Number.isFinite(parseInt(v)) ? parseInt(v) : d;
function toBlocks(plan, drills) {
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  const byTitle = Object.fromEntries(drills.map(d => [d.title.toLowerCase(), d]));
  const find = (b) => byId[b.drillId] || byTitle[(b.title || '').toLowerCase()];
  const cat = (c) => CATEGORIES.some(x => x.id === c) ? c : 'Neutral';
  const sec = (m, def) => Math.max(15, Math.round((Number(m) || def) * 60 / 15) * 15);
  return (plan.blocks || []).map(b => {
    if (b.type === 'rest') return { ...makeRest(sec(b.minutes, 1)), title: b.title || 'Rest' };
    if (b.type === 'goes') return { id: newId(), type: 'goes', title: b.title || 'Live Goes', category: cat(b.category || 'Live'), description: b.description || '', cues: b.cues || [],
      rounds: Math.max(1, Math.min(30, parseInt(b.rounds) || 3)), workSec: Math.max(15, parseInt(b.workSec) || 60), restSec: Math.max(0, num(b.restSec, 30)), switchAtHalf: !!b.switchAtHalf };
    if (b.type === 'rotation') {
      const st = (b.stations || []).slice(0, 8).map(s => { const d = find(s); return { title: d?.title || s.title || 'Station', description: d?.description || s.description || '', category: d?.category || 'Station', drillId: d?.id || null }; });
      while (st.length < 2) st.push({ title: `Station ${st.length + 1}`, description: '', category: 'Station' });
      return { id: newId(), type: 'rotation', mode: b.mode === 'split' ? 'split' : 'rotate', title: b.title || 'Station Rotation', category: 'Station', description: '',
        stationSec: sec(b.stationMinutes, 5), transitionSec: Math.max(0, num(b.transitionSec, 30)), stations: st };
    }
    const d = find(b);
    if (d?.type === 'series') return drillToBlock(d);
    return { id: newId(), type: 'drill', title: d?.title || b.title || 'Drill', category: d?.category || cat(b.category), description: b.description || d?.description || '',
      cues: b.cues?.length ? b.cues : (d?.cues || []), durationSec: sec(b.minutes, (d?.durationSec || 300) / 60), switchAtHalf: !!b.switchAtHalf, holdAtEnd: !!b.holdAtEnd, drillId: d?.id || null, videoUrl: d?.videoUrl || '' };
  });
}

// ---- Offline fallback: keyword builder -----------------------------------
function localPlan(text, drills) {
  const t = text.toLowerCase();
  const total = (() => { let m = t.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)/); if (m) return Math.round(+m[1] * 60); m = t.match(/(\d+)\s*(minutes?|mins?)\b(?!\s*(each|per|a piece))/); return m ? +m[1] : 90; })();
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const mentioned = drills.filter(d => { const w = words(d.title); return w.length && w.every(x => t.includes(x)); });
  const blocks = [];
  const add = (d, min) => blocks.push({ type: 'drill', drillId: d.id, title: d.title, minutes: d.type === 'series' ? d.durationSec / 60 : (min ?? d.durationSec / 60) });
  const warm = drills.find(d => d.id === 'r001') || drills.find(d => d.id === 'w1'); if (warm && !mentioned.includes(warm)) add(warm, 10);
  mentioned.forEach(d => add(d));
  const nLive = (t.match(/(\d+)\s*(live|goes|situation)/) || [])[1];
  if (/live|goes|wrestl/.test(t)) blocks.push({ type: 'goes', title: 'Live Goes', rounds: nLive ? Math.min(+nLive, 15) : 4, workSec: 120, restSec: 60 });
  const nSt = (t.match(/(\d+)\s*(stations?|groups?)/) || [])[1];
  if (nSt || /station|rotation/.test(t)) { const per = (t.match(/(\d+)\s*min\w*\s*(each|per|a piece)/) || [])[1];
    blocks.push({ type: 'rotation', mode: 'rotate', stationMinutes: per ? +per : 5, transitionSec: 30, stations: drills.filter(d => ['Neutral', 'Top', 'Bottom'].includes(d.category)).slice(0, nSt ? +nSt : 4).map(d => ({ drillId: d.id, title: d.title })) }); }
  if (/condition|sprint|run/.test(t) && !mentioned.some(d => d.category === 'Conditioning')) add(drills.find(d => d.id === 'c1') || drills[0], 10);
  const cool = drills.find(d => d.id === 'cd1'); if (cool) add(cool, 5);
  const used = blocks.reduce((s, b) => s + (b.type === 'goes' ? (b.rounds * b.workSec + (b.rounds - 1) * b.restSec) / 60 : b.type === 'rotation' ? b.stations.length * b.stationMinutes + (b.stations.length - 1) * 0.5 : b.minutes), 0);
  if (used < total - 4) { const fillers = drills.filter(d => ['Neutral', 'Top', 'Bottom'].includes(d.category) && !mentioned.includes(d)); let left = total - used, i = 0;
    while (left >= 5 && i < fillers.length) { blocks.splice(blocks.length - 1, 0, { type: 'drill', drillId: fillers[i].id, title: fillers[i].title, minutes: Math.min(left, fillers[i].durationSec / 60) }); left -= fillers[i].durationSec / 60; i++; } }
  // Order by phase of practice, then trim to the requested length.
  const phase = (b) => { if (b.type === 'rotation') return 3; if (b.type === 'goes') return 4; const d = drills.find(x => x.id === b.drillId);
    return { 'Warm-up': 0, Neutral: 1, Top: 2, Bottom: 2, Specials: 2, Situational: 3, Live: 4, Conditioning: 5, 'Cool Down': 6 }[d?.category] ?? 2; };
  blocks.sort((a, b) => phase(a) - phase(b));
  const len = (b) => b.type === 'goes' ? (b.rounds * b.workSec + (b.rounds - 1) * b.restSec) / 60 : b.type === 'rotation' ? b.stations.length * b.stationMinutes + (b.stations.length - 1) * 0.5 : b.minutes;
  let over = blocks.reduce((s, b) => s + len(b), 0) - total;
  for (const b of blocks.slice().sort((a, b) => phase(b) - phase(a))) {
    if (over <= 1) break;
    if (b.type === 'drill' && !drills.find(x => x.id === b.drillId && x.type === 'series') && phase(b) !== 0 && phase(b) !== 6) { const cut = Math.min(over, b.minutes - 3); if (cut > 0) { b.minutes -= cut; over -= cut; } }
    else if (b.type === 'goes') { while (over > 1 && b.rounds > 3) { b.rounds--; over -= (b.workSec + b.restSec) / 60; } }
  }
  return { status: 'plan', title: 'Dictated practice', focus: text.slice(0, 120), blocks };
}

// ---- UI ------------------------------------------------------------------
export async function openDictate(user, onCreate) {
  const drills = await store.listDrills();
  const history = [];
  let plan = null, practice = null, busy = false, usedFallback = false;
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  const inputHTML = (placeholder) => `<div class="dict-in"><textarea class="input" id="dx" rows="4" placeholder="${esc(placeholder)}"></textarea>
    ${R ? '<button class="btn icon mic" data-act="mic" id="mic" title="Talk">🎤</button>' : ''}</div>
    <div class="small muted" style="margin-top:6px">${R ? 'Tap 🎤 and talk, or' : 'Tap the microphone on your keyboard to talk, or'} type it out.</div>`;

  const first = () => `${!isFirebase ? '<div class="small" style="color:#fde68a;margin-bottom:8px">Local Demo mode: using the built-in keyword builder (no AI).</div>' : ''}
    ${inputHTML('e.g. "90 minute practice, warm up, then 4 stations of neutral, top, bottom and cradles 6 minutes each, then 10 live goes, finish with sprints"')}
    <div class="row wrap" style="gap:6px;margin-top:10px">${['75 min practice: warm-up, single legs, cradles, 6 live goes, sprints', 'Group split day with 4 stations, 90 minutes', 'Light day before a meet, 45 minutes'].map(x => `<button class="chip" data-act="ex" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;

  const questionsHTML = (qs) => `<div class="stack">${history.length ? `<div class="small muted">“${esc(history[0].text)}”</div>` : ''}
    ${qs.map(q => `<div class="card" style="background:#0d1428"><b>${esc(q.question)}</b>
      <div class="row wrap" style="gap:6px;margin-top:8px">${(q.options || []).map(o => `<button class="chip" data-act="opt" data-q="${esc(q.id)}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <input class="input" data-qa="${esc(q.id)}" placeholder="Or type an answer" style="margin-top:8px"></div>`).join('')}</div>`;

  const planHTML = () => `<div class="row wrap" style="gap:8px;margin-bottom:10px"><span class="badge green">${Math.round(practiceDuration(practice) / 60)} min</span><span class="badge">${practice.blocks.length} blocks</span>
      ${usedFallback ? '<span class="badge gold">Built without AI — check it over</span>' : ''}</div>
    ${readOnlyPractice(practice)}
    <div class="card" style="margin-top:12px;background:#0d1428"><div class="tiny" style="margin-bottom:6px">Want changes? Say it</div>${inputHTML('e.g. "make the live goes 90 seconds and add a water break after stations"')}</div>`;

  const footer = (stage) => stage === 'plan'
    ? `<button class="btn" data-act="revise">Update plan</button><button class="btn" data-act="edit">Create & edit</button><button class="btn go lg" data-act="run">Create & run ▶</button>`
    : stage === 'q' ? `<button class="btn primary lg" data-act="answer">Continue</button>` : `<button class="btn primary lg" data-act="build">Build practice</button>`;

  const m = modal({ title: '🎤 Dictate a practice', wide: true, body: first(), footer: footer('in'),
    onAction: async (a, el, w, close) => {
      if (a === 'ex') { w.querySelector('#dx').value = el.dataset.x; return; }
      if (a === 'mic') return toggleMic(w);
      if (a === 'opt') { const inp = w.querySelector(`[data-qa="${el.dataset.q}"]`); inp.value = el.dataset.o; w.querySelectorAll(`[data-act=opt][data-q="${el.dataset.q}"]`).forEach(c => c.classList.toggle('on', c === el)); return; }
      if (busy) return;
      if (a === 'build' || a === 'revise') {
        const text = (w.querySelector('#dx')?.value || '').trim();
        if (!text) return toast('Say or type what you want first', 'error');
        await ask(w, text);
      }
      if (a === 'answer') {
        const answers = [...w.querySelectorAll('[data-qa]')].map(i => `${i.closest('.card').querySelector('b').textContent} → ${i.value.trim() || 'you decide'}`).join('; ');
        await ask(w, answers);
      }
      if (a === 'edit' || a === 'run') {
        stopMic();
        const p = { ...practice }; await store.savePractice(p); close();
        toast('Practice saved', 'success'); onCreate && onCreate(p, a === 'run');
      }
    }, onClose: stopMic });

  function stopMic() { try { rec && rec.stop(); } catch (e) {} rec = null; const b = m.el.querySelector('#mic'); if (b) b.classList.remove('rec'); }
  function toggleMic(w) {
    if (rec) return stopMic();
    rec = new R(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
    const ta = w.querySelector('#dx'); const base = ta.value ? ta.value + ' ' : '';
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; ta.value = base + s; };
    rec.onerror = (e) => { toast('Mic: ' + e.error, 'error'); stopMic(); };
    rec.onend = () => stopMic();
    try { rec.start(); w.querySelector('#mic').classList.add('rec'); } catch (e) { toast('Mic not available', 'error'); }
  }

  async function ask(w, text) {
    stopMic(); busy = true;
    const body = w.querySelector('.mb'), foot = w.querySelector('.mf');
    foot.innerHTML = '<span class="muted">Building your practice…</span>';
    const prevBody = body.innerHTML;
    try {
      const defaults = `DEFAULTS: start time 3:30 PM. Today is ${new Date().toLocaleDateString([], { weekday: 'long' })}.${plan ? `\nCURRENT PLAN (revise it, keep what wasn't mentioned): ${JSON.stringify(plan)}` : ''}`;
      let res;
      usedFallback = false;
      try {
        if (!isFirebase) throw new Error('local');
        res = await generate(buildPrompt(drills, text, history, defaults));
      } catch (e) {
        console.warn('AI unavailable, using keyword builder', e);
        if (isFirebase && e.message !== 'local') toast('AI unavailable (' + (e.code || e.message).toString().slice(0, 80) + '). Used the keyword builder.', 'error');
        res = localPlan(history.filter(h => h.role === 'coach').map(h => h.text).concat(text).join('. '), drills); usedFallback = true;
      }
      history.push({ role: 'coach', text });
      if (res.status === 'questions' && res.questions?.length) {
        history.push({ role: 'planner', text: 'Asked: ' + res.questions.map(q => q.question).join(' | ') });
        body.innerHTML = questionsHTML(res.questions.slice(0, 3)); foot.innerHTML = footer('q');
      } else {
        plan = res;
        history.push({ role: 'planner', text: 'Proposed a plan.' });
        const blocks = toBlocks(res, drills);
        if (!blocks.length) throw new Error('The plan came back empty. Try saying it another way.');
        practice = { ...(practice || {}), title: (res.title || 'Dictated practice').slice(0, 120), notes: res.focus || '', blocks, date: practice?.date || todayStr(),
          startTime: practice?.startTime || '15:30', endTime: '', levels: [], visibility: 'team' };
        if (res.totalMinutes) practice.endTime = addMin('15:30', res.totalMinutes);
        body.innerHTML = planHTML(); foot.innerHTML = footer('plan');
      }
    } catch (e) {
      body.innerHTML = prevBody; foot.innerHTML = footer(plan ? 'plan' : 'in');
      toast(e.message, 'error');
    }
    busy = false;
  }
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addMin = (hhmm, m) => { const [h, mi] = hhmm.split(':').map(Number); const t = h * 60 + mi + Math.round(m); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export { localPlan, toBlocks };
