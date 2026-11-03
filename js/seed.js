// Seed content carried over word-for-word from last season's prototype
// (wrestling-system-v5). Durations are the prototype's defaults, in minutes.
// Anything added this season is marked `added: true` so it's easy to tell apart.

export const CATEGORIES = [
  { id: 'Warm-up',      color: '#f59e0b', added: true },
  { id: 'Neutral',      color: '#ea580c' },
  { id: 'Top',          color: '#2563eb' },
  { id: 'Bottom',       color: '#9333ea' },
  { id: 'Live',         color: '#e11d48', added: true },
  { id: 'Conditioning', color: '#dc2626' },
  { id: 'Games',        color: '#16a34a', added: true },
  { id: 'Situational',  color: '#db2777', added: true },
  { id: 'Specials',     color: '#059669' },
  { id: 'Team Talk',    color: '#64748b', added: true },
  { id: 'Cool Down',    color: '#0891b2' },
  { id: 'Station',      color: '#ca8a04' },
  { id: 'Rest',         color: '#475569' },
];

export const LEVELS = ['Youth', 'Middle School', 'JV', 'Varsity'];

export const catColor = (cat) => (CATEGORIES.find(c => c.id === cat) || {}).color || '#4b5563';

// Every preset from the prototype library, unchanged.
export const PRESET_DRILLS = [
  // NEUTRAL
  { id: 'n1',  title: 'Duck Walk', duration: 5, category: 'Neutral' },
  { id: 'n2',  title: 'Penetration Drills', duration: 10, description: 'Double or High Crotch', category: 'Neutral' },
  { id: 'n3',  title: 'Stagger Stance/Motion', duration: 5, description: 'Head, elbow, feet', category: 'Neutral' },
  { id: 'n4',  title: 'Snap Down / Head Draw', duration: 5, category: 'Neutral' },
  { id: 'n5',  title: 'Single Leg Treetops', duration: 5, category: 'Neutral' },
  { id: 'n6',  title: 'Single Leg Run Pipes', duration: 5, category: 'Neutral' },
  { id: 'n7',  title: 'Post-n-Run', duration: 5, description: 'Creating angles from mat', category: 'Neutral' },
  { id: 'n8',  title: 'High Crotch (Variations)', duration: 10, description: 'Elbow tie, underhooks, inside/outside', category: 'Neutral' },
  { id: 'n9',  title: 'Double Leg (Lifts/Chops)', duration: 10, description: 'Kneechop, lift, turks, get to corner', category: 'Neutral' },
  { id: 'n10', title: 'Firemans / Dump / Tip', duration: 5, category: 'Neutral' },
  { id: 'n11', title: 'Throws', duration: 10, description: 'Head & arm, Hip toss, Back step', category: 'Neutral' },
  { id: 'n12', title: 'Randy Lewis Elbow Block', duration: 5, category: 'Neutral' },
  { id: 'n13', title: 'Situation Drills (Live)', duration: 15, description: 'In on a double/single', category: 'Neutral' },
  { id: 'n14', title: 'IRONMAN', duration: 8, description: 'Neutral intensity', category: 'Neutral' },
  // TOP
  { id: 't1', title: 'Spiral Ride', duration: 5, description: 'Halfs, bar arms, hooks', category: 'Top' },
  { id: 't2', title: 'Leg Riding', duration: 10, description: 'Extend opponent', category: 'Top' },
  { id: 't3', title: 'Reinhardt / Crab Ride', duration: 5, category: 'Top' },
  { id: 't4', title: 'Ankle Breakdowns', duration: 5, category: 'Top' },
  { id: 't5', title: 'Cradles', duration: 10, description: 'Near, far, cross cradle', category: 'Top' },
  { id: 't6', title: 'Half Nelson / Power Half', duration: 5, category: 'Top' },
  { id: 't7', title: 'Bar Arm / Pete Bar', duration: 5, category: 'Top' },
  { id: 't8', title: 'Coffee Grinder / Guillotine', duration: 5, category: 'Top' },
  { id: 't9', title: 'Bundle', duration: 5, category: 'Top' },
  // BOTTOM
  { id: 'b1', title: 'Build Base', duration: 5, description: 'Thumbs up, elbows in, head up', category: 'Bottom' },
  { id: 'b2', title: 'Stand Ups', duration: 5, description: 'Switches, 1/4 turns', category: 'Bottom' },
  { id: 'b3', title: 'Sit Out / Popcorn', duration: 5, category: 'Bottom' },
  { id: 'b4', title: 'Hip Heist', duration: 5, category: 'Bottom' },
  { id: 'b5', title: 'Switch', duration: 5, description: 'Standing, lift-switch', category: 'Bottom' },
  { id: 'b6', title: 'Rolls', duration: 5, description: 'Granby, Peterson, Near/Far side', category: 'Bottom' },
  // CONDITIONING
  { id: 'c1', title: 'Sprints', duration: 20, category: 'Conditioning' },
  { id: 'c2', title: 'Ropes / Chair Dips', duration: 10, category: 'Conditioning' },
  { id: 'c3', title: 'Run & Lift', duration: 15, description: 'Work till they drop', category: 'Conditioning' },
  { id: 'c4', title: 'Games', duration: 10, category: 'Conditioning' },
  // COOL DOWN
  { id: 'cd1', title: 'Partner Static Stretching', duration: 5, description: 'Post-match recovery', category: 'Cool Down' },
  { id: 'cd2', title: 'Dynamic Mobility Flow', duration: 5, description: 'Hip and shoulder openers', category: 'Cool Down' },
  { id: 'cd3', title: 'Shadow Wrestling (Light)', duration: 3, description: 'Perfect form, low intensity', category: 'Cool Down' },
  { id: 'cd4', title: 'Foam Rolling / SMR', duration: 5, description: 'Focus on legs and back', category: 'Cool Down' },
  { id: 'cd5', title: 'Mental Review / Breathing', duration: 2, description: 'Recovery focus', category: 'Cool Down' },
  // SPECIALS
  { id: 's1', title: 'Jonny Jones', duration: 5, category: 'Specials' },
  { id: 's2', title: 'Talvi – 1/4', duration: 5, category: 'Specials' },
  { id: 's3', title: 'Vania – Post', duration: 5, category: 'Specials' },
  // From the prototype's Comp Warmup / Comp Cooldown templates (they weren't in the library before)
  { id: 'w1', title: 'Dynamic Warm-up', duration: 10, category: 'Warm-up' },
  { id: 'w2', title: 'Stance & Motion', duration: 5, category: 'Warm-up' },
  { id: 'w3', title: 'Hard Speed Shots', duration: 5, category: 'Warm-up' },
  { id: 'w4', title: 'Clearance Drills', duration: 5, category: 'Warm-up' },
  { id: 's4', title: 'Mental Prep / Chalk Talk', duration: 5, category: 'Specials' },
  { id: 'cd6', title: 'Light Shadow Wrestling', duration: 3, category: 'Cool Down' },
  { id: 'cd7', title: 'Deep Breathing / Reflection', duration: 5, category: 'Cool Down' },
].map(d => ({
  id: d.id,
  title: d.title,
  category: d.category,
  description: d.description || '',
  cues: [],
  durationSec: d.duration * 60,
  levels: [],
  videoUrl: '',
  preset: true,
}));


