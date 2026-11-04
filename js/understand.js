// Understands coach language before the AI plans anything.
//  - Built-in wrestling shorthand ("shots", "high c", "legs", "half"…)
//  - Team aliases learned when a coach corrects a pick ("Change" in Dictate)
//  - Library titles themselves (fuzzy, plural-tolerant)
// Output: the drills the coach clearly named, which the planner must include.

// phrase → drill id. Longest phrases win, so "single leg finishes" beats "single".
export const SHORTHAND = {
  'warm up': 'r001', 'warmup': 'r001', 'warm up for success': 'r001', 'our warm up': 'r001', 'team warm up': 'r001', 'normal warm up': 'r001', 'regular warm up': 'r001', 'usual warm up': 'r001', 'same warm up': 'r001',
  'duck walk': 'n1',
  'shots': 'n2', 'shot drill': 'n2', 'penetration': 'n2', 'pen steps': 'n2', 'penetration steps': 'n2',
  'stance and motion': 'w2', 'stance motion': 'w2', 'stagger stance': 'n3',
  'snap': 'n4', 'snaps': 'n4', 'snap down': 'n4', 'snap downs': 'n4', 'head draw': 'n4',
  'treetop': 'n5', 'tree top': 'n5', 'run the pipe': 'n6', 'run pipe': 'n6', 'post and run': 'n7', 'post n run': 'n7',
  'high c': 'n8', 'high cs': 'n8', 'high c s': 'n8', 'high crotch': 'n8', 'high crotches': 'n8', 'high c finish': 'x020', 'high crotch finish': 'x020',
  'double': 'n9', 'doubles': 'n9', 'double leg': 'n9', 'double legs': 'n9', 'knee chop': 'n9', 'blast double': 'n9',
  'fireman': 'n10', 'firemans': 'n10', "fireman's": 'n10', 'dump': 'n10',
  'throw': 'n11', 'throws': 'n11', 'head and arm': 'n11', 'hip toss': 'n11', 'back step': 'n11', 'headlock': 'n11', 'headlocks': 'n11',
  'elbow block': 'n12', 'randy lewis': 'n12',
  'ironman': 'n14', 'iron man': 'n14',
  'single': 'x021', 'singles': 'x021', 'single leg': 'x021', 'single legs': 'x021', 'finish singles': 'x021', 'finishing singles': 'x021', 'single leg finishes': 'x021',
  'sweep single': 'x018', 'low single': 'x019', 'ankle pick': 'x022', 'ankle picks': 'x022', 'duck under': 'x023', 'duck unders': 'x023',
  'arm drag': 'x024', 'arm drags': 'x024', 'two on one': 'x025', '2 on 1': 'x025', 'russian': 'x025', 'russian tie': 'x025',
  'front headlock': 'x026', 'front head lock': 'x026', 'cement mixer': 'x026', 'chin whip': 'x026',
  'go behind': 'x027', 'go behinds': 'x027', 'sprawl and go behind': 'x028', 'reshot': 'x029', 're shots': 'x029', 'reshots': 'x029',
  'shot defense': 'x030', 'downblock': 'x030', 'down block': 'x030', 'single leg defense': 'x031', 'whizzer': 'x031',
  'inside trip': 'x032', 'underhook': 'x034', 'underhooks': 'x034', 'snap and spin': 'x035', 'chain wrestling': 'x036',
  'hand fight': 'x017', 'hand fighting': 'x017', 'ties': 'x017', 'collar tie': 'x017', 'level change': 'x016', 'level changes': 'x016',
  'spiral': 't1', 'spiral ride': 't1', 'legs': 't2', 'leg ride': 't2', 'leg riding': 't2', 'riding legs': 't2', 'legs in': 'x067',
  'crab ride': 't3', 'reinhardt': 't3', 'ankle breakdown': 't4', 'ankle breakdowns': 't4', 'breakdown': 'x039', 'breakdowns': 'x039',
  'cradle': 't5', 'cradles': 't5', 'cross face cradle': 'x046', 'near side cradle': 'x047', 'far side cradle': 't5',
  'half': 't6', 'halfs': 't6', 'halves': 't6', 'half nelson': 't6', 'power half': 't6',
  'bar arm': 't7', 'bar arms': 't7', 'pete bar': 't7', 'coffee grinder': 't8', 'guillotine': 't8', 'bundle': 't9',
  'tight waist': 'x040', 'wrist ride': 'x041', 'wrist control': 'x041', 'arm bar': 'x042', 'chicken wing': 'x042',
  'tilt': 'x043', 'tilts': 'x043', 'turk': 'x044', 'turks': 'x044', 'claw ride': 'x045', 'mat return': 'x048', 'mat returns': 'x048',
  'riding': 'x049', 'ride': 'x049', 'pinning combos': 'x050', 'pinning combinations': 'x050', 'back points': 'x051', 'turns': 'x051',
  'build base': 'b1', 'base': 'b1', 'stand up': 'b2', 'stand ups': 'b2', 'standups': 'b2', 'sit out': 'b3', 'sit outs': 'b3', 'popcorn': 'b3',
  'hip heist': 'b4', 'hip heists': 'b4', 'switch': 'b5', 'switches': 'b5', 'roll': 'b6', 'rolls': 'b6',
  'granby': 'x054', 'granbys': 'x054', 'granby roll': 'x054', 'peterson': 'x055', 'peterson roll': 'x055',
  'tripod': 'x056', 'hand control': 'x052', 'escapes': 'x057', 'escape': 'x057', 'reversal': 'x058', 'reversals': 'x058',
  'bottom chain': 'x059', 'off your back': 'x061', 'off the back': 'x061', 'bridge': 'x007', 'bridges': 'x007', 'bridging': 'x007',
  'ride out': 'x063', 'ride outs': 'x063', 'overtime': 'x064', 'sudden victory': 'x064', 'tie breaker': 'x065', 'scramble': 'x077', 'scrambles': 'x077',
  'edge of the mat': 'x037', 'edge of mat': 'x037', 'out of bounds': 'x068',
  'live takedowns': 'x071', 'takedowns live': 'x071', 'live top bottom': 'x072', 'live top and bottom': 'x072', 'shark bait': 'x073',
  'match sim': 'x075', 'match simulation': 'x075', 'full match': 'x075', 'mat wars': 'x076', 'short goes': 'x074', 'situations': 'n13', 'situation drills': 'n13',
  'sprints': 'c1', 'sprint': 'c1', 'ropes': 'c2', 'rope climb': 'x102', 'chair dips': 'c2', 'run and lift': 'c3', 'lifting': 'c3',
  'sprawl sprints': 'x098', 'burpee': 'x099', 'burpees': 'x099', 'bear crawl': 'x100', 'bear crawls': 'x100', 'buddy carry': 'x101', 'buddy carries': 'x101',
  'stairs': 'x103', 'bleachers': 'x103', 'tabata': 'x106', 'circuit': 'x107', 'core': 'x109', 'abs': 'x109', 'neck': 'x108', 'grip': 'x111',
  'stretch': 'cd1', 'stretching': 'cd1', 'cool down': 'cd1', 'cooldown': 'cd1', 'foam roll': 'cd4', 'foam rolling': 'cd4', 'yoga': 'x113',
  'breathing': 'cd7', 'visualization': 'cd5', 'mental': 'cd5',
  'wall sit': 'x078', 'wall sits': 'x078', 'last one standing': 'x078', 'sharks and minnows': 'x079', 'sharks': 'x079', 'dodgeball': 'x080', 'dodge ball': 'x080',
  'queen of the mat': 'x081', 'king of the mat': 'x081', 'flag wrestling': 'x082', 'flag': 'x082', 'shoe wrestling': 'x083', 'shoe': 'x083',
  'line drag': 'x084', 'drag across the line': 'x084', 'sumo': 'x085', 'royal rumble': 'x086', 'knee wrestling': 'x086', 'knee tag': 'x087',
  'flip the turtle': 'x088', 'turtle': 'x088', 'bulldog': 'x089', 'british bulldog': 'x089', 'rooster': 'x090', 'rooster fights': 'x090',
  'crab soccer': 'x091', 'bear crawl tag': 'x092', 'steal the bacon': 'x093', 'red light green light': 'x094', 'simon says': 'x095', 'tug of war': 'x096',
  'huddle': 'x116', 'opening huddle': 'x116', 'closing huddle': 'x121', 'film': 'x119', 'film review': 'x119', 'weigh in': 'x120', 'weigh ins': 'x120', 'skin check': 'x120',
  'chalk talk': 's4', 'mental prep': 's4', 'demo': 'x118', 'technique demo': 'x118', 'goal setting': 'x117', 'goals': 'x117',
  'jonny jones': 's1', 'johnny jones': 's1', 'talvi': 's2', 'vania': 's3',
};

