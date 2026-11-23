import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { search: '', href: '' }; globalThis.localStorage = { getItem: () => null, setItem() {} };
const { parseNames } = await import('../js/roster.js');
test('paste parsing handles common formats', () => {
  const r = parseNames('Kenzie Smith 10\nLopez, Maria 11\n3. ava jones\nMary Kate O\'Brien, 9\nSmith, Kenzie, gr 12');
  assert.deepEqual(r.map(x => [x.first, x.last, x.grade]), [['Kenzie', 'Smith', '10'], ['Maria', 'Lopez', '11'], ['Ava', 'Jones', ''], ['Mary Kate', "O'Brien", '9'], ['Kenzie', 'Smith', '12']]);
});

test('photo taps become rows: front row = lowest, left to right', async () => {
  const { rowsFromTags } = await import('../js/roster.js');
  const t = (name, x, y) => ({ name, x, y, id: name });
  // tapped in random order; back row near top, front row near bottom, slight y wobble
  const tags = [t('B2', 50, 22), t('F1', 15, 80), t('M3', 82, 50), t('B1', 20, 25), t('F3', 85, 78), t('M1', 12, 52), t('F2', 48, 83), t('M2', 45, 47), t('B3', 80, 20)];
  const rows = rowsFromTags(tags, 3).map(r => r.map(x => x.name));
  assert.deepEqual(rows, [['F1', 'F2', 'F3'], ['M1', 'M2', 'M3'], ['B1', 'B2', 'B3']]);
  assert.deepEqual(rowsFromTags([t('A', 10, 50)], 3).map(r => r.length), [1, 0, 0]);
});

test('partly tagged photo keeps a row together', async () => {
  const { rowsFromTags } = await import('../js/roster.js');
  const t = (name, x, y) => ({ name, x, y, id: name });
  const rows = rowsFromTags([t('Lily', 20, 22.5), t('Ava', 16.7, 77.5), t('Kenzie', 50, 77.6), t('Zoe', 83, 77.4)], 3).map(r => r.map(x => x.name));
  assert.deepEqual(rows[0], ['Ava', 'Kenzie', 'Zoe']);
  assert.deepEqual(rows[1], ['Lily']);
});
