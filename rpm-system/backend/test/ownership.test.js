const test = require('node:test');
const assert = require('node:assert/strict');
const { firstForeignId } = require('../src/ownership');

const MINE = '11111111-1111-1111-1111-111111111111';
const THEIRS = '22222222-2222-2222-2222-222222222222';
// Fake pool: only MINE belongs to user u1, for every table.
const pool = { query: async (_sql, [id, user]) => ({ rows: id === MINE && user === 'u1' ? [{ 1: 1 }] : [] }) };

test('owned or absent ids pass', async () => {
  assert.equal(await firstForeignId(pool, 'u1', {}), null);
  assert.equal(await firstForeignId(pool, 'u1', { project_id: MINE, block_id: MINE, category_id: '', key_result_id: null }), null);
});

test('any foreign id is rejected, naming the field', async () => {
  for (const f of ['category_id', 'project_id', 'block_id', 'key_result_id', 'leverage_person_id']) {
    assert.equal(await firstForeignId(pool, 'u1', { [f]: THEIRS }), f);
  }
  assert.equal(await firstForeignId(pool, 'u2', { project_id: MINE }), 'project_id');
});

test('malformed ids are rejected without querying', async () => {
  let called = false;
  const p = { query: async () => { called = true; return { rows: [{}] }; } };
  assert.equal(await firstForeignId(p, 'u1', { project_id: "x' OR 1=1 --" }), 'project_id');
  assert.equal(await firstForeignId(p, 'u1', { block_id: 42 }), 'block_id');
  assert.equal(called, false);
});
