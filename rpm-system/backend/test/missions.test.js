// Missions: plan validation, approval rules (apps, confirmation), dependency gating at claim, failure propagation,
// cancel cascade, user scoping, heartbeat/apps, atomic claim. Real routers over HTTP against the shared fake pool.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakePool, server } = require('./fakePool');
const caps = require('../src/missionCapabilities');
const { RISKS } = caps;

const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const W = 'pat:write';
const ALL_APPS = { leadwave: true, raven: true, rpm: true, browser: true };

const step = (key, capability, over = {}) => ({ key, capability, inputs: {}, why: `because ${key}`, depends_on: [], ...over });
const PLAN2 = { summary: 'Brief, then posts', steps: [step('brief', 'morning-brief'), step('posts', 'draft-posts', { depends_on: ['brief'] })] };

async function ctx(opts) {
  const pool = fakePool();
  const s = await server(pool, opts);
  const api = {
    pool,
    ...s,
    heartbeat: (apps = ALL_APPS, user = U1) => s.call(user, 'POST', '/agent-runs/heartbeat', { runner: 'mac', apps }, W),
    claim: (user = U1, body = { runner: 'mac' }) => s.call(user, 'POST', '/agent-runs/claim', body, W),
    report: (id, body, user = U1) => s.call(user, 'POST', `/agent-runs/${id}/report`, body, W),
    create: (text = 'Give me my morning brief', user = U1) => s.call(user, 'POST', '/missions', { text }),
    // creates a mission and has the "runner" deliver this plan
    planned: async (plan = PLAN2, user = U1) => {
      const m = (await api.create('Plan something useful', user)).body;
      const run = (await api.claim(user, { runner: 'mac' })).body.run; // no apps sent: keeps what a heartbeat stored
      assert.equal(run.job_id, 'mission-plan');
      const r = await api.report(run.id, { status: 'done', summary: 'planned', plan }, user);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return m;
    },
    approve: (id, steps, user = U1) => s.call(user, 'POST', `/missions/${id}/approve`, { steps }, 'jwt'.replace('jwt', 'jwt')),
    get: (id, user = U1) => s.call(user, 'GET', `/missions/${id}`),
  };
  return api;
}
const keys = (arr) => arr.map((s) => s.key);
const run = async (fn) => { const c = await ctx(); try { await fn(c); } finally { await c.close(); } };

// ───────── capability list + plan validator ─────────
test('capabilities: the 7 existing jobs + draft-emails and draft-posts; every risk valid; drafting capabilities need no apps', () => {
  assert.deepEqual(caps.CAPABILITIES.map((c) => c.id), ['morning-brief', 'upwork-scout', 'prospect-list', 'skool-digest', 'reply-review', 'rpm-sync', 'weekly-review', 'draft-emails', 'draft-posts']);
  for (const c of caps.CAPABILITIES) {
    assert.ok(RISKS.includes(c.risk), c.id);
    assert.ok(c.needsApps.every((a) => caps.APPS.includes(a)), c.id);
    assert.ok(c.producesFiles.length && c.title && c.what && c.job, c.id);
  }
  for (const id of ['draft-emails', 'draft-posts']) assert.deepEqual(caps.CAP[id].needsApps, []);
});