// Added this season: a broad standard wrestling library on top of last
// season's list. Coaches can edit, delete, or add their own in the Library.
const EXTRA = [
  // WARM-UP
  ['Warm-up', 'Jog / Lap Warm-up', 5, 'Easy laps around the mat'],
  ['Warm-up', 'Karaoke / Carioca', 3, 'Hips loose, both directions'],
  ['Warm-up', 'High Knees & Butt Kicks', 3, ''],
  ['Warm-up', 'Sprawls (Warm-up)', 3, 'Hips down, feet back, head up'],
  ['Warm-up', 'Forward & Back Rolls', 3, 'Tuck chin'],
  ['Warm-up', 'Cartwheels / Round-offs', 3, ''],
  ['Warm-up', 'Bridging & Neck Bridges', 4, 'Front and back bridges'],
  ['Warm-up', 'Spin Drill', 3, 'Chest on back, keep hips low'],
  ['Warm-up', 'Shadow Wrestling', 4, 'Shots, sprawls, motion'],
  ['Warm-up', 'Hip Heist Ladder', 3, 'Both sides'],
  ['Warm-up', 'Partner Carries', 4, 'Fireman, piggyback, front carry'],
  ['Warm-up', 'Leapfrog & Crawl-unders', 3, ''],
  ['Warm-up', 'Dynamic Stretch Line', 5, 'Leg swings, lunges, arm circles'],
  ['Warm-up', 'Hand Fighting (Warm-up)', 3, 'Light pace, inside position'],
  // NEUTRAL
  ['Neutral', 'Stance Pressure', 3, 'Hold good stance while partner pushes and pulls'],
  ['Neutral', 'Level Changes', 3, 'Change levels without dropping head'],
  ['Neutral', 'Hand Fighting / Ties', 5, 'Collar tie, wrist control, two-on-one'],
  ['Neutral', 'Sweep Single', 5, 'Outside step, sweep the leg'],
  ['Neutral', 'Low Single', 5, 'Head inside, finish to the corner'],
  ['Neutral', 'High Crotch Finishes', 5, 'Run the pipe, dump, lift'],
  ['Neutral', 'Single Leg Finishes', 10, 'Run the pipe, tree top, sweep, trip'],
  ['Neutral', 'Ankle Pick', 5, 'Snap, step, pick'],
  ['Neutral', 'Duck Under', 5, 'Off the collar tie'],
  ['Neutral', 'Arm Drag', 5, 'Drag to single or go-behind'],
  ['Neutral', 'Russian Tie / Two-on-One', 5, 'Get to the leg from the two-on-one'],
  ['Neutral', 'Front Headlock Series', 10, 'Go-behind, cement mixer, chin whip'],
  ['Neutral', 'Go-Behinds', 5, 'Spin off the sprawl'],
  ['Neutral', 'Sprawl & Go-Behind', 5, 'Defend the shot, score'],
  ['Neutral', 'Re-shots', 5, 'Shot, sprawl, shoot again'],
  ['Neutral', 'Shot Defense / Downblock', 5, 'Hips, head, hands'],
  ['Neutral', 'Single Leg Defense', 5, 'Whizzer, limp leg, hop'],
  ['Neutral', 'Inside Trip', 5, ''],
  ['Neutral', 'Outside Step Single', 5, ''],
  ['Neutral', 'Underhook Series', 5, 'Underhook to single, go-behind, throw-by'],
  ['Neutral', 'Snap & Spin', 5, ''],
  ['Neutral', 'Chain Wrestling (Neutral)', 5, 'Shot to shot, keep attacking'],
  ['Neutral', 'Edge of Mat (Neutral)', 5, 'Score before going out'],
  ['Neutral', 'Shot Ladder (Speed)', 5, '10 shots each, sprint pace'],
  // TOP
  ['Top', 'Breakdowns', 5, 'Chop, tight waist, near arm'],
  ['Top', 'Tight Waist / Half', 5, ''],
  ['Top', 'Wrist Ride / Wrist Control', 5, 'Two-on-one wrist, chop'],
  ['Top', 'Arm Bar / Chicken Wing', 5, ''],
  ['Top', 'Tilts', 10, 'Near-side, far-side, ankle'],
  ['Top', 'Turk', 5, ''],
  ['Top', 'Claw Ride', 5, ''],
  ['Top', 'Cross Face Cradle', 5, ''],
  ['Top', 'Near Side Cradle', 5, ''],
  ['Top', 'Mat Returns', 5, 'Lift, trip, return to the mat'],
  ['Top', 'Riding Pressure', 5, 'Hips down, ride the hips'],
  ['Top', 'Top Pinning Combinations', 10, 'Half to arm bar, cradle chains'],
  ['Top', 'Back Points / Turns', 5, 'Hold for 2-4 count'],
  // BOTTOM
  ['Bottom', 'Hand Control', 5, 'Clear the hands, control the wrist'],
  ['Bottom', 'Stand Up Finishes', 5, 'Hand control, turn, face'],
  ['Bottom', 'Granby Roll', 5, ''],
  ['Bottom', 'Peterson Roll', 5, ''],
  ['Bottom', 'Tripod / Head Post', 5, ''],
  ['Bottom', 'Escapes in 30', 5, 'Get out in 30 seconds'],
  ['Bottom', 'Reversals', 5, 'Switch, roll, sit-out turn-in'],
  ['Bottom', 'Bottom Chain Wrestling', 5, 'Keep moving: stand, sit, switch'],
  ['Bottom', 'Defending the Cradle', 5, ''],
  ['Bottom', 'Off the Back / Fighting Off Back', 5, 'Bridge, turn in, belly down'],
  // SITUATIONAL
  ['Situational', 'Down 1, 30 Seconds Left', 3, 'Bottom: escape now'],
  ['Situational', 'Up 1, Ride Out 30', 3, 'Top: ride it out'],
  ['Situational', 'Sudden Victory Overtime', 3, 'First takedown wins'],
  ['Situational', 'Tie-Breaker Ride Out', 3, '30 seconds each'],
  ['Situational', 'Front Headlock Scramble', 5, 'Start in front headlock'],
  ['Situational', 'Leg In / Legs Ride', 5, 'Start with legs in'],
  ['Situational', 'Out of Bounds Restarts', 3, ''],
  ['Situational', 'Score Off a Flurry', 5, 'Start in a scramble'],
  ['Situational', 'First Period Start (2 min)', 2, 'Neutral, match pace'],
  // LIVE
  ['Live', 'Live Takedowns', 10, 'Neutral goes'],
  ['Live', 'Live Top / Bottom', 10, 'Switch at the whistle'],
  ['Live', 'Shark Bait', 10, 'Fresh wrestler in every 30-60 seconds'],
  ['Live', 'Short Goes', 6, '30 second sprints'],
  ['Live', 'Full Match Simulation', 6, '2-2-2 match pace'],
  ['Live', 'Mat Wars', 8, 'Two teams, takedowns count'],
  ['Live', 'Scramble Live', 6, 'Start in a scramble'],
  // GAMES
  ['Games', 'Wall Sit: Last One Standing', 5, 'Everyone on the wall. Last one sitting wins'],
  ['Games', 'Sharks & Minnows', 8, 'Sharks take down minnows crossing the mat'],
  ['Games', 'Dodgeball', 10, ''],
  ['Games', 'Queen of the Mat', 10, 'Winner stays in, next challenger up'],
  ['Games', 'Flag Wrestling', 6, 'Flag in the waistband. Steal theirs, protect yours'],
  ['Games', 'Shoe Wrestling', 5, 'Get your partner\'s shoe off'],
  ['Games', 'Line Drag', 5, 'Drag your partner across the line'],
  ['Games', 'Sumo Wrestling', 6, 'Push them out of the circle'],
  ['Games', 'Knee Wrestling Royal Rumble', 6, 'Everyone on knees. Out of the circle, you\'re out'],
  ['Games', 'Knee Tag', 4, 'Tag their knees, protect yours'],
  ['Games', 'Flip the Turtle', 5, 'Bottom stays flat. Top tries to turn them'],
  ['Games', 'British Bulldog', 8, 'Cross the mat without getting taken down'],
  ['Games', 'Rooster Fights', 4, 'Hop on one foot, arms crossed, bump them off balance'],
  ['Games', 'Crab Soccer', 8, ''],
  ['Games', 'Bear Crawl Tag', 5, ''],
  ['Games', 'Steal the Bacon', 6, 'Call a number, race to the middle, score'],
  ['Games', 'Red Light, Green Light Stance', 4, 'Hold stance on red, shoot on green'],
  ['Games', 'Simon Says (Stance & Motion)', 4, ''],
  ['Games', 'Tug of War', 5, ''],
  ['Games', 'Back-to-Back Push', 3, 'Sit back to back, push them over the line'],
  // CONDITIONING
  ['Conditioning', 'Sprawl Sprints', 5, 'Sprint, sprawl on the whistle'],
  ['Conditioning', 'Burpees', 3, ''],
  ['Conditioning', 'Bear Crawls', 3, ''],
  ['Conditioning', 'Buddy Carries', 5, ''],
  ['Conditioning', 'Rope Climb', 5, ''],
  ['Conditioning', 'Stairs / Bleachers', 10, ''],
  ['Conditioning', 'Partner Drag', 4, ''],
  ['Conditioning', 'Med Ball Circuit', 8, ''],
  ['Conditioning', 'Tabata', 4, '20 seconds on, 10 seconds off x 8'],
  ['Conditioning', 'Bodyweight Circuit', 10, 'Push-ups, squats, sit-ups, planks'],
  ['Conditioning', 'Neck Work', 3, ''],
  ['Conditioning', 'Core Circuit', 5, 'Planks, V-ups, flutter kicks'],
  ['Conditioning', 'Hill / Hallway Sprints', 10, ''],
  ['Conditioning', 'Grip Work', 3, 'Towel hangs, gi pulls'],
  // COOL DOWN
  ['Cool Down', 'Easy Walk / Jog', 3, 'Bring the heart rate down'],
  ['Cool Down', 'Yoga Flow', 8, ''],
  ['Cool Down', 'Hip & Hamstring Stretch', 5, ''],
  ['Cool Down', 'Shoulder & Neck Stretch', 3, ''],
  // TEAM TALK
  ['Team Talk', 'Opening Huddle', 3, 'Plan for today'],
  ['Team Talk', 'Goal Setting', 5, ''],
  ['Team Talk', 'Technique Demo', 5, 'Coach demonstration'],
  ['Team Talk', 'Film Review', 15, ''],
  ['Team Talk', 'Weigh-ins / Skin Check', 10, ''],
  ['Team Talk', 'Closing Huddle', 3, 'Takeaways and announcements'],
  ['Team Talk', 'Meet Prep Talk', 5, ''],
];
EXTRA.forEach(([category, title, min, description], i) => PRESET_DRILLS.push({
  id: 'x' + String(i + 1).padStart(3, '0'), title, category, description, cues: [], durationSec: min * 60, levels: [], videoUrl: '', preset: true, added: true,
}));

