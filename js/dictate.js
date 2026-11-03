// Quick Dictate: say what you want, get a well-built, runnable practice.
//
// How it thinks:
//  1. PLAN: Gemini (through Firebase AI Logic, free tier) gets the coach's words,
//     the team's drill library, and a set of practice-design rules. It must
//     first list what the coach asked for and budget the minutes by phase,
//     then build sections of blocks that follow from that budget.
//  2. CHECK: this code checks the result: the total matches the asked-for
//     length, every requested item is in it, warm-up comes first and cool-down
//     last, the order makes sense, and there are water breaks. Small misses are
//     fixed here (e.g. rescaling drill lengths).
//  3. FIX: anything it can't fix goes back to the model once, with the list of
//     problems, for a corrected plan.
//  4. EXPLAIN: the coach sees each section, what it's for, and how it covers
//     what they asked.
// If the AI can't be reached at all, a simple keyword builder makes a draft
// and says so.
import { esc, modal, toast } from './ui.js';
import { store, isFirebase } from './store.js';
import { CATEGORIES, makeRest, newId, drillToBlock } from './seed.js';
import { practiceDuration, blockDuration, fmtDur } from './engine.js';
import { readOnlyPractice } from './print.js';
import { FIREBASE_SDK, AI_MODELS } from './config.js';

// ---- Practice-design rules the planner must follow -------------------------
const PRINCIPLES = `
PRACTICE DESIGN RULES (follow unless the coach says otherwise):
- Phase order: (optional short Team Talk) → Warm-up → Stance/motion & hand fighting → Technique (teach → drill, neutral first, then top/bottom) → Situational → Live → Conditioning / Games → Cool Down → (optional closing huddle).
- Default time split for a 90-minute practice: warm-up 10-15, stance/hand fighting 5, technique 30-40, situational 8-12, live 15-20, conditioning or games 8-10, cool down 5. Scale proportionally for other lengths.
- Warm-up: if the library has a ROUTINE in Warm-up (e.g. "Warm Up for Success"), use it as the warm-up instead of building one from single drills.
- Technique drill blocks are usually 4-10 minutes. Don't make one technique 20+ minutes unless asked. Group related techniques (all neutral attacks together, then top, then bottom).
- Progress within a position: basic → finish → chain/counter → situational. Situations should use the positions taught that day.
- Hard live wrestling comes before conditioning, never after a long conditioning block. Conditioning never comes before technique.
- Live goes: usually 1-3 minute goes with rest about half the work time. "10 live goes" = one goes block with rounds 10. "Live wrestling drills" = Live/Situational blocks or goes.
- Stations: 3-6 stations, 4-8 minutes each, 30 second rotations. Pick complementary positions (e.g. neutral, top, bottom, conditioning). "Group split" = mode "split".
- Water: a short Water rest (1:00) roughly every 25-30 minutes of hard work. Don't put two rests in a row.
- Light day / day before a meet / taper: shorter, crisp drilling, situational and short live, no hard conditioning, finish with a team talk.
- Youth / beginners: more games, shorter blocks (≤8 minutes), more water.
- Conditioning day: more conditioning, but still warm-up first and cool-down last.
- Respect every explicit number the coach says (total time, number of goes, minutes per station, number of drills) exactly.
- Use the coach's wording. Prefer library drills; invent a drill (drillId null) only when the coach names something not in the library.
`;

const FORMAT = `
BLOCK TYPES:
- {"type":"drill","drillId":"<library id or null>","title":"...","category":"<category>","minutes":5,"description":"optional short cue line","switchAtHalf":false}
- {"type":"rest","minutes":1,"title":"Water"}
- {"type":"goes","title":"Live Goes","category":"Live","rounds":3,"workSec":120,"restSec":60,"description":"optional situation","switchAtHalf":false}
- {"type":"rotation","mode":"rotate","title":"Stations","stationMinutes":5,"transitionSec":30,"stations":[{"drillId":"...","title":"..."}]}

RESPOND WITH JSON ONLY. Either questions (only if truly needed, max 2):
{"status":"questions","questions":[{"id":"q1","question":"...","options":["...","..."]}]}
or a plan. Fill "analysis" FIRST and build the sections from it:
{"status":"plan",
 "analysis":{
   "requested":[{"item":"what the coach asked for, in their words","coveredBy":"title of the block that covers it"}],
   "totalMinutes":90,
   "dayType":"normal | light | conditioning | youth | meet-prep | other",
   "budget":[{"phase":"Warm-up","minutes":12},{"phase":"Technique","minutes":35}]
 },
 "title":"short practice name","focus":"one line focus of the day",
 "sections":[{"name":"Warm-up","why":"one short sentence","blocks":[ ...blocks... ]}]}
`;

