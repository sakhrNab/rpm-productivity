const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/ai/coachLoop');

const coach = { proactive: true, checkin_days: '1,5', checkin_time: '08:30', followup_time: '18:00', last_checkin_date: null, last_followup_date: null };

test('dueWork: check-ins only on chosen days after the time, once a day', () => {
  assert.deepEqual(L.dueWork(coach, { dateStr: '2026-09-28', hhmm: '08:29', dow: 1 }), []);
  assert.deepEqual(L.dueWork(coach, { dateStr: '2026-09-28', hhmm: '08:30', dow: 1 }), ['checkin']);
  assert.ok(L.dueWork(coach, { dateStr: '2026-09-28', hhmm: '09:05', dow: 1 }).includes('checkin'));
  assert.ok(!L.dueWork(coach, { dateStr: '2026-09-29', hhmm: '09:05', dow: 2 }).includes('checkin'));      // Tuesday not chosen
  assert.ok(!L.dueWork({ ...coach, last_checkin_date: '2026-09-28' }, { dateStr: '2026-09-28', hhmm: '10:00', dow: 1 }).includes('checkin'));
  assert.ok(L.dueWork({ ...coach, last_checkin_date: new Date('2026-09-21T00:00:00Z') }, { dateStr: '2026-09-28', hhmm: '10:00', dow: 1 }).includes('checkin'));
});

test('dueWork: follow-up once per evening; alerts only in waking hours; off switch wins', () => {
  assert.ok(L.dueWork(coach, { dateStr: '2026-09-28', hhmm: '18:00', dow: 1 }).includes('followup'));
  assert.ok(!L.dueWork({ ...coach, last_followup_date: '2026-09-28' }, { dateStr: '2026-09-28', hhmm: '19:00', dow: 1 }).includes('followup'));
  assert.ok(!L.dueWork(coach, { dateStr: '2026-09-28', hhmm: '22:00', dow: 1 }).includes('alerts'));
  assert.deepEqual(L.dueWork({ ...coach, proactive: false }, { dateStr: '2026-09-28', hhmm: '18:30', dow: 1 }), []);
});

test('cleanSchedule validates days and times', () => {
  assert.deepEqual(L.cleanSchedule({ checkin_days: [5, 1, 1, 9], checkin_time: '07:15', followup_time: '25:00', proactive: 0 }),
    { checkin_days: '1,5', checkin_time: '07:15', proactive: false });
  assert.equal(L.checkinKind(1), 'plan'); assert.equal(L.checkinKind(5), 'review'); assert.equal(L.checkinKind(3), 'nudge');
});

test('pickFollowups: only important open tasks, max 3, most important first', () => {
  const t = (id, priority, extra = {}) => ({ id, title: id, priority, ...extra });
  const out = L.pickFollowups([t('low', 0), t('p2', 2), t('star', 1, { is_starred: true }), t('p3', 3), t('done', 3, { is_completed: true }), t('p2b', 2)]);
  assert.deepEqual(out.map(x => x.id), ['p3', 'p2', 'p2b']);
});

test('detectAlerts: stale overdue, off-track goals, closing deadlines; stable signature', () => {
  const a = L.detectAlerts({
    overdue: [{ title: 'A', days_late: 1 }, { title: 'B', days_late: 5 }],
    at_risk: [{ title: 'Members', status: 'off_track', required_per_week: 8, rate_per_week: 0 }, { title: 'Soft', status: 'at_risk' }],
    deadlines: [{ name: 'Skool', days_left: 3, open: 4 }, { name: 'Later', days_left: 30, open: 2 }, { name: 'Done', days_left: 1, open: 0 }],
  });
  assert.deepEqual(a.alerts.map(x => x.type), ['overdue', 'goal', 'deadline']);
  assert.match(a.alerts[0].text, /1 task overdue: “B” \(5d\)/);
  assert.match(a.alerts[1].text, /needs 8\/wk, you're at 0\/wk/);
  assert.match(a.alerts[2].text, /in 3 days with 4 open tasks/);
  assert.equal(a.sig, L.detectAlerts({ overdue: [{ title: 'B', days_late: 6 }], at_risk: [{ title: 'Members', status: 'off_track' }], deadlines: [{ name: 'Skool', days_left: 3, open: 1 }] }).sig);
  assert.equal(L.detectAlerts({}).sig, '');
});

test('signed follow-up links: valid, tamper-proof, expiring, op-restricted', () => {
  const tok = L.signAction({ uid: 'u', aid: 'a', op: 'd' }, 's3cret');
  assert.equal(L.verifyAction(tok, 's3cret').aid, 'a');
  assert.equal(L.verifyAction(tok, 'other'), null);
  const [body, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'u', aid: 'EVIL', op: 'd', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(L.verifyAction(`${forged}.${sig}`, 's3cret'), null);
  assert.equal(L.verifyAction(L.signAction({ uid: 'u', aid: 'a', op: 'd' }, 's3cret', -1), 's3cret'), null);
  assert.equal(L.verifyAction(L.signAction({ uid: 'u', aid: 'a', op: 'rm' }, 's3cret'), 's3cret'), null);
  assert.equal(L.verifyAction('garbage', 's3cret'), null);
  assert.equal(L.addDaysStr('2026-09-30', 1), '2026-10-01');
});