test('validatePlan: rejects unknown capability, bad inputs, extra input keys, cycles, unknown/self deps, >8 steps, duplicate keys', () => {
  const bad = (plan, re) => assert.throws(() => caps.validatePlan(plan), re);
  bad(null, /plan must be an object/);
  bad({ summary: 's', steps: [step('a', 'send-email')] }, /unknown capability/);
  bad({ summary: 's', steps: [step('a', '__proto__')] }, /unknown capability/);
  bad({ summary: 's', steps: [step('a', 'upwork-scout', { inputs: { search: 'anything' } })] }, /Search must be one of/);
  bad({ summary: 's', steps: [step('a', 'morning-brief', { inputs: { evil: 'x' } })] }, /unknown input/);
  bad({ summary: 's', steps: [step('a', 'prospect-list', { inputs: { city: 'Berlin; DROP TABLE' } })] }, /not allowed/);
  bad({ summary: 's', steps: [step('a', 'morning-brief', { depends_on: ['a'] })] }, /itself/);
  bad({ summary: 's', steps: [step('a', 'morning-brief', { depends_on: ['zzz'] })] }, /unknown step/);
  bad({ summary: 's', steps: [step('a', 'morning-brief'), step('a', 'rpm-sync')] }, /duplicate/);
  bad({ summary: 's', steps: [step('a', 'morning-brief', { depends_on: ['b'] }), step('b', 'rpm-sync', { depends_on: ['c'] }), step('c', 'weekly-review', { depends_on: ['a'] })] }, /cycle/);
  bad({ summary: 's', steps: Array.from({ length: 9 }, (_, i) => step(`s${i}`, 'morning-brief')) }, /at most 8/);
  bad({ summary: 's', steps: [{ ...step('a', 'morning-brief'), why: '' }] }, /why/);
  bad({ summary: '', steps: [] }, /summary/);
  bad({ summary: 's', steps: [step('Bad Key', 'morning-brief')] }, /key/);
  const ok = caps.validatePlan({ summary: ' s ', steps: [step('a', 'prospect-list', { inputs: { city: 'München' } }), step('b', 'draft-emails', { depends_on: ['a'], inputs: { count: '3' } })] });
  assert.deepEqual(ok.steps[0].inputs, { sector: 'support', city: 'München', source: 'osm' }, 'missing values take the default');
  assert.deepEqual(ok.steps[1].inputs, { offer: 'reply-autopilot', count: '3' });
});

test('risk rules: Google Places is paid, browser reads are outward-read, drafts are not confirmed', () => {
  const pl = caps.CAP['prospect-list'];
  assert.equal(caps.stepNeedsConfirm(pl, { source: 'osm' }), false);
  assert.equal(caps.effectiveRisk(pl, { source: 'google_places' }), 'paid');
  assert.equal(caps.stepNeedsConfirm(pl, { source: 'google_places' }), true);
  assert.equal(caps.stepNeedsConfirm(caps.CAP['skool-digest'], {}), true);
  assert.equal(caps.stepNeedsConfirm(caps.CAP['draft-posts'], {}), false);
  assert.deepEqual(caps.blockedCapabilities({ rpm: true, browser: false, leadwave: true }).sort(), ['reply-review', 'skool-digest', 'upwork-scout']);
  assert.ok(caps.blockedCapabilities(ALL_APPS, ['browser']).includes('upwork-scout'));
});

// ───────── creating + planning ─────────
test('creating a mission validates the text, queues ONE planner run, and keeps the planner run out of the runs list', () => run(async (c) => {
  assert.equal((await c.create('abc')).status, 400);
  assert.equal((await c.create('x'.repeat(2001))).status, 400);
  assert.equal((await c.call(U1, 'POST', '/missions', { text: 42 })).status, 400);
  const m = await c.create('  Give me my morning brief  ');
  assert.equal(m.status, 201);
  assert.equal(m.body.status, 'planning');
  assert.equal(m.body.text, 'Give me my morning brief');
  assert.equal(c.pool.runs.length, 1);
  assert.equal(c.pool.runs[0].job_id, 'mission-plan');
  assert.deepEqual(c.pool.runs[0].inputs, { text: 'Give me my morning brief' });
  assert.deepEqual((await c.call(U1, 'GET', '/agent-runs')).body.runs, [], 'planner runs are internal');
  assert.equal((await c.call(U1, 'POST', '/missions', { text: 'Give me my morning brief', user_id: U2 })).body.user_id, U1);
}));

test('open missions are capped per user', () => run(async (c) => {
  for (let i = 0; i < 5; i++) assert.equal((await c.create()).status, 201);
  assert.equal((await c.create()).status, 400);
  assert.equal((await c.create('Give me my morning brief', U2)).status, 201);
}));

