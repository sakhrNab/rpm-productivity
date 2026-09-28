// node --test src/utils/goals.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoals, toggleGoal } from './goals.js';

test('one goal per line; bullets, numbers and blank lines are ignored', () => {
  const g = parseGoals('• Grow to 100 customers\n\n- Hire a VA\n2) Ship v2\n   ');
  assert.deepEqual(g.map(x => x.text), ['Grow to 100 customers', 'Hire a VA', 'Ship v2']);
  assert.deepEqual(g.map(x => x.line), [0, 2, 3]);
  assert.ok(g.every(x => !x.done));
  assert.deepEqual(parseGoals(''), []);
  assert.deepEqual(parseGoals(null), []);
});

test('a [x] prefix marks a goal done; [ ] is open', () => {
  const g = parseGoals('[x] Launch waitlist\n- [X] Pricing page\n[ ] Onboarding');
  assert.deepEqual(g.map(x => [x.text, x.done]), [['Launch waitlist', true], ['Pricing page', true], ['Onboarding', false]]);
});

test('toggling ticks and unticks one line and leaves the others untouched', () => {
  const text = '• Grow to 100 customers\n\n- Hire a VA\n[ ] Ship v2';
  const once = toggleGoal(text, 2);
  assert.equal(once, '• Grow to 100 customers\n\n[x] Hire a VA\n[ ] Ship v2');
  assert.equal(toggleGoal(once, 2), '• Grow to 100 customers\n\nHire a VA\n[ ] Ship v2');
  assert.equal(toggleGoal(text, 3), '• Grow to 100 customers\n\n- Hire a VA\n[x] Ship v2');
});

test('toggling a blank or missing line changes nothing', () => {
  assert.equal(toggleGoal('A\n\nB', 1), 'A\n\nB');
  assert.equal(toggleGoal('A', 5), 'A');
  assert.equal(toggleGoal('', 0), '');
});
