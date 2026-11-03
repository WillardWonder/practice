import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, newClock, play, pause, catchUp, remainingMs, applyCommand, segDur, practiceDuration, parseDur, fmt, blockDuration } from '../js/engine.js';
import { makeRotation, makeGoes, PRESET_DRILLS, TEMPLATES } from '../js/seed.js';

const drill = (t, sec, extra = {}) => ({ id: t, type: 'drill', title: t, category: 'Neutral', durationSec: sec, ...extra });

test('all prototype presets carried over', () => {
  assert.equal(PRESET_DRILLS.filter(d => !d.added && !['w1','w2','w3','w4','s4','cd6','cd7'].includes(d.id)).length, 41);
  assert.ok(PRESET_DRILLS.find(d => d.title === 'IRONMAN' && d.description === 'Neutral intensity' && d.durationSec === 480));
  const cw = TEMPLATES.find(t => t.key === 'comp-warmup').build();
  assert.deepEqual(cw.blocks.map(b => [b.title, b.durationSec / 60]), [['Dynamic Warm-up', 10], ['Stance & Motion', 5], ['Hard Speed Shots', 5], ['Clearance Drills', 5], ['Mental Prep / Chalk Talk', 5]]);
});

test('nested goes: 5 x 2:00 with 1:00 rest', () => {
  const g = { ...makeGoes(), rounds: 5, workSec: 120, restSec: 60 };
  const segs = compile({ blocks: [g] });
  assert.equal(segs.length, 9);
  assert.equal(blockDuration(g), 5 * 120 + 4 * 60);
  assert.equal(segs[0].sub, 'Go 1 of 5'); assert.equal(segs[1].kind, 'rest'); assert.equal(segs[8].sub, 'Go 5 of 5');
});

test('rotation: every group visits every station', () => {
  const r = makeRotation(3); r.stations = [{ title: 'A' }, { title: 'B' }, { title: 'C' }]; r.stationSec = 60; r.transitionSec = 15;
  const segs = compile({ blocks: [r] }).filter(s => s.kind === 'work');
  assert.equal(segs.length, 3);
  const groupA = segs.map(s => s.assignments[0].station.title);
  assert.deepEqual(groupA, ['A', 'B', 'C']);
  segs.forEach(s => assert.equal(new Set(s.assignments.map(a => a.station.title)).size, 3));
  const split = { ...r, mode: 'split' }; assert.equal(compile({ blocks: [split] }).length, 1);
});

test('clock: pause/resume uses timestamps, not ticks', () => {
  const segs = compile({ blocks: [drill('a', 60), drill('b', 60)] });
  const c = newClock();
  play(c, 0); assert.equal(remainingMs(segs, c, 10_000), 50_000);
  pause(c, 10_000); assert.equal(remainingMs(segs, c, 999_999), 50_000);
  play(c, 100_000); assert.equal(remainingMs(segs, c, 110_000), 40_000);
  assert.equal(c.pausedMs, 90_000);
});

test('clock: auto-advance survives a sleeping device (catch up many segments)', () => {
  const segs = compile({ blocks: [drill('a', 60), drill('b', 60), drill('c', 60)] });
  const c = newClock(); play(c, 0);
  const entered = catchUp(segs, c, 125_000);
  assert.deepEqual(entered, [1, 2]); assert.equal(c.segIndex, 2); assert.equal(remainingMs(segs, c, 125_000), 55_000);
  catchUp(segs, c, 500_000); assert.equal(c.done, true);
});

test('coach-paced block waits at 0:00 and logs overtime', () => {
  const segs = compile({ blocks: [drill('demo', 60, { holdAtEnd: true }), drill('b', 60)] });
  let c = newClock(); play(c, 0);
  catchUp(segs, c, 90_000); assert.equal(c.segIndex, 0); assert.equal(remainingMs(segs, c, 90_000), -30_000);
  c = applyCommand(segs, c, 'next', null, 90_000);
  assert.equal(c.segIndex, 1); assert.equal(c.overtime[0], 30); assert.equal(c.running, true);
  assert.equal(remainingMs(segs, c, 90_000), 60_000);
});