test('planner report: a valid plan moves the mission to awaiting_approval; an unknown capability fails mission AND run', () => run(async (c) => {
  const m = await c.planned();
  const got = (await c.get(m.id)).body;
  assert.equal(got.status, 'awaiting_approval');
  assert.deepEqual(keys(got.plan.steps), ['brief', 'posts']);
  assert.equal(got.plan_run.status, 'done');

  const m2 = (await c.create('Do something sneaky now')).body;
  const planRun = (await c.claim()).body.run;
  const r = await c.report(planRun.id, { status: 'done', plan: { summary: 'x', steps: [step('a', 'send-email')] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'failed');
  assert.match(r.body.summary, /unknown capability/);
  const got2 = (await c.get(m2.id)).body;
  assert.equal(got2.status, 'failed');
  assert.match(got2.plan.error || '', /./);
  assert.equal(c.pool.runs.filter((x) => x.mission_id === m2.id).length, 1, 'no step was queued');
}));

test('planner report: missing plan, empty plan, failed planner and plan on a normal job', () => run(async (c) => {
  const a = (await c.create('mission without plan')).body;
  let pr = (await c.claim()).body.run;
  await c.report(pr.id, { status: 'done', summary: 'oops' });
  assert.equal((await c.get(a.id)).body.status, 'failed');

  const b = (await c.create('mission with empty plan')).body;
  pr = (await c.claim()).body.run;
  await c.report(pr.id, { status: 'done', plan: { summary: 'nothing fits', steps: [] } });
  const gb = (await c.get(b.id)).body;
  assert.equal(gb.status, 'failed');
  assert.equal(gb.plan.summary, 'nothing fits');

  const d = (await c.create('planner crashes here')).body;
  pr = (await c.claim()).body.run;
  await c.report(pr.id, { status: 'failed', summary: 'Claude returned no JSON' });
  const gd = (await c.get(d.id)).body;
  assert.equal(gd.status, 'failed');
  assert.match(gd.plan.error, /no JSON/);

  await c.call(U1, 'POST', '/agent-runs', { job_id: 'rpm-sync' });
  const normal = (await c.claim()).body.run;
  assert.equal((await c.report(normal.id, { status: 'done', plan: PLAN2 })).status, 400, 'only the planner may send a plan');
}));

// ───────── approval ─────────
test('approve creates one queued run per approved step with depends_on/capability/job, and only once', () => run(async (c) => {
  await c.heartbeat();
  const m = await c.planned();
  const r = await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'running');
  assert.deepEqual(r.body.steps.map((s) => [s.step_key, s.job_id, s.capability, s.depends_on, s.status]),
    [['brief', 'morning-brief', 'morning-brief', [], 'queued'], ['posts', 'draft-posts', 'draft-posts', ['brief'], 'queued']]);
  assert.deepEqual(r.body.steps[1].inputs, { platform: 'all', topic: '' });
  assert.equal((await c.approve(m.id, [{ key: 'brief' }])).status, 409, 'second approve refused');
  assert.equal(c.pool.runs.filter((x) => x.step_key === 'brief').length, 1);
}));

test('approve: paid / outward steps need confirmed:true (409, nothing queued); drafts do not', () => run(async (c) => {
  await c.heartbeat();
  const plan = { summary: 'Skool then posts', steps: [step('skool', 'skool-digest'), step('places', 'prospect-list', { inputs: { source: 'google_places' } }), step('free', 'prospect-list', { inputs: { source: 'osm' } })] };
  const m = await c.planned(plan);
  const before = c.pool.runs.length;
  const no = await c.approve(m.id, [{ key: 'skool' }, { key: 'places', confirmed: false }, { key: 'free' }]);
  assert.equal(no.status, 409);
  assert.equal(no.body.needs_confirmation, true);
  assert.deepEqual(no.body.keys.sort(), ['places', 'skool']);
  assert.equal(c.pool.runs.length, before, 'nothing queued');
  assert.equal((await c.get(m.id)).body.status, 'awaiting_approval');
  assert.equal((await c.approve(m.id, [{ key: 'skool', confirmed: 'yes' }])).status, 400, 'confirmed must be a real boolean');
  const yes = await c.approve(m.id, [{ key: 'skool', confirmed: true }, { key: 'places', confirmed: true }, { key: 'free' }]);
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  assert.equal(yes.body.steps.length, 3);
}));

test('approve: steps whose apps are not connected are refused (409 blocked); "without blocked steps" works; dependents of an omitted step are refused', () => run(async (c) => {
  await c.heartbeat({ leadwave: false, raven: false, rpm: true, browser: false });
  const plan = { summary: 'p', steps: [step('prospects', 'prospect-list'), step('mails', 'draft-emails', { depends_on: ['prospects'] }), step('brief', 'morning-brief')] };
  const m = await c.planned(plan);
  const blocked = await c.approve(m.id, [{ key: 'prospects' }, { key: 'mails' }, { key: 'brief' }]);
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.body.blocked, [{ key: 'prospects', missing: ['leadwave'] }]);
  assert.match(blocked.body.error, /LeadWave/);
  const orphan = await c.approve(m.id, [{ key: 'mails' }, { key: 'brief' }]);
  assert.equal(orphan.status, 400);
  assert.match(orphan.body.error, /not approved/);
  const only = await c.approve(m.id, [{ key: 'brief' }]);
  assert.equal(only.status, 200);
  assert.deepEqual(keys(only.body.steps.map((s) => ({ key: s.step_key }))), ['brief']);
}));

