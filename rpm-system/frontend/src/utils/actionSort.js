// Ordering + grouping for the My Day / My Week task lists.
// Incomplete tasks first (High→Med→Low→None), completed pushed to the bottom.

export const PRIORITY_GROUPS = [
  { key: 3, label: 'High priority', cls: 'high' },
  { key: 2, label: 'Medium priority', cls: 'med' },
  { key: 1, label: 'Low priority', cls: 'low' },
  { key: 0, label: 'No priority', cls: 'none' },
];

// Sorted copy: not-done before done, then priority desc, then manual sort_order.
export function sortActions(list) {
  return [...list].sort((a, b) => {
    if (!!a.is_completed !== !!b.is_completed) return a.is_completed ? 1 : -1;
    const pa = a.priority || 0, pb = b.priority || 0;
    if (pa !== pb) return pb - pa;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}

// Scan an ALREADY-SORTED list into contiguous groups (done → its own "Completed" group).
export function groupActions(sortedList) {
  const groups = [];
  let cur = null;
  for (const a of sortedList) {
    const gkey = a.is_completed ? 'done' : `p${a.priority || 0}`;
    if (!cur || cur.gkey !== gkey) {
      const pg = PRIORITY_GROUPS.find(g => g.key === (a.priority || 0));
      cur = {
        gkey,
        label: a.is_completed ? 'Completed' : (pg ? pg.label : 'No priority'),
        cls: a.is_completed ? 'done' : (pg ? pg.cls : 'none'),
        items: [],
      };
      groups.push(cur);
    }
    cur.items.push(a);
  }
  return groups;
}

// Two actions belong to the same drag group (same completion state + priority).
export function sameActionGroup(a, b) {
  return (!!a.is_completed === !!b.is_completed) && (a.priority || 0) === (b.priority || 0);
}