test('commands: next marks skipped, add/extend, prev, jump', () => {
  const segs = compile({ blocks: [drill('a', 300), drill('b', 300), drill('c', 300)] });
  let c = newClock(); play(c, 0);
  c = applyCommand(segs, c, 'add', 60, 10_000); assert.equal(segDur(segs, c, 0), 360);
  c = applyCommand(segs, c, 'next', null, 20_000); assert.equal(c.segIndex, 1); assert.equal(c.skipped[0], 1);
  c = applyCommand(segs, c, 'prev', null, 21_000); assert.equal(c.segIndex, 0);
  c = applyCommand(segs, c, 'jump', 2, 22_000); assert.equal(c.segIndex, 2); assert.equal(c.skipped[1], 1); assert.equal(remainingMs(segs, c, 22_000), 300_000);
  c = applyCommand(segs, c, 'add', -30, 22_000); assert.equal(segDur(segs, c, 2), 270);
  c = applyCommand(segs, c, 'pause', null, 30_000); assert.equal(c.running, false);
  c = applyCommand(segs, c, 'next', null, 30_000); assert.equal(c.done, true);
});

test('competing commands applied in order produce one consistent state', () => {
  const segs = compile({ blocks: [drill('a', 300), drill('b', 300)] });
  const base = (() => { const c = newClock(); play(c, 0); return c; })();
  // Two coaches tap "+1:00" at once: the transaction applies both, sequentially.
  const c1 = applyCommand(segs, base, 'add', 60, 1000);
  const c2 = applyCommand(segs, c1, 'add', 60, 1000);
  assert.equal(segDur(segs, c2, 0), 420);
  assert.equal(segDur(segs, base, 0), 300, 'commands are pure (no mutation)');
});

test('duration parsing and formatting', () => {
  assert.equal(parseDur('5', 0), 300); assert.equal(parseDur('1:30', 0), 90); assert.equal(parseDur('45s', 0), 45); assert.equal(parseDur('x', 7), 7);
  assert.equal(fmt(65), '1:05'); assert.equal(fmt(3725), '1:02:05');
  assert.equal(practiceDuration({ blocks: [drill('a', 60), drill('b', 90)] }), 150);
});

test('routine: one block, each motion its own timed segment', async () => {
  const { PRESET_DRILLS, drillToBlock } = await import('../js/seed.js');
  const r = PRESET_DRILLS.find(d => d.type === 'series');
  const b = drillToBlock(r);
  const segs = compile({ blocks: [b, drill('next', 60)] });
  assert.equal(segs.length, r.moves.length + 1);
  assert.equal(segs[0].title, 'Jog'); assert.equal(segs[0].say, 'Team Warm-up. Jog');
  assert.equal(segs[1].sub, `Team Warm-up · 2 of ${r.moves.length}`);
  assert.ok(segs[0].seriesStep); assert.ok(!segs[r.moves.length - 1].seriesStep);
  assert.equal(blockDuration(b), r.moves.reduce((s, m) => s + m.sec, 0));
});

test('games category present with requested games', async () => {
  const { PRESET_DRILLS } = await import('../js/seed.js');
  const g = PRESET_DRILLS.filter(d => d.category === 'Games').map(d => d.title);
  ['Wall Sit: Last One Standing', 'Sharks & Minnows', 'Dodgeball', 'Queen of the Mat', 'Flag Wrestling', 'Shoe Wrestling', 'Line Drag', 'Sumo Wrestling', 'Knee Wrestling Royal Rumble'].forEach(t => assert.ok(g.includes(t), t));
  assert.equal(new Set(PRESET_DRILLS.map(d => d.id)).size, PRESET_DRILLS.length, 'unique ids');
});