// Routines: one item in a practice, but each motion is timed and called by itself.
// "Warm Up for Success" is the team's warm-up poster, in order. The poster has
// no times, so each motion starts at 30 seconds (one trip down and back) and
// the combination moves at 45. Coaches can adjust and save it back.
const R = (section, title, sec, description = '') => ({ section, title, sec, description });
PRESET_DRILLS.push({
  id: 'r001', type: 'series', title: 'Warm Up for Success', category: 'Warm-up', preset: true, added: true, force: 2, levels: [], videoUrl: '', cues: [],
  description: 'Bluejays Girls Wrestling warm-up. Each motion is called and timed on its own',
  moves: [
    // DYNAMIC MOVEMENT
    R('Dynamic Movement', 'Arm Circles', 30, 'R/L down & back, Huggers'),
    R('Dynamic Movement', 'Arm Swing Heel Raise', 30),
    R('Dynamic Movement', 'Knee Hug', 30),
    R('Dynamic Movement', 'Frankies', 30, 'Opposite side'),
    R('Dynamic Movement', 'Lateral Lunges', 30),
    R('Dynamic Movement', 'Graceful Lateral Bound', 30, 'Hand above head'),
    R('Dynamic Movement', 'Grapevine', 30),
    // ANIMAL STRENGTH & MOBILITY
    R('Animal Strength & Mobility', 'Bunny Hop', 30, '4 way'),
    R('Animal Strength & Mobility', 'Big Rabbit Jumps', 30),
    R('Animal Strength & Mobility', 'Bear', 30, '4 way'),
    R('Animal Strength & Mobility', 'Crab', 30, '4 way'),
    R('Animal Strength & Mobility', 'Seal to Halfway Backwards Seal', 45),
    // TUMBLING & AGILITY
    R('Tumbling & Agility', 'Cartwheel', 30, 'Both directions'),
    R('Tumbling & Agility', 'Shoulder Rolls', 30),
    R('Tumbling & Agility', 'Backwards Rolls', 30, 'Stay small, knees to one side'),
    R('Tumbling & Agility', 'Back Extensions', 30, 'Land on feet'),
    R('Tumbling & Agility', 'Forward Roll, Cartwheel, Round Off, Back Extension', 45),
    // WRESTLING FUNDAMENTALS
    R('Wrestling Fundamentals', 'Pivots', 30, 'Foot up high, belly to the sky'),
    R('Wrestling Fundamentals', 'Bear to Crab', 30, 'Slide heel'),
    R('Wrestling Fundamentals', 'Shoulder Roll', 30),
    R('Wrestling Fundamentals', 'Quadpod Step Out to Shoulder Roll', 30),
    R('Wrestling Fundamentals', 'Short Sit', 30),
    R('Wrestling Fundamentals', 'Elbow Down Short Sit', 30),
    R('Wrestling Fundamentals', 'Elbow Down Short Sit, Change Over, Stand Up', 45),
  ],
});
PRESET_DRILLS.forEach(d => { if (d.type === 'series') d.durationSec = d.moves.reduce((s, m) => s + m.sec, 0); });

