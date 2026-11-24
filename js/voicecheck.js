// Voice / typed bulk check-in: "Kenzie 121.4, Ava 98, Zoe Carter one thirty two"
// → [{ athlete, weight }]. Pure parsing lives here so it can be unit-tested.
const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNumWord = (t) => t in ONES || t in TENS || t === 'hundred' || t === 'point' || t === 'and';

// Turn spoken number words into digits: "one twenty one" → 121, "one hundred five point five" → 105.5, "ninety eight" → 98
function wordsToNumber(ws) {
  let [whole, frac] = (() => { const k = ws.indexOf('point'); return k < 0 ? [ws, []] : [ws.slice(0, k), ws.slice(k + 1)]; })();
  whole = whole.filter(w => w !== 'and');
  // group into chunks: tens+ones pairs ("twenty one") and lone numbers
  const chunks = []; let hundred = false;
  for (let i = 0; i < whole.length; i++) {
    const w = whole[i];
    if (w === 'hundred') { hundred = true; continue; }
    if (w in TENS) { const nx = whole[i + 1]; if (nx in ONES && ONES[nx] < 10) { chunks.push(TENS[w] + ONES[nx]); i++; } else chunks.push(TENS[w]); }
    else if (/^\d+(\.\d+)?$/.test(w)) chunks.push(Number(w));
    else chunks.push(ONES[w]);
  }
  let n;
  if (hundred) n = (chunks[0] || 1) * 100 + (chunks[1] || 0);               // "one hundred twenty" / "hundred and five"
  else if (chunks.length === 1) n = chunks[0];                               // "ninety eight"
  else if (chunks.length === 2 && chunks[0] < 10) n = chunks[0] * 100 + chunks[1]; // "one twenty one" → 121, "one oh five" → 105
  else n = Number(chunks.join(''));
  if (frac.length) { const f = frac.map(w => /^\d$/.test(w) ? w : String(ONES[w] ?? '')).join(''); if (f) n = Number(`${n}.${f}`); }
  return n;
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.' ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const close = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (lev(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1) || a.startsWith(b) || b.startsWith(a)));

// Find which athletes a spoken name means. Returns a list (empty = no match, >1 = ambiguous).
export function matchName(words, athletes) {
  const ws = norm(words).split(' ').filter(Boolean); if (!ws.length) return [];
  const score = (a) => { const f = norm(a.first), l = norm(a.last || ''), k = norm(a.nick || '');
    let s = 0; for (const w of ws) { if (w === f || (k && w === k)) s += 3; else if (w === l) s += 3; else if (close(w, f) || (k && close(w, k))) s += 2; else if (l && close(w, l)) s += 2; }
    return s; };
  const scored = athletes.map(a => ({ a, s: score(a) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s);
  if (!scored.length) return [];
  const top = scored[0].s; return scored.filter(x => x.s === top).map(x => x.a);
}

// Split the transcript into name→weight pairs.
export function parseWeighins(text, athletes) {
  const toks = norm(String(text).replace(/(\d),(\d)/g, '$1$2').replace(/(\d)\s*(lbs?|pounds?)\b/gi, '$1')).replace(/\b(lbs?|pounds?|weighs?|weighed|is|at|she's|she is|next)\b/g, ' ').split(' ').filter(Boolean);
  const out = []; let name = [], num = [];
  const flush = () => {
    if (!name.length && !num.length) return;
    const weight = num.length ? wordsToNumber(num) : null;
    const matches = name.length ? matchName(name.join(' '), athletes) : [];
    out.push({ said: name.join(' '), weight: Number.isFinite(weight) && weight >= 40 && weight <= 400 ? Math.round(weight * 10) / 10 : null, heard: num.join(' '), matches, athlete: matches.length === 1 ? matches[0] : null });
    name = []; num = [];
  };
  for (const t of toks) {
    const numeric = /^\d+(\.\d+)?$/.test(t) || isNumWord(t);
    if (numeric) num.push(t);
    else { if (num.length) flush(); name.push(t); }
  }
  flush();
  return out.filter(r => r.said || r.weight);
}

export const speechSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
// One phrase per recognition session, restarted until the coach taps stop. Continuous mode on
// Android Chrome repeats words ("kenzie kenzie 121 kenzie 121"), so it isn't used.
export function listen({ onText, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let committed = '', stopped = false, r = null, lastErr = null, quiet = 0;
  const start = () => {
    r = new SR(); r.lang = 'en-US'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    let phrase = '';
    r.onresult = (e) => { const res = e.results[e.results.length - 1]; phrase = res[0].transcript.trim();
      quiet = 0;
      if (res.isFinal) { committed = (committed + ' ' + phrase).trim(); phrase = ''; }
      onText((committed + ' ' + phrase).trim()); };
    r.onerror = (e) => { lastErr = e.error; if (e.error === 'no-speech' && ++quiet >= 2) stopped = true; if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') stopped = true; };
    r.onend = () => { if (phrase) { committed = (committed + ' ' + phrase).trim(); phrase = ''; onText(committed); }
      if (!stopped) { lastErr = null; try { start(); return; } catch { /* fall through */ } } onEnd(lastErr); };
    r.start();
  };
  start();
  return { stop: () => { stopped = true; try { r.stop(); } catch { onEnd(); } } };
}
