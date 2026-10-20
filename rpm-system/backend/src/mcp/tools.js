// The hosted MCP endpoint's tools — the same ones the stand-alone rpm-mcp server offers
// (rpm-mcp/src/index.ts), as data. Each names the scope it needs and runs through RPM's own REST
// routes via `api(method, path, body)` (which throws on an HTTP error). Dates default to the
// user's own time zone (notification settings), never to a server-wide one.
const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const todayIn = (tz, offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offsetDays * 86_400_000));
const mondayOf = (date) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const enc = encodeURIComponent;

const UUID = { type: 'string', format: 'uuid' };
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' };
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const int = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const RO = { readOnlyHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const BIZ = ['leads', 'results', 'offers', 'products', 'channels', 'fixes', 'docs', 'content'];

const read = (name, title, description, inputSchema, run) => ({ name, title, description, inputSchema, annotations: RO, scope: 'mcp:read', run });
const write = (name, title, description, inputSchema, run, extra = {}) => ({ name, title, description, inputSchema, annotations: RW, scope: 'mcp:write', run, ...extra });

const TOOLS = [
  read('whoami', 'Who am I', 'The RPM user this connection belongs to.', obj({}), (a, api) => api('GET', '/api/auth/me')),
  read('list_categories', 'Life areas', 'Life areas (categories) with their ids.', obj({}), (a, api) => api('GET', '/api/categories')),
  read('list_outcomes', 'List outcomes', 'Projects (RPM outcomes: result + purpose + dates) with action and key-result counts.',
    obj({ category_id: UUID, starred: { type: 'boolean' }, include_archived: { type: 'boolean' } }),
    (a, api) => api('GET', `/api/projects${qs({ category_id: a.category_id, starred: a.starred, include_archived: a.include_archived })}`)),
  read('get_outcome', 'Get an outcome', 'One project with its key results, RPM blocks (with actions), all actions and captured items.',
    obj({ project_id: UUID }, ['project_id']), (a, api) => api('GET', `/api/projects/${enc(a.project_id)}`)),
  read('today_actions', "Today's actions", "Actions scheduled for a day (default today in your time zone) plus unfinished actions carried over from earlier days.",
    obj({ date: DATE }), async (a, api, ctx) => {
      const d = a.date || todayIn(ctx.tz);
      const [today, carried] = await Promise.all([api('GET', `/api/planner${qs({ start_date: d, end_date: d })}`), api('GET', `/api/actions/overdue${qs({ today: d })}`)]);
      return { date: d, today, carried_over: carried };
    }),
  read('week_actions', "This week's actions", "Open actions for a week: flagged 'this week' or scheduled Monday–Sunday.",
    obj({ week_start: DATE }), (a, api, ctx) => {
      const start = a.week_start || mondayOf(todayIn(ctx.tz));
      return api('GET', `/api/actions${qs({ this_week: true, start_date: start, end_date: addDays(start, 6), completed: false })}`);
    }),
  read('find_actions', 'Find actions', 'Search actions by project, block, completion and text in title/notes.',
    obj({ project_id: UUID, block_id: UUID, completed: { type: 'boolean' }, text: str() }), async (a, api) => {
      const rows = await api('GET', `/api/actions${qs({ project_id: a.project_id, block_id: a.block_id, completed: a.completed })}`);
      if (!a.text) return rows;
      const t = String(a.text).toLowerCase();
      return (Array.isArray(rows) ? rows : []).filter((r) => `${r.title} ${r.notes || ''}`.toLowerCase().includes(t));
    }),
  read('goal_forecast', 'Goal forecast', 'Pace vs target for every active key result (on track / at risk / off track).', obj({}), (a, api) => api('GET', '/api/forecast')),
  read('weekly_review', 'Weekly review', "Last 7 days done, still-open this-week items, overdue, key-result forecast and next week's schedule. No AI call.",
    obj({ week_start: DATE }), async (a, api, ctx) => {
      const today = todayIn(ctx.tz);
      const start = a.week_start || mondayOf(today);
      const since = addDays(today, -7);
      const [done, open, overdue, forecast, next] = await Promise.all([
        api('GET', `/api/actions${qs({ completed: true })}`),
        api('GET', `/api/actions${qs({ this_week: true, start_date: start, end_date: addDays(start, 6), completed: false })}`),
        api('GET', `/api/actions/overdue${qs({ today })}`),
        api('GET', '/api/forecast'),
        api('GET', `/api/planner${qs({ start_date: addDays(start, 7), end_date: addDays(start, 13) })}`),
      ]);
      return { week_start: start, completed_last_7_days: (done || []).filter((x) => x.completed_at && x.completed_at.slice(0, 10) >= since), open_this_week: open, overdue, forecast, next_week: next };
    }),
  read('business_summary', 'Business summary', 'Business cockpit: goal, cash vs goal, funnel from logged results, counts and next steps.', obj({}), (a, api) => api('GET', '/api/business/summary')),
  read('business_list', 'List Business rows', 'List rows of one Business table (leads, results, offers, products, channels, fixes, docs, content).',
    obj({ table: { type: 'string', enum: BIZ } }, ['table']), (a, api) => api('GET', `/api/business/${enc(a.table)}`)),

  write('create_outcome', 'Create an outcome', 'Create a project (RPM outcome) in a category.',
    obj({ category_id: UUID, name: str(), result: str(), purpose: str(), start_date: DATE, end_date: DATE }, ['category_id', 'name', 'result', 'purpose']),
    (a, api) => api('POST', '/api/projects', { category_id: a.category_id, name: a.name, ultimate_result: a.result, ultimate_purpose: a.purpose, start_date: a.start_date, end_date: a.end_date })),
  write('add_key_result', 'Add a key result', 'Add a measurable key result to a project.',
    obj({ project_id: UUID, title: str(), target_value: { type: 'number' }, unit: str(), target_date: DATE }, ['project_id', 'title', 'target_value']),
    (a, api) => api('POST', '/api/key-results', a)),
  write('update_key_result', 'Update a key result', 'Record progress on a key result (logged for the forecast) or mark it complete.',
    obj({ key_result_id: UUID, current_value: { type: 'number' }, is_completed: { type: 'boolean' } }, ['key_result_id']),
    (a, api) => { const { key_result_id, ...rest } = a; return api('PUT', `/api/key-results/${enc(key_result_id)}`, rest); }),
  write('create_rpm_block', 'Create an RPM block', 'Create an RPM block (a result with its purpose) inside a project.',
    obj({ project_id: UUID, result: str(), purpose: str(), target_date: DATE, key_result_id: UUID }, ['project_id', 'result']),
    (a, api) => api('POST', '/api/blocks', { project_id: a.project_id, result_title: a.result, purpose: a.purpose, target_date: a.target_date, key_result_id: a.key_result_id })),
  write('add_action', 'Add an action', 'Add an action. Pass `ref` to make it idempotent: an action already carrying that ref is returned instead of duplicated.',
    obj({ title: str(), project_id: UUID, block_id: UUID, notes: str(), scheduled_date: DATE, scheduled_time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
      duration_minutes: int(1, 1440), priority: int(0, 3), this_week: { type: 'boolean' }, ref: { type: 'string', maxLength: 80 } }, ['title']),
    async (a, api) => {
      const marker = a.ref ? `hq:${a.ref}` : '';
      if (marker) {
        const existing = await api('GET', `/api/actions${qs({ project_id: a.project_id })}`);
        const hit = (existing || []).find((x) => (x.notes || '').includes(marker));
        if (hit) return { existing: true, action: hit };
      }
      return api('POST', '/api/actions', { title: a.title, project_id: a.project_id, block_id: a.block_id, notes: [a.notes, marker].filter(Boolean).join('\n'),
        scheduled_date: a.scheduled_date, scheduled_time: a.scheduled_time, duration_minutes: a.duration_minutes, priority: a.priority, is_this_week: a.this_week });
    }),
  write('update_action', 'Edit an action', 'Edit an action (title, notes, date, priority, this-week flag, duration). Pass scheduled_date: null to unschedule.',
    obj({ action_id: UUID, title: str(), notes: str(), scheduled_date: { type: ['string', 'null'] }, priority: int(0, 3), this_week: { type: 'boolean' }, duration_minutes: int(1, 1440) }, ['action_id']),
    (a, api) => { const { action_id, this_week, ...rest } = a; return api('PUT', `/api/actions/${enc(action_id)}`, { ...rest, ...(this_week === undefined ? {} : { is_this_week: this_week }) }); }),
  write('complete_action', 'Complete an action', 'Mark an action done (or reopen it with completed: false).',
    obj({ action_id: UUID, completed: { type: 'boolean', default: true } }, ['action_id']),
    (a, api) => api('PUT', `/api/actions/${enc(a.action_id)}`, { is_completed: a.completed !== false })),
  write('capture', 'Capture an idea', 'Drop an idea into the capture list (optionally on a project).',
    obj({ title: str(), notes: str(), project_id: UUID }, ['title']), (a, api) => api('POST', '/api/capture-items', a)),
  write('link_dependency', 'Link a dependency', 'Make an action depend on another action.',
    obj({ action_id: UUID, depends_on_action_id: UUID }, ['action_id', 'depends_on_action_id']),
    (a, api) => api('POST', `/api/actions/${enc(a.action_id)}/dependencies`, { depends_on_action_id: a.depends_on_action_id })),
  write('business_upsert', 'Save a Business row', 'Create (no id) or update (with id) one Business row. Fields follow the RPM Business schema (e.g. leads: name, source, why, offer, stage, next_step, next_contact, fit, notes).',
    obj({ table: { type: 'string', enum: BIZ }, id: UUID, fields: { type: 'object' } }, ['table', 'fields']),
    (a, api) => (a.id ? api('PUT', `/api/business/${enc(a.table)}/${enc(a.id)}`, a.fields) : api('POST', `/api/business/${enc(a.table)}`, a.fields))),
  write('log_result', 'Log a sales result', 'Log a sales result (DM sent, reply, call booked, proposal, deal won …) in RPM Business. Does not change cash; use update_key_result for that.',
    obj({ type: { type: 'string', enum: ['dm_sent', 'proposal', 'reply', 'call', 'delivered', 'case_study', 'won', 'lost', 'content', 'note'] }, channel: str(), lead_id: UUID,
      count: { type: 'integer' }, value_eur: { type: 'number' }, note: str(), date: DATE }, ['type']),
    (a, api) => api('POST', '/api/business/results', a)),
  write('lead_follow_up', 'Follow up a lead', "Create an RPM action to follow up a Business lead (uses the lead's next_contact date).",
    obj({ lead_id: UUID }, ['lead_id']), (a, api) => api('POST', `/api/business/leads/${enc(a.lead_id)}/follow-up`, {})),
  write('delete_action', 'Delete an action', 'Permanently delete an action. Requires confirm: true, only after the user explicitly agreed.',
    obj({ action_id: UUID, confirm: { type: 'boolean', const: true } }, ['action_id', 'confirm']),
    (a, api) => api('DELETE', `/api/actions/${enc(a.action_id)}`), { annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }, confirm: true }),
];

const toolByName = (name) => TOOLS.find((t) => t.name === name);
module.exports = { TOOLS, toolByName, todayIn, mondayOf, addDays };