// The prototype's spoken and printed lines.
export const PHRASES = {
  start: (t) => `Starting ${t}`,
  next: (t) => `Next up: ${t}`,
  rotationStart: 'Rotation Starting',
  nextRotation: 'Next up: Station Rotations',
  done: 'Practice complete. Champions are made today.',
  printFooter: 'Champions are made in the practice room.',
};

const uid = () => Math.random().toString(36).slice(2, 10);
const fromPreset = (id, overrideMin) => {
  const d = PRESET_DRILLS.find(x => x.id === id);
  return { id: uid(), type: 'drill', title: d.title, category: d.category, description: d.description,
    cues: [], durationSec: (overrideMin ?? d.durationSec / 60) * 60, switchAtHalf: false, drillId: d.id };
};

// Templates. Comp Warmup and Comp Cooldown use the prototype's exact
// lists and times. "Team Practice" and "Group Split" were the prototype's
// two ways to start a practice.
export const TEMPLATES = [
  {
    key: 'blank', name: 'Team Practice', blurb: 'Manual Builder', accent: '#3b82f6',
    build: () => ({ title: 'Team Practice', blocks: [] }),
  },
  {
    key: 'split', name: 'Group Split', blurb: 'Station Rotation', accent: '#eab308',
    build: () => ({ title: 'Group Split Practice', blocks: [makeRotation(4)] }),
  },
  {
    key: 'comp-warmup', name: 'Comp Warmup', blurb: 'High Intensity', accent: '#ef4444',
    build: () => ({ title: 'Comp Warmup', blocks: [
      fromPreset('w1', 10), fromPreset('w2', 5), fromPreset('w3', 5), fromPreset('w4', 5), fromPreset('s4', 5),
    ] }),
  },
  {
    key: 'comp-cooldown', name: 'Comp Cooldown', blurb: 'Recovery Flow', accent: '#22d3ee',
    build: () => ({ title: 'Comp Cooldown', blocks: [
      fromPreset('cd6', 3), fromPreset('cd1', 7), fromPreset('cd7', 5),
    ] }),
  },
];