test('approve: no runner reported apps = nothing that needs an app can be approved; unknown / duplicate / empty step lists are 400', () => run(async (c) => {
  const m = await c.planned();
  const noRunner = await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }]);
  assert.equal(noRunner.status, 409, 'planned() claimed with apps, but an approve without stored apps must not guess');
}));

test('approve validates the step list', () => run(async (c) => {
  await c.heartbeat();
  const m = await c.planned();
  assert.equal((await c.approve(m.id, [])).status, 400);
  assert.equal((await c.approve(m.id, [{ key: 'nope' }])).status, 400);
  assert.equal((await c.approve(m.id, [{ key: 'brief' }, { key: 'brief' }])).status, 400);
  assert.equal((await c.call(U1, 'POST', `/missions/${m.id}/approve`, {}, 'jwt')).status, 400);
  assert.equal((await c.call(U1, 'POST', '/missions/not-a-uuid/approve', { steps: [{ key: 'brief' }] })).status, 404);
  const planning = (await c.create()).body;
  assert.equal((await c.approve(planning.id, [{ key: 'brief' }])).status, 409, 'cannot approve while planning');
}));

test('user scoping: user B cannot see, approve or cancel user A\'s mission, and sees none in the list', () => run(async (c) => {
  await c.heartbeat();
  const m = await c.planned();
  assert.equal((await c.get(m.id, U2)).status, 404);
  assert.equal((await c.approve(m.id, [{ key: 'brief' }], U2)).status, 404);
  assert.equal((await c.call(U2, 'POST', `/missions/${m.id}/cancel`)).status, 404);
  assert.deepEqual((await c.call(U2, 'GET', '/missions')).body.missions, []);
  assert.equal((await c.get(m.id)).body.status, 'awaiting_approval', 'untouched');
  // U2's runner cannot claim or report U1's runs
  await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }]);
  assert.deepEqual((await c.claim(U2, { runner: 'x', apps: ALL_APPS })).body, { run: null });
}));

// ───────── running: dependency gating ─────────
test('claim honours depends_on: the dependent step is handed out only after its dependency is done; upstream info travels with it', () => run(async (c) => {
  await c.heartbeat();
  const m = await c.planned();
  await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }]);
  const first = (await c.claim()).body.run;
  assert.equal(first.step_key, 'brief');
  assert.equal((await c.claim()).body.run, null, 'posts waits while brief is running');
  assert.equal((await c.report(first.id, { status: 'running' })).status, 200);
  assert.equal((await c.claim()).body.run, null, 'still waiting');
  const out = [{ name: 'brief.md', kind: 'markdown', preview: '# Brief' }];
  await c.report(first.id, { status: 'done', summary: 'ok', outbox: out });
  const second = (await c.claim()).body.run;
  assert.equal(second.step_key, 'posts');
  assert.deepEqual(second.upstream, [{ step_key: 'brief', run_id: first.id, capability: 'morning-brief', outbox: out }]);
  await c.report(second.id, { status: 'done', summary: 'ok' });
  const done = (await c.get(m.id)).body;
  assert.equal(done.status, 'done', 'mission rolls up from its steps');
  assert.ok(done.finished_at);
}));

test('independent steps are all claimable at once (parallel start); parallel claims never double-take', () => run(async (c) => {
  await c.heartbeat();
  const plan = { summary: 'three independent', steps: [step('a', 'morning-brief'), step('b', 'weekly-review'), step('c', 'rpm-sync'), step('d', 'draft-posts', { depends_on: ['a', 'b'] })] };
  const m = await c.planned(plan);
  await c.approve(m.id, plan.steps.map((s) => ({ key: s.key })));
  const claims = await Promise.all(Array.from({ length: 8 }, () => c.claim()));
  const got = claims.map((x) => x.body.run?.step_key).filter(Boolean).sort();
  assert.deepEqual(got, ['a', 'b', 'c'], 'exactly the three independent steps, each once; d is gated');
  const ids = claims.map((x) => x.body.run?.id).filter(Boolean);
  assert.equal(new Set(ids).size, 3);
  // d needs BOTH a and b
  const byKey = Object.fromEntries(claims.map((x) => x.body.run).filter(Boolean).map((r) => [r.step_key, r]));
  await c.report(byKey.a.id, { status: 'done' });
  assert.equal((await c.claim()).body.run, null, 'one of two dependencies is not enough');
  await c.report(byKey.b.id, { status: 'done' });
  assert.equal((await c.claim()).body.run.step_key, 'd');
}));