export const normalize = (s) => ' ' + String(s).toLowerCase()
  .replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(\w+?)(ies)\b/g, '$1y').replace(/\s+/g, ' ').trim() + ' ';
// light plural folding so "cradles" ~ "cradle"
const fold = (s) => s.replace(/(\w{3,}?)(es|s)\b/g, '$1');

const STOP = new Set(['the', 'and', 'with', 'from', 'drill', 'drills', 'variations', 'light', 'up', 'a', 'of', 'to', 'in', 'on']);

// aliases: [{phrase, drillId}] learned by the team
export function matchDrills(text, drills, aliases = []) {
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  const t = fold(normalize(text));
  const table = [];
  aliases.forEach(a => byId[a.drillId] && table.push([a.phrase, a.drillId, 'team']));
  Object.entries(SHORTHAND).forEach(([p, id]) => byId[id] && table.push([p, id, 'shorthand']));
  drills.forEach(d => table.push([d.title, d.id, 'title']));
  // longest first, so specific phrases claim their words before generic ones
  table.sort((a, b) => normalize(b[0]).length - normalize(a[0]).length);
  let rest = t; const found = [];
  for (const [phrase, id, src] of table) {
    const p = fold(normalize(phrase));
    if (src === 'title') {
      // title words (ignoring filler) must all appear
      const words = [...new Set(p.trim().split(' ').filter(w => w.length > 2 && !STOP.has(w)))];
      if (!words.length || (words.length === 1 && words[0].length < 5)) continue; // too vague alone
      // all title words must appear close together (not scattered across the sentence)
      const toks = rest.trim().split(' ');
      const pos = words.map(w => toks.indexOf(w));
      if (pos.some(x => x < 0) || Math.max(...pos) - Math.min(...pos) > words.length + 1) continue;
      words.forEach(w => { rest = rest.replace(' ' + w + ' ', ' · '); });
    } else {
      if (p.trim().length < 3 || !rest.includes(p)) continue;
      rest = rest.replace(p, ' · ');
    }
    if (!found.some(f => f.drill.id === id)) found.push({ phrase, drill: byId[id], source: src });
  }
  return found;
}

