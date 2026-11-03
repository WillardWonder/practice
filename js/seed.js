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
  return { id: uid(), type: 'drill', title: d.title, category: d.category, description: d.description || '',
    cues: [...(d.cues || [])], durationSec: d.durationSec || 300, switchAtHalf: false, drillId: d.id,
    videoUrl: d.videoUrl || '' };
}

export const newId = uid;
