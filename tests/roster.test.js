import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { search: '', href: '' }; globalThis.localStorage = { getItem: () => null, setItem() {} };
const { parseNames } = await import('../js/roster.js');
test('paste parsing handles common formats', () => {
  const r = parseNames('Kenzie Smith 10\nLopez, Maria 11\n3. ava jones\nMary Kate O\'Brien, 9\nSmith, Kenzie, gr 12');
  assert.deepEqual(r.map(x => [x.first, x.last, x.grade]), [['Kenzie', 'Smith', '10'], ['Maria', 'Lopez', '11'], ['Ava', 'Jones', ''], ['Mary Kate', "O'Brien", '9'], ['Kenzie', 'Smith', '12']]);
});
