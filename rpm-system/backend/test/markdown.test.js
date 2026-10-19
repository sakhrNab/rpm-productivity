const test = require('node:test');
const assert = require('node:assert/strict');
const { toEmailHtml, toTelegramHtml, toPlainText } = require('../src/markdown');

// The real check-in from the 2026-10-19 email (screenshot): ** showed literally.
const CHECKIN = `**Weekly check-in — Financial Ind. · week of Oct 19**

Where you stand: one task in the system, **"Write 10 Possible Clients," 2 days late** and unscheduled. Your goal is $100k in 6 months — roughly **$4,100/week** — and nothing is scheduled.

Three proposed commitments:
1. **Mon Oct 19** — Finish and rank the 10-client list (closes the overdue task).
2. **Tue Oct 20** — Send the first 5 outreach messages (90 min, high priority).
3. **Wed Oct 21** — 30-min cash-flow snapshot.

## What's next
- one
- *two*

What's your current monthly income, and from where?`;

test('email: no raw ** or # survive; bold, lists and headings become HTML', () => {
  const html = toEmailHtml(CHECKIN);
  assert.doesNotMatch(html, /\*\*|(^|>)#/);
  assert.match(html, /<b>Weekly check-in — Financial Ind\. · week of Oct 19<\/b>/);
  assert.match(html, /<b>\$4,100\/week<\/b>/);
  assert.match(html, /<ol[^>]*><li[^>]*><b>Mon Oct 19<\/b> — Finish/);
  assert.equal((html.match(/<li/g) || []).length, 5);
  assert.match(html, /<p[^>]*>What&#39;s next<\/p>/);
  assert.match(html, /<i>two<\/i>/);
  assert.match(html, /&quot;Write 10 Possible Clients,&quot;/);   // quotes escaped, still bold
});

test('telegram: only b/i/code/a tags; lists become bullet / numbered lines', () => {
  const tg = toTelegramHtml(CHECKIN);
  assert.doesNotMatch(tg, /\*\*/);
  assert.doesNotMatch(tg, /<(?!\/?(b|i|code|a)\b)[a-z]/i);
  assert.match(tg, /^1\. <b>Mon Oct 19<\/b>/m);
  assert.match(tg, /^• one$/m);
  assert.match(tg, /^<b>What&#39;s next<\/b>$/m);
});

test('plain text: markers stripped, structure kept', () => {
  const t = toPlainText(CHECKIN);
  assert.doesNotMatch(t, /\*\*|^#/m);
  assert.match(t, /^Weekly check-in — Financial Ind\. · week of Oct 19$/m);
  assert.match(t, /roughly \$4,100\/week —/);
  assert.match(t, /^2\. Tue Oct 20 — Send/m);
  assert.match(t, /^• two$/m);
  assert.match(t, /What's your current monthly income/);
});

test('safe: HTML from the model is escaped; only http(s) links become links', () => {
  const html = toEmailHtml('<script>alert(1)</script> **x** [ok](https://rpm.aiwaverider.com) [bad](javascript:alert(1))');
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/rpm\.aiwaverider\.com"[^>]*>ok<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(toPlainText('see [the plan](https://x.io/p)'), /see the plan \(https:\/\/x\.io\/p\)/);
});

test('money, math and snake_case are not mistaken for emphasis', () => {
  const t = toEmailHtml('Costs $5 * 3 = $15 and file_name_here stays; 2*3*4 too.');
  assert.doesNotMatch(t, /<i>/);
});