// Most similar past examples by word overlap (simple, fast, no server needed)
export function similar(text, examples, k = 3) {
  const words = (s) => new Set(fold(normalize(s)).trim().split(' ').filter(w => w.length > 2 && !STOP.has(w)));
  const q = words(text);
  return examples.map(e => { const w = words(e.transcript || ''); let o = 0; q.forEach(x => { if (w.has(x)) o++; }); return { e, score: o / Math.sqrt((w.size || 1) * (q.size || 1)) }; })
    .filter(x => x.score > 0.15).sort((a, b) => b.score - a.score).slice(0, k).map(x => x.e);
}

// Coaching fixes: when a coach describes a PROBLEM ("we kept getting turned"),
// these are the drills that fix it, in a sensible teaching order.
export const FIXES = [
  { problem: 'Getting turned or pinned from bottom', re: /\b(get(ting)?|got|been|were|keep\w*)\s+(turned|pinned|put on (our|their|her) backs?|stuck on (our|their|her) backs?)|turned last|pinned last|giving up back points|fight(ing)? off (our|the|her) back|off (our|their|her) backs?\b/,
    position: 'Bottom', drills: ['b1', 'x052', 'x060', 'x007', 'x061', 'b4', 'b2', 'x057'],
    plan: 'Defend first, then get out: build base and hand control, cradle defense, bridging and fighting off the back, hip heists, then stand-ups/escapes, then short live goes from bottom.' },
  { problem: 'Getting ridden out / can\'t escape', re: /(can'?t|couldn'?t|could not|cannot|not)\s+(get out|escape)|ridden out|stuck on bottom|held down|no escapes?/,
    position: 'Bottom', drills: ['b1', 'x052', 'b2', 'x053', 'b5', 'b3', 'x059', 'x057'],
    plan: 'Hand control and base, then stand-up and finishes, switch and sit-out, chain them, then escape-in-30 situations.' },
  { problem: 'Giving up takedowns', re: /(giving up|gave up|getting|got)\s+(taken down|takedowns|shot on|scored on)|bad (shot )?defense|getting shot on|defend(ing)? shots?/,
    position: 'Neutral', drills: ['x015', 'x017', 'x030', 'x031', 'x028', 'x027'],
    plan: 'Stance and hand fighting, then shot defense and single-leg defense, then sprawl to go-behind.' },
  { problem: 'Not finishing shots', re: /(not|aren'?t|weren'?t|couldn'?t|can'?t)\s+finish\w*|finish(ing)? (our |their )?(shots?|singles?|doubles?)/,
    position: 'Neutral', drills: ['x021', 'n6', 'n5', 'x020', 'x029', 'x036'],
    plan: 'Finishes off the single and high-c, run the pipe, treetop, then re-shots and chain wrestling.' },
  { problem: 'Not attacking / too passive', re: /(not|aren'?t|weren'?t)\s+(shooting|attacking|scoring)|too passive|stalling|no offense|didn'?t shoot/,
    position: 'Neutral', drills: ['x017', 'x016', 'n2', 'x038', 'x036'],
    plan: 'Hand fighting to create angles, level changes, penetration, high-volume shot ladders, then chain wrestling.' },
  { problem: 'Can\'t hold them down / getting escaped', re: /(can'?t|couldn'?t|not)\s+(ride|hold (them|her) down)|getting escaped|let (them|her) (out|go)|giving up escapes/,
    position: 'Top', drills: ['x039', 'x041', 'x049', 't2', 'x040', 'x063'],
    plan: 'Breakdowns and wrist control, riding pressure, legs, then ride-out situations.' },
  { problem: 'Can\'t turn / no back points', re: /(can'?t|couldn'?t|not)\s+(turn|pin|get back points)|no back points|no turns|need (more )?pins?/,
    position: 'Top', drills: ['x043', 't6', 't5', 't7', 'x050', 'x051'],
    plan: 'Tilts, halfs, cradles, bar arms, then pinning combinations and back-point holds.' },
  { problem: 'Getting tired late in matches', re: /\b(gassed|tired|ran out of gas|third period|out of shape|conditioning)\b/,
    position: 'Conditioning', drills: ['x074', 'x075', 'x098', 'n14'],
    plan: 'Short hard goes, match simulation at match pace, sprawl sprints, IRONMAN.' },
  { problem: 'Losing scrambles', re: /scrambl\w*/, position: 'Neutral', drills: ['x077', 'x066', 'x069'],
    plan: 'Front headlock scrambles, score-off-a-flurry, scramble live.' },
  { problem: 'Going out of bounds / losing on the edge', re: /edge of the mat|out of bounds|on the edge/, position: 'Neutral', drills: ['x037', 'x068'],
    plan: 'Score before going out, out-of-bounds restarts.' },
];

export function diagnose(text, drills) {
  const t = String(text).toLowerCase();
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  const day = /\b(light|easy|taper|recovery|before (the |a |our )?(meet|tournament|match|dual)|tomorrow'?s? (meet|tournament)|day before)\b/.test(t) ? 'light'
    : /\b(youth|kids|little|beginners?|first year)\b/.test(t) ? 'youth' : /\b(hard|grind|conditioning day|heavy)\b/.test(t) ? 'hard' : 'normal';
  const positions = ['bottom', 'top', 'neutral', 'feet', 'takedowns'].filter(p => new RegExp(`\\b${p}\\b`).test(t));
  const fixes = FIXES.filter(f => f.re.test(t)).map(f => ({ ...f, drills: f.drills.map(id => byId[id]).filter(Boolean) }));
  return { day, positions, fixes };
}