export function makeRotation(n, mode = 'rotate') {
  return {
    id: uid(), type: 'rotation', mode, title: mode === 'rotate' ? 'Station Rotation' : 'Group Split',
    category: 'Station', description: '', stationSec: 5 * 60, transitionSec: 30,
    stations: Array.from({ length: n }, (_, i) => ({ title: `Station ${i + 1}`, description: '', category: 'Station' })),
  };
}

export function makeGoes() {
  return { id: uid(), type: 'goes', title: 'Live Goes', category: 'Live', description: '', cues: [],
    rounds: 3, workSec: 60, restSec: 30, switchAtHalf: false };
}

export function makeRest(sec = 60) {
  return { id: uid(), type: 'rest', title: 'Rest', category: 'Rest', durationSec: sec };
}

export function drillToBlock(d) {
  if (d.type === 'series') return { id: uid(), type: 'series', title: d.title, category: d.category, description: d.description || '', drillId: d.id,
    moves: JSON.parse(JSON.stringify(d.moves || [])) };
  return { id: uid(), type: 'drill', title: d.title, category: d.category, description: d.description || '',
    cues: [...(d.cues || [])], durationSec: d.durationSec || 300, switchAtHalf: false, drillId: d.id,
    videoUrl: d.videoUrl || '' };
}

export const newId = uid;