test('a failed or cancelled dependency fails the dependents automatically (transitively) and the mission fails', () => run(async (c) => {
  await c.heartbeat();
  const plan = { summary: 'chain', steps: [step('a', 'morning-brief'), step('b', 'draft-posts', { depends_on: ['a'] }), step('c', 'draft-emails', { depends_on: ['b'] }), step('z', 'weekly-review')] };
  const m = await c.planned(plan);
  await c.approve(m.id, plan.steps.map((s) => ({ key: s.key })));
  const a = (await c.claim()).body.run;
  const z = (await c.claim()).body.run;
  assert.deepEqual([a.step_key, z.step_key], ['a', 'z']);
  await c.report(a.id, { status: 'failed', summary: 'boom' });
  assert.equal((await c.claim()).body.run, null, 'nothing else is claimable');
  let got = (await c.get(m.id)).body;
  assert.deepEqual(got.steps.map((s) => [s.step_key, s.status]), [['a', 'failed'], ['b', 'failed'], ['c', 'failed'], ['z', 'running']]);
  assert.match(got.steps[1].summary, /Skipped/);
  assert.equal(got.status, 'running', 'z is still running');
  await c.report(z.id, { status: 'done' });
  got = (await c.get(m.id)).body;
  assert.equal(got.status, 'failed');
}));

test('apps gate the claim: a step whose app is not connected is never handed out, even if queued; busy_apps hold back one more', () => run(async (c) => {
  await c.heartbeat();
  const plan = { summary: 'two browser steps', steps: [step('sk', 'skool-digest'), step('up', 'upwork-scout'), step('br', 'morning-brief')] };
  const m = await c.planned(plan);
  await c.approve(m.id, plan.steps.map((s) => ({ key: s.key, confirmed: true })));
  // the browser disappears AFTER approval
  const noBrowser = { ...ALL_APPS, browser: false };
  const r1 = (await c.claim(U1, { runner: 'mac', apps: noBrowser })).body.run;
  assert.equal(r1.step_key, 'br');
  assert.equal((await c.claim(U1, { runner: 'mac', apps: noBrowser })).body.run, null, 'browser steps stay queued');
  assert.equal(c.pool.runner[U1].apps.browser, false, 'claim stores the apps it reported');
  // browser back, but one browser step already running locally: busy_apps keeps the second one back
  const first = (await c.claim(U1, { runner: 'mac', apps: ALL_APPS })).body.run;
  assert.equal(first.step_key, 'sk');
  assert.equal((await c.claim(U1, { runner: 'mac', apps: ALL_APPS, busy_apps: ['browser'] })).body.run, null);
  assert.equal(c.pool.runner[U1].apps.browser, true, 'busy_apps is never stored as "not connected"');
  assert.equal((await c.claim(U1, { runner: 'mac', apps: ALL_APPS })).body.run.step_key, 'up');
}));

test('an old runner that sends no apps is never given a step that needs an app it has not reported', () => run(async (c) => {
  await c.heartbeat({ leadwave: false, raven: false, rpm: true, browser: false });
  const plan = { summary: 'p', steps: [step('sk', 'skool-digest')] };
  const m = (await c.planned(plan));
  await c.heartbeat(ALL_APPS);
  await c.approve(m.id, [{ key: 'sk', confirmed: true }]);
  await c.heartbeat({ leadwave: false, raven: false, rpm: true, browser: false });
  assert.equal((await c.claim(U1, { runner: 'old' })).body.run, null);
}));

