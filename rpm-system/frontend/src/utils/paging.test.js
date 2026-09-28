// node --test src/utils/paging.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, searchItems, mergePageOrder, rankCarried, isTop } from './paging.js';

test('pages are fixed-size slices; an empty list is one empty page', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]]);
  assert.deepEqual(paginate([], 6), [[]]);
  assert.equal(paginate(Array.from({ length: 130 }, (_, i) => i), 6).length, 22);
});

test('search matches every word, ignores case and accents', () => {
  const items = [{ t: 'Email Stripe support' }, { t: 'Café meeting notes' }, { t: 'Record demo video' }];
  const by = (q) => searchItems(items, q, i => i.t).map(i => i.t);
  assert.deepEqual(by('stripe'), ['Email Stripe support']);
  assert.deepEqual(by('cafe'), ['Café meeting notes']);
  assert.deepEqual(by('video record'), ['Record demo video']);
  assert.deepEqual(by('  '), items.map(i => i.t));
  assert.deepEqual(by('nothing'), []);
});

test('a reorder on page 2 lands back in the right place of the full list', () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(mergePageOrder(all, 3, ['e', 'd', 'f']), ['a', 'b', 'c', 'e', 'd', 'f', 'g']);
  assert.deepEqual(mergePageOrder(all, 6, ['g']), all);
});

test('carried over: starred and high priority first, then the longest overdue', () => {
  const r = rankCarried([
    { id: 'old-low', priority: 1, days_late: 70 },
    { id: 'new-high', priority: 3, days_late: 2 },
    { id: 'starred', priority: 0, is_starred: true, days_late: 1 },
    { id: 'old-none', priority: 0, days_late: 90 },
  ]).map(a => a.id);
  assert.deepEqual(r, ['starred', 'new-high', 'old-low', 'old-none']);
  assert.equal(isTop({ priority: 3 }), true);
  assert.equal(isTop({ priority: 2 }), false);
});
