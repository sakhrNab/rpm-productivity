# Business — "Mission Flow" design brief

Ambition: **TRANSFORM** (owner: "very very lousy", "ignores our futuristic design", "shiny connected lines
showing where things go and come from", "where are the Agents page, dashboards and the missing pages").
The incumbent layout (tab strip + stacked text cards + checklist pages) is disqualified.

## 1 · What this screen is

Business is a **live circuit of the money**. Its spine is one horizontal flow canvas — *Sources → Pipeline →
Outcomes → Cash → Goal* — where every channel, stage, result type, the cash key result and the goal are glowing
nodes joined by animated gradient connectors whose thickness is the volume that actually flows through them.
Hovering or selecting any node lights its whole upstream and downstream path and dims the rest, so "where does
this come from and where does it go" is answered by light, not by reading. Beside the canvas runs an
**intelligence rail**: *Next best moves*, ranked from the data (overdue follow-ups, leads stuck in a stage,
the funnel step that is furthest behind the revenue model, P0 fixes that block an offer, cash pace vs the
deadline), each with one button that does the move. Every other Business page is a **lens** on one segment
of the circuit: the page header is the same circuit rail with the current segment lit, and inside the page
the entities draw their own links — leads flow between stage lanes of a drag board, fixes wire into the
offers they block, products into the offers they power, revenue-model channels pour into the cash target,
agent runs pour their outbox into leads and results. On a phone the circuit turns 90° and flows downward.

## 2 · Archetype and references

- ui-ux-pro-max: *CRM & client management → Sales Intelligence Dashboard*; *Drill-Down Analytics*
  (summary-to-detail flow, context preservation, deep links); *HUD / Sci-Fi FUI* only for line work (glow,
  fine line drawing) — palette stays RPM's.
- References: n8n / Node-RED canvases (nodes + wires), Stripe Sigma money-flow (Sankey-weighted links),
  Linear's board (drag between lanes, keyboard first, undo toast), Superhuman command bar (`N` quick add).

## 3 · Concepts considered (step 3)

| | Concept | Primary layout mechanism | Reference |
|---|---|---|---|
| **A — winner** | **Mission Flow**: node canvas Sources→Pipeline→Outcomes→Cash→Goal with weighted animated connectors + intelligence rail; sub-pages are lenses that draw their own entity links | **node graph / flow canvas** | n8n, Stripe money flow |
| B | Split Cockpit: full-height kanban board of leads left, AI "intelligence rail" right, everything else in drawers | **split pane (board + rail)** | Pipedrive + Superhuman |
| C | Countdown Spine: one vertical timeline from today to the deadline, every lead contact / fix / post / deal plotted on it | **timeline / single-object focus** | boarding pass, Things "Upcoming" |

**Why A:** the owner's words name the mechanism ("connected lines showing where things go and come from") and
only A makes connection the structure rather than decoration. B is excellent for the leads job but leaves
offers/fixes/products/revenue as unrelated drawers — the "disconnected boxes" defect returns. C answers
"when" but not "from where to where", and 13 leads with no dates (the real data) leave the timeline empty.
A absorbs B's best mechanism where it belongs (the Leads lens *is* a drag board) and C's (the Content lens is a
date strip; the countdown sits on the Goal node). Losers: **B, C**.

## 4 · Experience principles

1. **Light = relationship.** A line exists only where data links two things; its thickness is volume; it
   animates only while something flows; hovering lights the path.
2. **Every number has a next move.** No metric without the button that changes it.
3. **Zero is silent.** Zero counters, empty funnels and empty sections collapse into one smart empty state
   that offers the template / agent / quick-add that fills them.
4. **Edit where you read.** Inline edit, drag, keyboard; the modal is for long-form only.
5. **Instant and reversible.** Optimistic updates, undo toast for moves and deletes.

## 5 · Behaviour contract (must survive)

- Routes `/business` and `/business/:view` for overview, leads, results, offers, revenue, products, channels,
  fixes, library, content, **+ agents**; unknown view → overview.
- All writes through existing `/api/business` routes (CRUD, settings, template, lead follow-up → RPM action,
  fix → RPM action). Won deal → confirm before adding to the cash key result.
- Start from template (all / per section), "Start empty — link my goal" goal settings (project, cash KR,
  deadline, currency).
- Revenue model edit + save; low/base/high scenarios vs cash target.
- Content status cycle; fixes done toggle + show done; docs open URL in new tab.
- Every modal in the shared shell (`ModalHead`, `.modal-header/.modal-body/.modal-footer.mk-foot`), Picker
  everywhere, never a native `<select>`.
- Phone: page switch reachable without the desktop strip; bottom-sheet modals; voice-orb clearance.
- New: Agents view — queue jobs, live runs (poll 5 s), cancel, run detail (summary markdown, outbox,
  Add to leads / Log result), runner seen-recently pill. RPM never executes a job.

## 6 · Diagnosed defects → acceptance evidence (the new form must make these impossible)

Measured on the BEFORE shots (`before/*.png`, real owner data: 13 leads, 4 offers, 7 products, 5 channels,
19 fixes, 20 docs, 1 result, goal "First €1,500 by 29 Nov", cash €250/€1,500):

1. **Disconnected boxes** — Overview is goal card + funnel card + next-steps card + a row of count tiles; no
   element shows how a lead becomes cash. → the canvas links every stage to the next.
2. **Zero noise** — five empty funnel bars all reading `0`; tiles reading `0 Posts`. → zero is silent.
3. **One fact repeated per row** — every lead card repeats the same Stage picker + native date field +
   "Add follow-up to RPM" button (13×), leads page is 2,032 px tall at 1440 and 5,336 px at 390. → board lanes,
   compact cards, actions on focus/drawer.
4. **Native date inputs** (`dd.mm.yyyy` OS chrome) on cards and in the editor. → styled date chips with quick
   picks (Today / +2d / +1w / clear) inside the app's own popover.
5. **Pipeline is a filter, not a structure** — stage is a pill filter over a card grid; nothing moves. →
   drag between lanes, keyboard move (`Shift+←/→`), undo.
6. **Invisible blockers** — 5 P0 fixes listed on a separate 2,528 px checklist; nothing says which offer
   they block. → fix→offer wires (explicit link + suggested by product name), P0 blockers surface in Next moves.
7. **Offers as a 3,855 px wall of text** at 1440. → offer sheets: promise + readiness meter + ladder visible,
   long fields folded, blockers wired in.
8. **11 equal tabs** with no hierarchy. → the circuit rail: flow segments (Channels → Leads → Results →
   Revenue) vs the arsenal (Offers, Products, Fixes, Content, Library) vs Agents.
9. **No intelligence** — "Next steps" is a date-sorted merge of four lists. → ranked Next best moves with
   one-click actions, computed server-side (`moves` in `/summary`) and refreshed after every write.
10. **Missing Agents page.** → Agents view in Business.
11. **Editor modal**: a flat two-column form where 8 of 9 labels say OPTIONAL, unstyled footer. → grouped
    sections, required-only marks, `mk-foot` footer, date chips.

## 7 · Gate

Independent critic receives before + after + this brief and answers first: *redesign or touch-up?*
Exit: gate passed + two consecutive rounds with no must-fix; no horizontal overflow at 390/1440; no native
select; visible keyboard focus; AA contrast on text.