// ───────── cancel ─────────
test('cancel stops the mission and every queued/running run; the runner\'s next report gets 409 cancelled; done steps stay done', () => run(async (c) => {
  await c.heartbeat();
  const plan = { summary: 'p', steps: [step('a', 'morning-brief'), step('b', 'weekly-review'), step('c', 'draft-posts', { depends_on: ['a'] })] };
  const m = await c.planned(plan);
  await c.approve(m.id, plan.steps.map((s) => ({ key: s.key })));
  const a = (await c.claim()).body.run;
  const b = (await c.claim()).body.run;
  await c.report(a.id, { status: 'done' });
  const cc = await c.call(U1, 'POST', `/missions/${m.id}/cancel`);
  assert.equal(cc.status, 200);
  assert.equal(cc.body.status, 'cancelled');
  assert.deepEqual(cc.body.steps.map((s) => [s.step_key, s.status]), [['a', 'done'], ['b', 'cancelled'], ['c', 'cancelled']]);
  const late = await c.report(b.id, { status: 'done' });
  assert.equal(late.status, 409);
  assert.equal(late.body.status, 'cancelled');
  assert.equal((await c.claim()).body.run, null);
  assert.equal((await c.call(U1, 'POST', `/missions/${m.id}/cancel`)).status, 409, 'cannot cancel twice');
  assert.equal((await c.get(m.id)).body.status, 'cancelled', 'rollup does not overwrite a cancel');
}));

test('cancelling during planning cancels the planner run; cancelling the planner run cancels the mission', () => run(async (c) => {
  const m = (await c.create()).body;
  assert.equal((await c.call(U1, 'POST', `/missions/${m.id}/cancel`)).body.plan_run.status, 'cancelled');
  const m2 = (await c.create()).body;
  const planRun = c.pool.runs.find((r) => r.mission_id === m2.id);
  const cancelled = await c.call(U1, 'POST', `/agent-runs/${planRun.id}/cancel`);
  assert.equal(cancelled.status, 200);
  assert.equal((await c.get(m2.id)).body.status, 'cancelled');
}));

test('a single step cancelled by hand fails/cancels its dependents and rolls the mission up', () => run(async (c) => {
  await c.heartbeat();
  const m = await c.planned();
  const approved = (await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }])).body;
  const brief = approved.steps.find((s) => s.step_key === 'brief');
  assert.equal((await c.call(U1, 'POST', `/agent-runs/${brief.id}/cancel`)).status, 200);
  const got = (await c.get(m.id)).body;
  assert.deepEqual(got.steps.map((s) => s.status), ['cancelled', 'failed']);
  assert.equal(got.status, 'failed');
}));

// ───────── heartbeat / apps / list ─────────
test('heartbeat: write-scope token only, stores apps and the check-in time, never claims; bad apps are 400', () => run(async (c) => {
  await c.call(U1, 'POST', '/missions', { text: 'Give me my morning brief' });
  const noClaim = c.pool.runs.length;
  assert.equal((await c.call(U1, 'POST', '/agent-runs/heartbeat', { runner: 'mac', apps: ALL_APPS }, 'jwt')).status, 403);
  assert.equal((await c.call(U1, 'POST', '/agent-runs/heartbeat', { runner: 'mac', apps: ALL_APPS }, 'pat:read')).status, 403);
  assert.equal(c.pool.runner[U1], undefined);
  assert.equal((await c.heartbeat({ leadwave: 'yes' })).status, 400);
  assert.equal((await c.heartbeat([true])).status, 400);
  const ok = await c.heartbeat({ leadwave: true, rpm: true, junk: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(c.pool.runner[U1].apps, { leadwave: true, raven: false, rpm: true, browser: false }, 'unknown keys dropped, missing = false');
  assert.equal(c.pool.runs.filter((r) => r.status === 'running').length, 0, 'a heartbeat claims nothing');
  assert.equal(c.pool.runs.length, noClaim);
  const list = (await c.call(U1, 'GET', '/agent-runs')).body;
  assert.equal(list.runner.apps.leadwave, true, 'the Agents page reads apps from the runs list');
  assert.equal((await c.call(U1, 'POST', '/agent-runs/heartbeat', { runner: 'mac' }, W)).status, 200, 'apps optional: keeps the stored ones');
  assert.equal(c.pool.runner[U1].apps.leadwave, true);
}));

test('capabilities endpoint and mission list (user scoped, with step status)', () => run(async (c) => {
  await c.heartbeat();
  const cat = (await c.call(U1, 'GET', '/missions/capabilities')).body;
  assert.equal(cat.capabilities.length, 9);
  assert.equal(cat.runner.apps.rpm, true);
  const m = await c.planned();
  await c.approve(m.id, [{ key: 'brief' }, { key: 'posts' }]);
  const list = (await c.call(U1, 'GET', '/missions')).body.missions;
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].steps.map((s) => s.step_key), ['brief', 'posts']);
  assert.equal(list[0].steps[0].outbox, undefined, 'the list carries no file bodies');
}));
