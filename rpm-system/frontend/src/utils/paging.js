// Paging for long lists (Today's actions, Carried over): fixed-size pages you swipe between
// instead of a list that grows forever, a search box, and the most important items first.
// Pure — unit-tested in paging.test.js.

export function paginate(items, size) {
  const n = Math.max(1, size | 0);
  const pages = [];
  for (let i = 0; i < items.length; i += n) pages.push(items.slice(i, i + n));
  return pages.length ? pages : [[]];
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
// Every word of the query must appear somewhere in the item's text.
export function searchItems(items, query, textOf) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter(it => { const t = fold(textOf(it)); return words.every(w => t.includes(w)); });
}

// A reorder inside one page, merged back into the full order (pages are contiguous slices).
export function mergePageOrder(allIds, offset, pageIds) {
  return [...allIds.slice(0, offset), ...pageIds, ...allIds.slice(offset + pageIds.length)];
}

// Most important first: starred / high priority, then the longest overdue.
export function rankCarried(list) {
  return [...list].sort((a, b) =>
    (Number(!!b.is_starred) - Number(!!a.is_starred))
    || ((b.priority || 0) - (a.priority || 0))
    || ((Number(b.days_late) || 0) - (Number(a.days_late) || 0)));
}
export const isTop = (a) => !!a.is_starred || Number(a.priority) === 3;
