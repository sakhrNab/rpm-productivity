// node --test src/utils/bargeIn.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBargeIn, isOnlyStop } from './bargeIn.js';

const SAID = 'Done — added "Email Stripe support" to Launch the Paid Tier for tomorrow at 10, with a reminder at 9:45.';

test('its own voice leaking into the mic is not an interruption', () => {
  assert.equal(isBargeIn('added email stripe support to launch the paid tier', SAID), false);
  assert.equal(isBargeIn('for tomorrow at 10 with a reminder', SAID), false);
  assert.equal(isBargeIn('launch the paid', SAID), false);                    // short fragment
  assert.equal(isBargeIn('with a reminder at nine forty five', SAID), false); // mostly its words
});

test('you speaking over it is', () => {
  assert.equal(isBargeIn('no move it to Friday instead', SAID), true);
  assert.equal(isBargeIn('what about my marathon plan', SAID), true);
  assert.equal(isBargeIn('stop', SAID), true);
  assert.equal(isBargeIn('wait', SAID), true);
  assert.equal(isBargeIn('hold on a second', SAID), true);
  assert.equal(isBargeIn('Jarvis', SAID), true);
});

test('a stop word the orb itself is saying does not count', () => {
  const said = 'Wait until Friday to send it, then stop the old campaign.';
  assert.equal(isBargeIn('wait until friday', said), false);
  assert.equal(isBargeIn('stop the old', said), false);
});

test('noise and one-word blips are ignored', () => {
  assert.equal(isBargeIn('', SAID), false);
  assert.equal(isBargeIn('um', SAID), false);
  assert.equal(isBargeIn('hello there', SAID), false);
});

test('"stop" alone means stop; anything more is a new request', () => {
  for (const t of ['stop', 'Stop.', 'wait', 'hold on', 'okay stop please', 'Jarvis stop', 'stop talking']) assert.equal(isOnlyStop(t), true, t);
  for (const t of ['wait, move it to Friday', 'stop the reminder for tomorrow', 'actually make it 11']) assert.equal(isOnlyStop(t), false, t);
});