let modelCache = null;
async function getModel() {
  if (modelCache) return modelCache;
  if (!isFirebase || !store.app) throw new Error('local');
  const ai = await import(`${FIREBASE_SDK}/firebase-ai.js`);
  modelCache = { ai, inst: ai.getAI(store.app, { backend: new ai.GoogleAIBackend() }) };
  return modelCache;
}
async function generate(prompt) {
  const { ai, inst } = await getModel();
  let lastErr;
  for (const name of AI_MODELS) {
    try {
      const model = ai.getGenerativeModel(inst, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } });
      const res = await model.generateContent(prompt);
      return JSON.parse(res.response.text().replace(/^```json\s*|```\s*$/g, ''));
    } catch (e) {
      lastErr = e;
      if (/not found|404|unsupported|does not exist|is not supported/i.test(String(e.message || e))) continue;
      throw e;
    }
  }
  throw lastErr;
}

function libraryText(drills) {
  return drills.map(d => `${d.id} | ${d.title} | ${d.category} | ${Math.round(d.durationSec / 60)}m${d.type === 'series' ? ' | ROUTINE, fixed length, add as a drill block with this drillId' : d.description ? ' | ' + d.description : ''}`).join('\n');
}

function planPrompt(drills, history, text, current) {
  return `You are the head coach's practice planner for Bluejays Girls Wrestling ("Champion Making Process").
Build the best possible practice from what the coach says, like an experienced wrestling coach would.
${PRINCIPLES}
DRILL LIBRARY (id | title | category | default minutes | notes):
${libraryText(drills)}

CATEGORIES: ${CATEGORIES.map(c => c.id).join(', ')}
Start time is 3:30 PM unless the coach says otherwise. If no length is given, assume 90 minutes and don't ask.
Only ask a question if the request truly can't be planned without it.
${FORMAT}
${current ? `CURRENT PLAN (the coach wants changes; keep everything they didn't mention):\n${JSON.stringify(current)}\n` : ''}
CONVERSATION:
${history.map(h => `${h.role.toUpperCase()}: ${h.text}`).join('\n')}
COACH: ${text}`;
}

function fixPrompt(drills, history, plan, problems) {
  return `You are the practice planner for Bluejays Girls Wrestling. Your last plan has problems. Fix ALL of them and return the full corrected plan in the same JSON format.
PROBLEMS:
${problems.map(p => '- ' + p).join('\n')}
${PRINCIPLES}
DRILL LIBRARY (id | title | category | default minutes | notes):
${libraryText(drills)}
${FORMAT}
WHAT THE COACH SAID:
${history.filter(h => h.role === 'coach').map(h => h.text).join('\n')}
YOUR LAST PLAN:
${JSON.stringify(plan)}`;
}

// ---- Plan → app blocks -----------------------------------------------------
const num = (v, d) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : d;
function toBlocks(plan, drills) {
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  const byTitle = Object.fromEntries(drills.map(d => [d.title.toLowerCase(), d]));
  const find = (b) => byId[b.drillId] || byTitle[(b.title || '').toLowerCase()];
  const cat = (c) => CATEGORIES.some(x => x.id === c) ? c : 'Neutral';
  const sec = (m, def) => Math.max(15, Math.round(num(m, def) * 60 / 15) * 15);
  const raw = plan.sections ? plan.sections.flatMap(s => (s.blocks || []).map(b => ({ ...b, _section: s.name }))) : (plan.blocks || []);
  return raw.map(b => {
    let out;
    if (b.type === 'rest') out = { ...makeRest(sec(b.minutes, 1)), title: b.title || 'Water' };
    else if (b.type === 'goes') out = { id: newId(), type: 'goes', title: b.title || 'Live Goes', category: cat(b.category || 'Live'), description: b.description || '', cues: [],
      rounds: Math.max(1, Math.min(30, Math.round(num(b.rounds, 3)))), workSec: Math.max(15, Math.round(num(b.workSec, 120))), restSec: Math.max(0, Math.round(num(b.restSec, 60))), switchAtHalf: !!b.switchAtHalf };
    else if (b.type === 'rotation') {
      const st = (b.stations || []).slice(0, 8).map(s => { const d = find(s); return { title: d?.title || s.title || 'Station', description: d?.description || s.description || '', category: d?.category || 'Station', drillId: d?.id || null }; });
      while (st.length < 2) st.push({ title: `Station ${st.length + 1}`, description: '', category: 'Station' });
      out = { id: newId(), type: 'rotation', mode: b.mode === 'split' ? 'split' : 'rotate', title: b.title || 'Stations', category: 'Station', description: '',
        stationSec: sec(b.stationMinutes, 5), transitionSec: Math.max(0, Math.round(num(b.transitionSec, 30))), stations: st };
    } else {
      const d = find(b);
      if (d?.type === 'series') out = drillToBlock(d);
      else out = { id: newId(), type: 'drill', title: d?.title || b.title || 'Drill', category: d?.category || cat(b.category), description: b.description || d?.description || '',
        cues: d?.cues || [], durationSec: sec(b.minutes, (d?.durationSec || 300) / 60), switchAtHalf: !!b.switchAtHalf, drillId: d?.id || null, videoUrl: d?.videoUrl || '' };
    }
    out._section = b._section || '';
    return out;
  });
}

// ---- CHECK: validate and repair ------------------------------------------
const PHASE = { 'Team Talk': 0, 'Warm-up': 1, Neutral: 3, Top: 4, Bottom: 4, Specials: 4, Station: 4, Situational: 5, Live: 6, Games: 7, Conditioning: 7, 'Cool Down': 8, Rest: -1 };
const phaseOf = (b) => b.type === 'goes' ? 6 : b.type === 'rotation' ? 4 : PHASE[b.category] ?? 4;

// Rescale flexible drill blocks so the total hits the target. Returns problems it couldn't fix.
function check(blocks, plan, targetMin) {
  const problems = [];
  const total = () => blocks.reduce((s, b) => s + blockDuration(b), 0) / 60;
  if (!blocks.length) return ['The plan has no blocks.'];
  if (targetMin) {
    const flex = blocks.filter(b => b.type === 'drill' && !b.holdAtEnd);
    let diff = targetMin - total();
    if (Math.abs(diff) > 1 && flex.length) {
      const flexMin = flex.reduce((s, b) => s + b.durationSec / 60, 0);
      const f = Math.max(0.6, Math.min(1.5, (flexMin + diff) / flexMin));
      flex.forEach(b => { b.durationSec = Math.max(120, Math.min(20 * 60, Math.round(b.durationSec * f / 30) * 30)); });
      diff = targetMin - total();
      // fine-tune on the longest flexible drill
      const big = flex.slice().sort((a, b) => b.durationSec - a.durationSec)[0];
      if (big && Math.abs(diff) > 0.5) big.durationSec = Math.max(120, big.durationSec + Math.round(diff * 2) * 30);
    }
    if (Math.abs(targetMin - total()) > 2) problems.push(`Total is ${Math.round(total())} minutes but the coach wants ${targetMin}. Adjust block lengths, rounds or add/remove blocks.`);
  }
  const work = blocks.filter(b => b.type !== 'rest');
  if (work.length > 2) {
    const first = work[0], last = work[work.length - 1];
    if (!['Warm-up', 'Team Talk'].includes(first.category) && !/warm/i.test(first.title)) problems.push('The practice should start with a warm-up.');
    if (!['Cool Down', 'Team Talk'].includes(last.category) && total() >= 40) problems.push('The practice should end with a cool down (or a closing huddle).');
    const iTech = work.findIndex(b => [3, 4].includes(phaseOf(b))), iCond = work.findIndex(b => b.category === 'Conditioning');
    if (iCond >= 0 && iTech >= 0 && iCond < iTech) problems.push('Conditioning is placed before technique. Move technique earlier.');
  }
  for (let i = 1; i < blocks.length; i++) if (blocks[i].type === 'rest' && blocks[i - 1].type === 'rest') { blocks.splice(i, 1); i--; }
  // Water: insert a 1:00 break before any block that would push past ~32 min of hard work
  let since = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'rest' || ['Cool Down', 'Team Talk'].includes(b.category)) { if (b.type === 'rest') since = 0; continue; }
    const len = blockDuration(b) / 60;
    if (since > 0 && since + len > 32) { blocks.splice(i, 0, { ...makeRest(60), title: 'Water', _section: b._section }); since = 0; i++; }
    since += len;
  }
  if (targetMin && Math.abs(targetMin - total()) > 1) { const flex = blocks.filter(b => b.type === 'drill' && !b.holdAtEnd).sort((a, b) => b.durationSec - a.durationSec)[0];
    if (flex) flex.durationSec = Math.max(120, flex.durationSec + Math.round((targetMin - total()) * 2) * 30); }
  // requested items must be covered
  const titles = blocks.map(b => (b.title + ' ' + (b.stations || []).map(s => s.title).join(' ')).toLowerCase());
  (plan.analysis?.requested || []).forEach(r => {
    const by = (r.coveredBy || '').toLowerCase().trim();
    if (!by || !titles.some(t => t.includes(by) || by.includes(t.split(' ')[0]))) problems.push(`The coach asked for "${r.item}" but no block clearly covers it.`);
  });
  const seen = new Set();
  blocks.forEach(b => { if (b.type === 'drill' && b.drillId) { if (seen.has(b.drillId)) problems.push(`"${b.title}" appears twice. Use a different drill or merge them.`); seen.add(b.drillId); } });
  return problems;
}

// ---- Keyword fallback (no AI) ----------------------------------------------
function localPlan(text, drills) {
  const t = text.toLowerCase();
  const total = (() => { let m = t.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)/); if (m) return Math.round(+m[1] * 60); m = t.match(/(\d+)\s*(minutes?|mins?)\b(?!\s*(each|per|a piece))/); return m ? +m[1] : 90; })();
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const mentioned = drills.filter(d => { const w = words(d.title); return w.length && w.every(x => t.includes(x)); });
  const blocks = [];
  const add = (d, min) => blocks.push({ type: 'drill', drillId: d.id, title: d.title, category: d.category, minutes: d.type === 'series' ? d.durationSec / 60 : (min ?? d.durationSec / 60) });
  const warm = drills.find(d => d.id === 'r001') || drills.find(d => d.id === 'w1'); if (warm && !mentioned.includes(warm)) add(warm, 10);
  mentioned.forEach(d => add(d));
  const nLive = (t.match(/(\d+)\s*(live|goes|situation)/) || [])[1];
  if (/live|goes|wrestl/.test(t)) blocks.push({ type: 'goes', title: 'Live Goes', category: 'Live', rounds: nLive ? Math.min(+nLive, 15) : 4, workSec: 120, restSec: 60 });
  const nSt = (t.match(/(\d+)\s*(stations?|groups?)/) || [])[1];
  if (nSt || /station|rotation/.test(t)) { const per = (t.match(/(\d+)\s*min\w*\s*(each|per|a piece)/) || [])[1];
    blocks.push({ type: 'rotation', mode: 'rotate', stationMinutes: per ? +per : 5, transitionSec: 30, stations: drills.filter(d => ['Neutral', 'Top', 'Bottom'].includes(d.category)).slice(0, nSt ? +nSt : 4).map(d => ({ drillId: d.id, title: d.title })) }); }
  if (/condition|sprint/.test(t) && !mentioned.some(d => d.category === 'Conditioning')) add(drills.find(d => d.id === 'c1') || drills[0], 10);
  const cool = drills.find(d => d.id === 'cd1'); if (cool) add(cool, 5);
  const phase = (b) => b.type === 'rotation' ? 4 : b.type === 'goes' ? 6 : PHASE[b.category] ?? 4;
  blocks.sort((a, b) => phase(a) - phase(b));
  return { status: 'plan', title: 'Dictated practice', focus: text.slice(0, 120), analysis: { totalMinutes: total, requested: [] }, sections: [{ name: 'Practice', why: 'Built from keywords. Check it over.', blocks }] };
}

// ---- UI --------------------------------------------------------------------
export async function openDictate(user, onCreate) {
  const drills = await store.listDrills();
  const history = [];
  let plan = null, practice = null, busy = false, usedFallback = false, notes = [];
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  const inputHTML = (ph) => `<div class="dict-in"><textarea class="input" id="dx" rows="4" placeholder="${esc(ph)}"></textarea>
    ${R ? '<button class="btn icon mic" data-act="mic" id="mic" title="Talk">🎤</button>' : ''}</div>
    <div class="small muted" style="margin-top:6px">${R ? 'Tap 🎤 and talk, or' : 'Tap the microphone on your keyboard to talk, or'} type it out. Say how long, what positions, and anything you definitely want.</div>`;
  const first = () => `${!isFirebase ? '<div class="small" style="color:#fde68a;margin-bottom:8px">Local Demo mode: AI is off, so this uses the simple keyword builder.</div>' : ''}
    ${inputHTML('e.g. "90 minutes. Focus on finishing singles and riding legs. 4 stations, 6 minutes each. 8 live goes at the end, then sprints."')}
    <div class="row wrap" style="gap:6px;margin-top:10px">${['75 minutes, single legs and cradles, 6 live goes, sprints', 'Light day before Saturday\'s tournament, 60 minutes', 'Youth practice, 60 minutes, lots of games', 'Group split day, 4 stations, 90 minutes'].map(x => `<button class="chip" data-act="ex" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  const questionsHTML = (qs) => `<div class="stack">${qs.map(q => `<div class="card" style="background:#0d1428"><b>${esc(q.question)}</b>
      <div class="row wrap" style="gap:6px;margin-top:8px">${(q.options || []).map(o => `<button class="chip" data-act="opt" data-q="${esc(q.id)}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <input class="input" data-qa="${esc(q.id)}" placeholder="Or type an answer" style="margin-top:8px"></div>`).join('')}</div>`;
  const planHTML = () => {
    const a = plan.analysis || {};
    const secs = (plan.sections || []).map(s => ({ ...s, min: practice.blocks.filter(b => b._section === s.name).reduce((x, b) => x + blockDuration(b), 0) / 60 }));
    return `<div class="row wrap" style="gap:8px;margin-bottom:10px"><span class="badge green">${Math.round(practiceDuration(practice) / 60)} min</span><span class="badge">${practice.blocks.length} blocks</span>
        ${a.dayType && a.dayType !== 'normal' ? `<span class="badge blue">${esc(a.dayType)} day</span>` : ''}
        ${usedFallback ? '<span class="badge gold">Built without AI, check it over</span>' : notes.length ? `<span class="badge gold" title="${esc(notes.join(' | '))}">${notes.length} thing(s) to double-check</span>` : '<span class="badge green">✓ Checked</span>'}</div>
      ${!usedFallback && secs.length ? `<div class="card" style="background:#0d1428;margin-bottom:12px"><div class="tiny" style="margin-bottom:8px">How it's built</div>
        ${secs.map(s => `<div class="row" style="gap:10px;padding:4px 0"><b style="min-width:120px">${esc(s.name)}</b><span class="muted small grow">${esc(s.why || '')}</span><span class="small">${Math.round(s.min)}m</span></div>`).join('')}
        ${(a.requested || []).length ? `<div class="tiny" style="margin:10px 0 6px">You asked for</div>${a.requested.map(r => `<div class="small">✓ ${esc(r.item)} <span class="muted">→ ${esc(r.coveredBy || '')}</span></div>`).join('')}` : ''}
        ${notes.length ? `<div class="tiny" style="margin:10px 0 6px;color:#fde68a">Double-check</div>${notes.map(n => `<div class="small" style="color:#fde68a">• ${esc(n)}</div>`).join('')}` : ''}</div>` : ''}
      ${readOnlyPractice(practice)}
      <div class="card" style="margin-top:12px;background:#0d1428"><div class="tiny" style="margin-bottom:6px">Want changes? Say it</div>${inputHTML('e.g. "swap cradles for tilts and make the goes 90 seconds"')}</div>`;
  };
  const footer = (stage) => stage === 'plan'
    ? `<button class="btn" data-act="revise">Update plan</button><button class="btn" data-act="edit">Save & edit</button><button class="btn go lg" data-act="run">Save & run ▶</button>`
    : stage === 'q' ? `<button class="btn primary lg" data-act="answer">Continue</button>` : `<button class="btn primary lg" data-act="build">Build practice</button>`;

  const m = modal({ title: '🎤 Dictate a practice', wide: true, body: first(), footer: footer('in'),
    onAction: async (a, el, w, close) => {
      if (a === 'ex') { w.querySelector('#dx').value = el.dataset.x; return; }
      if (a === 'mic') return toggleMic(w);
      if (a === 'opt') { w.querySelector(`[data-qa="${el.dataset.q}"]`).value = el.dataset.o; w.querySelectorAll(`[data-act=opt][data-q="${el.dataset.q}"]`).forEach(c => c.classList.toggle('on', c === el)); return; }
      if (busy) return;
      if (a === 'build' || a === 'revise') { const text = (w.querySelector('#dx')?.value || '').trim(); if (!text) return toast('Say or type what you want first', 'error'); await ask(w, text); }
      if (a === 'answer') await ask(w, [...w.querySelectorAll('[data-qa]')].map(i => `${i.closest('.card').querySelector('b').textContent} → ${i.value.trim() || 'you decide'}`).join('; '));
      if (a === 'edit' || a === 'run') {
        stopMic();
        const p = { ...practice, blocks: practice.blocks.map(({ _section, ...b }) => b) };
        await store.savePractice(p); close(); toast('Practice saved', 'success'); onCreate && onCreate(p, a === 'run');
      }
    }, onClose: stopMic });

  function stopMic() { try { rec && rec.stop(); } catch (e) {} rec = null; m.el.querySelector('#mic')?.classList.remove('rec'); }
  function toggleMic(w) {
    if (rec) return stopMic();
    rec = new R(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
    const ta = w.querySelector('#dx'); const base = ta.value ? ta.value + ' ' : '';
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; ta.value = base + s; };
    rec.onerror = (e) => { if (e.error !== 'aborted') toast('Mic: ' + e.error, 'error'); stopMic(); };
    rec.onend = () => stopMic();
    try { rec.start(); w.querySelector('#mic').classList.add('rec'); } catch (e) { toast('Mic not available', 'error'); }
  }

  async function ask(w, text) {
    stopMic(); busy = true;
    const body = w.querySelector('.mb'), foot = w.querySelector('.mf'), prev = body.innerHTML;
    const status = (s) => { foot.innerHTML = `<span class="muted">${esc(s)}</span>`; };
    try {
      let res; usedFallback = false; notes = [];
      status('Planning the practice…');
      try { res = await generate(planPrompt(drills, history, text, plan && plan.status === 'plan' ? { title: plan.title, sections: plan.sections } : null)); }
      catch (e) {
        if (isFirebase && e.message !== 'local') { console.warn(e); toast('AI unavailable (' + String(e.code || e.message).slice(0, 90) + '). Used the keyword builder.', 'error'); }
        res = localPlan(history.filter(h => h.role === 'coach').map(h => h.text).concat(text).join('. '), drills); usedFallback = true;
      }
      history.push({ role: 'coach', text });
      if (res.status === 'questions' && res.questions?.length) {
        history.push({ role: 'planner', text: 'Asked: ' + res.questions.map(q => q.question).join(' | ') });
        body.innerHTML = questionsHTML(res.questions.slice(0, 2)); foot.innerHTML = footer('q'); busy = false; return;
      }
      const target = Math.round(num(res.analysis?.totalMinutes, 0)) || null;
      let blocks = toBlocks(res, drills);
      let problems = check(blocks, res, target);
      if (problems.length && !usedFallback) {
        status('Checking the plan and fixing a few things…');
        try {
          const fixed = await generate(fixPrompt(drills, history, res, problems));
          if (fixed?.status === 'plan') { const b2 = toBlocks(fixed, drills); const p2 = check(b2, fixed, target); if (b2.length && p2.length <= problems.length) { res = fixed; blocks = b2; problems = p2; } }
        } catch (e) { console.warn('fix pass failed', e); }
      }
      notes = problems;
      if (!blocks.length) throw new Error('The plan came back empty. Try saying it another way.');
      plan = res;
      history.push({ role: 'planner', text: 'Proposed a plan.' });
      const start = practice?.startTime || '15:30';
      practice = { ...(practice || {}), title: (res.title || 'Dictated practice').slice(0, 120), notes: res.focus || '', blocks, date: practice?.date || todayStr(),
        startTime: start, endTime: addMin(start, Math.round(practiceDuration({ blocks }) / 60)), levels: [], visibility: 'team' };
      body.innerHTML = planHTML(); foot.innerHTML = footer('plan'); body.scrollTop = 0;
    } catch (e) { body.innerHTML = prev; foot.innerHTML = footer(plan ? 'plan' : 'in'); toast(e.message, 'error'); }
    busy = false;
  }
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addMin = (hhmm, m) => { const [h, mi] = hhmm.split(':').map(Number); const t = h * 60 + mi + Math.round(m); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export { localPlan, toBlocks, check, PRINCIPLES };
