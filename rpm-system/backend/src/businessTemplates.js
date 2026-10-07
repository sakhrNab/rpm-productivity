// "Start from a template": generic sample rows a new user can edit or delete. Nothing personal —
// these describe an imaginary one-person service business so every page has something to show.

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const TEMPLATES = {
  leads: [
    { name: 'Sample: Jane Doe (real-estate agent)', source: 'Community', why: 'Gets many inbound inquiries by email', offer: 'Free pilot → case study', stage: 'identified', next_step: 'Send a short DM offering a free pilot', next_contact: inDays(1), fit: 3 },
    { name: 'Sample: Acme Dental', source: 'Cold list', why: 'Booking requests arrive by email', offer: 'Starter install', stage: 'contacted', next_step: 'Follow up on the first email', next_contact: inDays(3), fit: 2 },
    { name: 'Sample: Partner agency', source: 'Referral', why: 'Has clients who need what you build', offer: 'White-label partnership', stage: 'replied', next_step: 'Book a 20-minute call', next_contact: inDays(2), fit: 3 },
  ],
  results: [
    { type: 'dm_sent', channel: 'community', count: 5, note: 'Sample: first round of DMs', date: today() },
    { type: 'reply', channel: 'community', count: 1, note: 'Sample: one reply', date: today() },
  ],
  offers: [
    {
      name: 'Sample: Free pilot → install', tagline: 'Prove it on their own data before they pay.', for_who: 'Small businesses with a clear, repeated pain', product: 'Your main product',
      readiness: 'warn', readiness_note: 'Run it once on yourself first',
      value: { dream: 'The pain is gone', likelihood: 'They see it working on their own data', time: 'First result in 72 hours', effort: 'One short kick-off call' },
      ladder: [{ step: 'Pilot', price: '€0', note: 'Proof asset for you' }, { step: 'Install', price: '€990', note: 'Setup' }, { step: 'Run', price: '€290 / month', note: 'Managed' }],
      guarantee: 'If the pilot shows no clear win, they owe nothing.', bonuses: ['A short report of what you found'], scarcity: '3 pilots per month',
      deliverables: [{ when: 'Day 0', what: 'Kick-off', form: 'Call' }, { when: 'Day 3', what: 'Pilot report', form: 'PDF + walkthrough' }],
      first_line: 'How long does it take you to … today?', qualify: 'Do they have the pain every week?', weak_spots: ['Unproven on a real customer yet'], sort: 1,
    },
  ],
  products: [
    { name: 'Sample: Main product', what: 'What it does in one line', role: 'paid', promised: false, status: 'Built, not yet sold', price: '€990 + €290/mo', blocker: 'No case study yet', next_step: 'Run the first pilot', next_date: inDays(7), sort: 1 },
    { name: 'Sample: Free tool', what: 'A small gift that builds the audience', role: 'gift', promised: true, status: 'Live', price: 'Free', blocker: '', next_step: 'Share it in the community', next_date: inDays(10), sort: 2 },
  ],
  channels: [
    { name: 'Sample: Marketplace (e.g. Upwork)', stat: '0 jobs yet', audience: 'Buyers with a defined job and budget', verdict: 'Buyer intent today', tone: 'ok', gaps: ['No reviews yet'], moves: ['5 proposals per week'], sort: 1 },
    { name: 'Sample: Social', stat: 'Followers: —', audience: 'Creators and the curious', verdict: 'Audience, not buyers', tone: 'warn', gaps: ['No business-pain content'], moves: ['Post one proof story per week'], sort: 2 },
  ],
  fixes: [
    { severity: 'P0', text: 'Sample: Take one real payment end-to-end', detail: 'Prove checkout works before you sell', effort: '30 min', sort: 1 },
    { severity: 'P1', text: 'Sample: Write the first case study', detail: 'After the first pilot', effort: '2 h', sort: 2 },
  ],
  docs: [
    { path: 'Sample: plan/revenue-plan.md', status: 'current', note: 'Where the plan lives', date: today() },
  ],
  content: [
    { date: inDays(2), platform: 'TikTok', title: 'Sample: Behind the scenes of a pilot', goal: 'proof', hook: 'I answered 200 emails in 2 minutes', status: 'idea' },
    { date: inDays(5), platform: 'Community', title: 'Sample: Weekly progress post', goal: 'community', hook: 'What worked this week', status: 'draft' },
  ],
};

// Revenue model channels: volume of units by the deadline × % that convert × € per deal.
const templateModel = () => [
  { id: 'warm', name: 'Referrals + partners', unit: 'conversations', volume: 20, convert: 4, ticket: 990, startsWeek: 2, note: 'Sample — replace with your own guess, then measure' },
  { id: 'marketplace', name: 'Marketplace proposals', unit: 'proposals', volume: 25, convert: 3, ticket: 600, startsWeek: 1, note: 'Sample' },
  { id: 'cold', name: 'Cold email', unit: 'contacts', volume: 600, convert: 0.1, ticket: 990, startsWeek: 4, note: 'Sample' },
];

module.exports = { TEMPLATES, templateModel };
